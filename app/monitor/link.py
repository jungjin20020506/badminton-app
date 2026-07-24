"""
Serial client for the KNK TinyUK3 console (default COM5, 115200 8N1).

바탕화면 KNKMonitor 의 knk_serial.py 를 그대로 옮긴 것. pyserial 이 없는
환경(예: Vercel 시연 배포)에서도 프로그램 전체가 죽지 않도록 import 만
가드를 씌웠다 — 그 경우 포트 목록은 비고, 연결 시도에서 안내 메시지가 나간다.

Safety notes, straight from the firmware:

  * CConsol::Process() switches into binary pattern-download mode the instant
    it sees a 0xFF byte, and a completed download OVERWRITES the machine's
    system pattern file. Every byte we transmit is therefore forced to ASCII
    and 0xFF is refused outright.
  * DO / RTP / ASW / GCS / DA / IDA / MOTOR drive real relays, supplies and
    steppers. They are tagged unsafe here and the UI gates them behind an
    explicit opt-in.
"""

import threading
import time

try:
    import serial
    from serial.tools import list_ports
    SERIAL_AVAILABLE = True
except ImportError:          # pyserial 미설치 — 수집/콘솔만 비활성
    serial = None
    list_ports = None
    SERIAL_AVAILABLE = False

DEFAULT_PORT = "COM5"
DEFAULT_BAUD = 115200
PROMPT = "TinyUK3 > "

# KNK터미널(KNKT.exe) Configuration 과 같은 통신 파라미터 —
# 화면/INI 의 표기(8, none, 1, rtscts ...)를 pyserial 상수로 옮긴다.
NEWLINES = {"cr": "\r", "lf": "\n", "crlf": "\r\n"}

if SERIAL_AVAILABLE:
    BYTESIZES = {5: serial.FIVEBITS, 6: serial.SIXBITS,
                 7: serial.SEVENBITS, 8: serial.EIGHTBITS}
    PARITIES = {"none": serial.PARITY_NONE, "odd": serial.PARITY_ODD,
                "even": serial.PARITY_EVEN, "mark": serial.PARITY_MARK,
                "space": serial.PARITY_SPACE}
    STOPBITS = {1: serial.STOPBITS_ONE, 2: serial.STOPBITS_TWO}
else:                                   # pyserial 미설치 — 설정 화면만 동작
    BYTESIZES, PARITIES, STOPBITS = {}, {}, {}

_PARITY_LETTER = {"none": "N", "odd": "O", "even": "E",
                  "mark": "M", "space": "S"}

# Commands that only read state -- safe to fire at any time.
SAFE_COMMANDS = [
    ("SYSCFG", "시스템 설정 조회"),
    ("NETCFG", "네트워크 설정 조회"),
    ("PATTERN", "검사 패턴 조회"),
    ("SPEC", "검사 스펙 조회"),
    ("RESULT", "최근 결과 조회"),
    ("FUNC", "검사 함수 목록"),
    ("CARD", "장착 카드 목록"),
    ("DI", "디지털 입력 상태"),
    ("DO", "디지털 출력 상태"),
    ("GPIO", "전체 GPIO 상태"),
    ("CURRENT", "전원 모듈 전류"),
    ("TIME", "장비 RTC 시각"),
    ("SET COUNTER", "OK/NG/TOTAL 카운터"),
    ("HELP", "명령 도움말"),
]

# Commands that actuate hardware or change machine state.
UNSAFE_COMMANDS = [
    ("START", "검사 시작 (지그가 작동합니다)"),
    # 실기 확인(2026-07-22): RESET = Test User Break(검사 중단, 재부팅 없음).
    # RST 는 시스템 리셋(재부팅)이므로 버튼에서 제외.
    ("RESET", "검사 중단 (Test User Break)"),
    ("SKIP", "패턴 에러 무시하고 계속"),
    ("REBOOT", "장비 재부팅"),
    ("SET COUNTER RESET", "카운터 초기화 (되돌릴 수 없음)"),
]

# 첫 토큰만으로 '장비가 실제로 움직이는 명령'을 판별하는 목록.
# DO/GPIO/GCS 는 인자가 붙을 때만 출력을 바꾸므로 별도 처리(is_unsafe 참고).
_UNSAFE_HEADS = {"START", "RESET", "RST", "REBOOT", "SKIP",
                 "DA", "IDA", "MOTOR", "RTP", "ASW", "ON", "OFF"}


def is_unsafe(command):
    """장비를 실제로 구동하거나 상태를 파괴적으로 바꾸는 명령인지 판별."""
    u = " ".join((command or "").upper().split())
    if not u:
        return False
    parts = u.split()
    head = parts[0]
    if u.startswith("SET COUNTER RESET"):
        return True
    if head in _UNSAFE_HEADS:
        return True
    if head == "DO" and len(parts) >= 2:          # 'DO' 단독은 조회
        return True
    if head.startswith("GPIO") and len(parts) >= 3:   # 'GPIOA 3 1' 은 출력 설정
        return True
    if head == "GCS" and len(parts) >= 3:
        return True
    return False


def unsafe_tip(command):
    """확인 대화상자에 보여줄 설명 문구."""
    u = " ".join((command or "").upper().split())
    for cmd, tip in UNSAFE_COMMANDS:
        if u == cmd or u.startswith(cmd + " "):
            return tip
    head = u.split()[0] if u else ""
    if head == "DO":
        return "디지털 출력(릴레이/솔레노이드)이 실제로 동작합니다."
    if head.startswith("GPIO"):
        return "GPIO 출력이 실제로 바뀝니다."
    if head in ("RTP", "ASW", "GCS"):
        return "젠더 보드 릴레이/스위치가 실제로 동작합니다."
    if head == "MOTOR":
        return "스테핑 모터가 실제로 구동됩니다."
    return "장비 하드웨어가 실제로 동작합니다."


def list_serial_ports():
    """[(device, description), ...] for every COM port present."""
    if not SERIAL_AVAILABLE:
        return []
    return [(p.device, p.description) for p in list_ports.comports()]


class UnsafePayload(Exception):
    """Raised when a command would put the machine into download mode."""


class KNKSerial:
    """Line-oriented client for the TinyUK3 console.

    Incoming bytes are handed to `on_data` as decoded text from a reader
    thread; parsing is the caller's business.
    """

    def __init__(self, port=DEFAULT_PORT, baud=DEFAULT_BAUD, on_data=None,
                 on_status=None, databits=8, parity="none", stopbits=1,
                 flow="none", tx_newline="crlf"):
        if not SERIAL_AVAILABLE:
            raise RuntimeError(
                "pyserial 이 설치되어 있지 않습니다. 이 PC에서 "
                "'pip install pyserial' 후 다시 시도하세요.")
        self.port = port
        self.baud = baud
        # 터미널 설정(⚙)에서 내려오는 값 — 기본은 KNK터미널과 같은 8-N-1, 흐름제어 없음
        self.databits = int(databits or 8)
        self.parity = str(parity or "none").lower()
        self.stopbits = int(stopbits or 1)
        self.flow = str(flow or "none").lower()
        self.tx_newline = str(tx_newline or "crlf").lower()
        self.on_data = on_data or (lambda text: None)
        self.on_status = on_status or (lambda text: None)
        self._ser = None
        self._reader = None
        self._stop = threading.Event()
        self._tx_lock = threading.Lock()

    # -- connection ---------------------------------------------------------
    @property
    def is_open(self):
        return self._ser is not None and self._ser.is_open

    def open(self):
        if self.is_open:
            return
        if self.databits not in BYTESIZES:
            raise RuntimeError(
                f"데이터 비트 {self.databits} 는 Windows 시리얼 드라이버가 "
                "지원하지 않습니다. 설정(⚙)에서 5~8 중 하나를 고르세요.")
        self._ser = serial.Serial(
            port=self.port, baudrate=self.baud,
            bytesize=BYTESIZES[self.databits],
            parity=PARITIES.get(self.parity, serial.PARITY_NONE),
            stopbits=STOPBITS.get(self.stopbits, serial.STOPBITS_ONE),
            timeout=0.2, write_timeout=2.0,
            rtscts=(self.flow == "rtscts"), dsrdtr=False,
            xonxoff=(self.flow == "xonxoff"),
        )
        self._stop.clear()
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()
        frame = (f"{self.databits}{_PARITY_LETTER.get(self.parity, 'N')}"
                 f"{self.stopbits}")
        self.on_status(f"{self.port} 연결됨 ({self.baud} {frame})")
        # The console says nothing until spoken to, so a freshly opened port
        # looks dead. Nudge it with an empty command -- the firmware answers
        # with a bare prompt, which is proof of life for the operator.
        try:
            self.send("")
        except (serial.SerialException, OSError):
            pass

    def close(self):
        self._stop.set()
        if self._reader is not None:
            self._reader.join(timeout=1.0)
            self._reader = None
        if self._ser is not None:
            try:
                self._ser.close()
            finally:
                self._ser = None
        self.on_status("연결 해제됨")

    # -- io -----------------------------------------------------------------
    def _read_loop(self):
        buf = bytearray()
        while not self._stop.is_set():
            try:
                chunk = self._ser.read(4096)
            except (serial.SerialException, OSError) as exc:
                self.on_status(f"수신 오류: {exc}")
                break
            if not chunk:
                # Idle. Anything still buffered is a line the machine never
                # terminated -- the "TinyUK3 > " prompt has no trailing \n --
                # so release it instead of holding it until the next newline.
                if buf:
                    self.on_data(bytes(buf).decode("cp949", errors="replace"))
                    buf.clear()
                continue
            buf.extend(chunk)
            # Hand over complete lines; keep any partial tail for next round.
            *lines, tail = buf.split(b"\n")
            buf = bytearray(tail)
            if lines:
                text = b"\n".join(lines).decode("cp949", errors="replace") + "\n"
                self.on_data(text)

    @staticmethod
    def _encode(command):
        """Encode a console command, refusing anything that could trip
        the firmware's 0xFF download trigger."""
        payload = command.encode("ascii", errors="strict")
        if 0xFF in payload:
            raise UnsafePayload("0xFF 바이트는 장비를 패턴 다운로드 모드로 "
                                "전환시키므로 전송할 수 없습니다.")
        return payload

    def send(self, command):
        """Send one console command, terminated with the configured newline.

        줄바꿈은 설정(⚙)의 'Transmit New Line' 값을 따른다. 기본은 CR+LF —
        TinyUK3 펌웨어가 CR+LF 로 명령을 받아야 프롬프트를 돌려준다.
        """
        if not self.is_open:
            raise RuntimeError("포트가 열려 있지 않습니다.")
        try:
            payload = self._encode(command.strip())
        except UnicodeEncodeError as exc:
            raise UnsafePayload(f"ASCII 로 변환할 수 없는 문자입니다: {exc}") from exc

        eol = NEWLINES.get(self.tx_newline, "\r\n").encode("ascii")
        with self._tx_lock:
            self._ser.write(payload + eol)
            self._ser.flush()
