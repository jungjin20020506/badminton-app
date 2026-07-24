"""
KNK 모니터 — 서버 상주 시리얼 세션 관리자 (검사기 최대 3대 동시 지원).

tkinter 판 KNKMonitor(바탕화면 KNKMonitor 폴더)의 수집·상태 로직을 웹 서버
안으로 옮긴 것. 슬롯(1~3번 검사기)마다 독립된 시리얼 연결·수신 버퍼·검사
결과를 가지며, 브라우저는 /api/monitor/poll 로 세 슬롯을 한 번에 가져간다.

사이클 확정 규칙(tkinter 판과 동일):
  · '$$&' 요약 블록 끝     → 즉시 확정
  · '$$@' 요약 블록 시작   → 확정 보류(요약이 오는 중)
  · '$$E' 스트림 끝        → 1.5초 안에 '$$@' 가 없으면 확정
    (STERI 700 처럼 요약 블록을 안 보내는 장비 대응)
"""

import csv
import datetime as dt
import io
import json
import os
import re
import threading
import time

from app.monitor import protocol as proto
from app.monitor import status as knk_status
from app.monitor.link import (DEFAULT_BAUD, DEFAULT_PORT, SAFE_COMMANDS,
                              SERIAL_AVAILABLE, UNSAFE_COMMANDS, KNKSerial,
                              UnsafePayload, is_unsafe, list_serial_ports,
                              unsafe_tip)

_lock = threading.RLock()      # 전역 상태(세션 생성, io_quiet) 보호

# 세션 번호 — 0 은 점검용(I/O 테스트·콘솔 전용), 1~3 은 터미널 검사기 슬롯.
# 서로 완전히 독립된 시리얼 연결이라 터미널과 I/O 테스트가 충돌하지 않는다.
SLOTS = (0, 1, 2, 3)


def slot_name(slot):
    return "점검용(I/O)" if slot == 0 else f"{slot}번 검사기"

# I/O 조회 잡음 숨김 — DO 토글마다 명령 에코·'DI/DO Status' 응답·빈 프롬프트가
# 터미널/저장 로그에 쏟아지는 것을 막는다. 램프 갱신용 파싱은 원문 그대로
# 수행하고, '표시·저장'에서만 걸러낸다. (I/O 테스트 탭의 토글로 해제 가능)
_io_quiet = True
_IO_CHATTER = re.compile(
    r"^\s*(TinyUK3\s*>\s*)?(DI|DO)(\s+\d+\s+\d+)?\s*$"   # 프롬프트+명령 에코
    r"|^\s*D[IO]\s+Status\s*:.*$"                        # DI/DO 상태 응답(전환 표시 포함)
    r"|^\s*TinyUK3\s*>\s*$")                             # 빈 프롬프트 라인
_IO_CMD = re.compile(r"^(DI|DO)(\s+\d+\s+\d+)?$", re.IGNORECASE)

_EVENT_KEEP = 4000             # 슬롯별 이벤트 개수 상한(브라우저 폴링용 큐)
                               # — 검사 종료 직후처럼 한꺼번에 쏟아질 때
                               #   폴링(0.7초) 사이에 화면 줄이 잘리지 않도록 넉넉히
_CAPTURE_MAX = 10 * 1024 * 1024   # 디스크를 못 쓸 때만 쓰는 메모리 폴백 상한

# ---------------------------------------------------------------- 터미널 설정
# KNK터미널(KNKT.exe) Configuration 창과 같은 항목·같은 기본값(KNKT.INI 기준).
# 한 항목만 다르다 — tx_newline: KNKT 기본은 LF 지만 TinyUK3 는 CR+LF 라야 응답한다.
# (KNKT 도 빠른명령 문자열에 \r\n 을 직접 붙여 써서 실질적으로 CR+LF 로 보낸다)
DEFAULT_SETTINGS = {
    "comm_type": "serial",          # serial | udp | tcp (현재 serial 만 동작)
    "port": DEFAULT_PORT,
    "baud": DEFAULT_BAUD,
    "databits": 8,
    "parity": "none",               # none|odd|even|mark|space
    "stopbits": 1,                  # 1|2
    "flow": "none",                 # none|rtscts|xonxoff
    "ip": "127.0.0.1",
    "net_port": 20000,
    "scrollback": 0,                # 0 = 무한대(수신 로그를 디스크에 그대로 기록)
    "local_echo": False,            # 장비가 명령을 되돌려 주므로 KNKT 와 같이 기본 해제
    "rx_newline": "lf",             # cr|lf|crlf
    "tx_newline": "crlf",
    "hex2bin": True,
    "use_download_menu": False,
    "loader_pw": "",
    "remove_color": False,          # 저장·표시에서 $Fx 색상코드 제거
    "font_size": 10,                # pt (KNKT.INI FontSize)
    # 화면 배색 — KNK터미널과 같은 검은 바탕. $F0~$FF 16색은 화면에서
    # 직접 고칠 수 있다(설정 ⚙ → 화면 배색). 아래는 KNKT.exe 화면을 보고
    # 맞춘 기본값 — $F1 NG·스펙 / $F4 RF SELECT / $F6 OK·IC-F / $F9 POWER / $FF 기본
    # 반자동 시작 — 제품을 올려 진공이 잡히면 자동으로 START 를 보낸다.
    # 진공 신호를 어디서 읽을지(장비마다 다름)는 설정에서 바꾼다.
    "auto_src": "do",               # di | do  (오토베큠 출력은 보통 DO)
    "auto_ch": 2,                   # 채널 번호 1~16 (기본 CH02 VACUUM)
    "auto_active": "low",           # high | low — 진공 ON 일 때의 신호 레벨
    "auto_delay": 1.0,              # 진공 감지 후 첫 명령까지 대기(초)
    # 감지 후 실행할 명령 순서 — 지그에 따라 실린더 동작 등을 앞에 넣을 수 있다.
    # wait = 그 명령을 보낸 뒤 다음 단계까지 기다릴 시간(초)
    "auto_steps": [{"cmd": "START", "wait": 0.0}],
    "screen_bg": "#0a0e13",
    "palette": {
        "0": "#d8dee9", "1": "#ff5555", "2": "#50fa7b", "3": "#f1fa8c",
        "4": "#ff6e6e", "5": "#ff79c6", "6": "#00d7d7", "7": "#bbbbbb",
        "8": "#808080", "9": "#5ce6e6", "A": "#a4ffff", "B": "#d6acff",
        "C": "#ff6e6e", "D": "#ff92df", "E": "#ffffa5", "F": "#ffffff",
    },
}

_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

_ENUMS = {"comm_type": ("serial", "udp", "tcp"),
          "parity": ("none", "odd", "even", "mark", "space"),
          "flow": ("none", "rtscts", "xonxoff"),
          "rx_newline": ("cr", "lf", "crlf"),
          "tx_newline": ("cr", "lf", "crlf"),
          "auto_src": ("di", "do"),
          "auto_active": ("high", "low")}

_settings = None               # 지연 로딩 — get_settings() 참조


def _settings_path():
    from app.db import DATA_DIR          # 순환 import 방지용 지연 로딩
    return os.path.join(DATA_DIR, "monitor_settings.json")


def _blank_settings():
    s = dict(DEFAULT_SETTINGS)
    s["palette"] = dict(DEFAULT_SETTINGS["palette"])
    s["auto_steps"] = [dict(x) for x in DEFAULT_SETTINGS["auto_steps"]]
    return s


def _raw_settings():
    """복사본이 아닌 원본 dict — 수신 스레드에서 값 하나만 볼 때 사용."""
    global _settings
    if _settings is None:
        with _lock:
            if _settings is None:
                s = _blank_settings()
                try:
                    with open(_settings_path(), encoding="utf-8") as fh:
                        _apply_patch(s, json.load(fh))
                except (OSError, ValueError):
                    pass                  # 파일 없음/깨짐 → 기본값 사용
                _settings = s
    return _settings


def _apply_patch(target, patch):
    """들어온 값을 형식 검사하며 target 에 반영한다(모르는 키는 무시)."""
    if not isinstance(patch, dict):
        return target
    for key, default in DEFAULT_SETTINGS.items():
        if key in ("palette", "auto_steps") or key not in patch:
            continue
        val = patch[key]
        try:
            if key in _ENUMS:
                val = str(val).lower()
                if val not in _ENUMS[key]:
                    continue
            elif isinstance(default, bool):
                val = bool(val)
            elif isinstance(default, float):
                val = float(val)
            elif isinstance(default, int):
                val = int(val)
            else:
                val = str(val)
        except (TypeError, ValueError):
            continue
        target[key] = val
    target["databits"] = target["databits"] if target["databits"] in (4, 5, 6, 7, 8) else 8
    target["stopbits"] = 2 if target["stopbits"] == 2 else 1
    target["font_size"] = min(30, max(6, int(target["font_size"] or 10)))
    target["scrollback"] = max(0, int(target["scrollback"] or 0))
    target["net_port"] = min(65535, max(1, int(target["net_port"] or 20000)))
    target["auto_ch"] = min(16, max(1, int(target["auto_ch"] or 2)))
    target["auto_delay"] = min(10.0, max(0.2, float(target["auto_delay"] or 1.0)))
    if not _HEX.match(str(target.get("screen_bg", ""))):
        target["screen_bg"] = DEFAULT_SETTINGS["screen_bg"]
    steps = patch.get("auto_steps")
    if isinstance(steps, list):
        clean = []
        for st in steps[:8]:                       # 최대 8단계
            if not isinstance(st, dict):
                continue
            cmd = " ".join(str(st.get("cmd", "")).split())[:64]
            if not cmd:
                continue
            try:
                wait = min(30.0, max(0.0, float(st.get("wait", 0) or 0)))
            except (TypeError, ValueError):
                wait = 0.0
            clean.append({"cmd": cmd, "wait": wait})
        target["auto_steps"] = clean or [dict(x) for x in DEFAULT_SETTINGS["auto_steps"]]
    pal = patch.get("palette")
    if isinstance(pal, dict):
        for k in DEFAULT_SETTINGS["palette"]:
            v = str(pal.get(k, "")).strip()
            if _HEX.match(v):
                target["palette"][k] = v.lower()
    return target


def get_settings():
    with _lock:
        s = dict(_raw_settings())
        s["palette"] = dict(s["palette"])
        s["auto_steps"] = [dict(x) for x in s["auto_steps"]]
        s["defaults"] = DEFAULT_SETTINGS      # 화면의 'Default' 버튼용
        return s


def set_settings(patch):
    """설정 저장 — 시리얼 파라미터는 다음 연결부터 적용된다."""
    with _lock:
        s = _apply_patch(_raw_settings(), patch)
        try:
            path = _settings_path()
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(s, fh, ensure_ascii=False, indent=2)
        except OSError as exc:
            return {"error": f"설정을 저장하지 못했습니다: {exc}"}
    busy = [slot_name(k) for k, sess in _SESSIONS.items() if sess.connected]
    return {"ok": True, "settings": get_settings(), "reconnect_needed": busy}


def _display_filter(text):
    """표시·저장용 텍스트 — I/O 조회 잡음(_io_quiet)·색상코드(remove_color) 정리."""
    if _raw_settings()["remove_color"]:
        text = proto.strip_colour(text)
    if not _io_quiet:
        return text
    kept = [ln for ln in text.splitlines(keepends=True)
            if not _IO_CHATTER.match(proto.strip_colour(ln).rstrip("\r\n"))]
    return "".join(kept)


def _capture_dir():
    from app.db import DATA_DIR
    return os.path.join(DATA_DIR, "monitor_logs")


def _rec_dict(rec):
    return {"type": rec.type, "caption": rec.caption, "spec_min": rec.spec_min,
            "spec_max": rec.spec_max, "value": rec.value,
            "result": rec.result, "ok_count": rec.ok_count,
            "total_count": rec.total_count, "checksum_ok": rec.checksum_ok}


def _run_dict(run):
    return {
        "time": dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "equip_no": run.equip_no, "model": run.model, "process": run.process,
        "prod_code": run.prod_code, "version": run.version,
        "result": run.result, "tact": run.tact_time, "is_ng": run.is_ng,
        "measurements": [_rec_dict(r) for r in run.measurements],
        "summary": [_rec_dict(r) for r in run.summary],
    }


# --------------------------------------------------- 저장 파일 이름 (모델 + 종류)
_GENERIC_PROC = {"FUNC", "FUNCTION"}       # 일반 기능검사 — 파일명 '종류'로 표기 안 함
_FNAME_BAD = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _clean_model(model):
    s = _FNAME_BAD.sub("", model or "").replace("_", " ")
    s = re.sub(r"^SM\s+(?=[A-Za-z]*\d)", "SM-", s)      # SM S952 → SM-S952 (삼성 표기)
    return re.sub(r"\s+", " ", s).strip()


def _clean_type(proc):
    s = _FNAME_BAD.sub("", proc or "").replace("_", " ")
    toks = [t for t in s.split() if t.upper() not in _GENERIC_PROC]
    return re.sub(r"\s+", " ", " ".join(toks)).strip()


def _name_with_type(model, proc):
    """저장 파일 기본 이름의 '모델명 + 종류' 부분 — 종류는 공정(?P/$$P)에서 도출.

    FUNC 같은 일반 공정이거나 이미 모델명에 들어 있는 종류는 붙이지 않는다.
      TN1 + IF_CTC        → 'TN1 IF CTC'
      SM_S952_SUB + FUNC  → 'SM-S952 SUB'
      VMF...-0125002 + VSWR → 'VMF...-0125002 VSWR'
    """
    m = _clean_model(model)
    t = _clean_type(proc)
    if t and t.upper() not in m.upper():
        return f"{m} {t}".strip()
    return m


class _Session:
    """검사기 1대분 — 시리얼 연결 + 수신 버퍼 + 검사 결과."""

    def __init__(self, slot):
        self.slot = slot
        # 저장 로그 파일 이름은 '슬롯 번호'가 아니라 '세션 고유 id'로 정한다.
        # 스왑(슬롯 교환)해도 파일이 세션을 그대로 따라가고, 두 세션이 같은
        # 파일을 건드리는 충돌이 없다. (OneDrive 잠금으로 파일 rename 이 실패하는
        # 문제도 피한다 — 스왑 시 디스크 파일을 옮기지 않는다.)
        self._cap_id = slot
        self.lock = threading.RLock()
        self.link = None
        self.status = "연결되지 않음"
        self.seq = 0
        self.events = []           # [{"s":seq,"k":"rx"|"tx","t":text}] 컬러코드 원문
        self.runs = []             # 확정된 검사 사이클(dict)
        self.pending = []          # $S..$& 조립 중인 레코드 라인
        self.flush_deadline = None
        self.start_active = False
        self.test_running = False       # Test START ~ Test END 사이인가
        # 반자동 시작(제품 안착 → 자동 START) 상태
        self.auto = {"on": False, "state": "꺼짐", "level": None, "count": 0}
        self._auto_thread = None
        self._auto_stop = threading.Event()
        self.capture = []          # 디스크를 못 쓸 때의 폴백 버퍼
        self.capture_chars = 0
        self.capture_truncated = False
        self.capture_path = None   # 수신 원문 파일(용량 제한 없음)
        self._capture_fh = None
        self._capture_nodisk = False   # 디스크 사용 실패 → 메모리 폴백으로 고정
        self.rx_total = 0          # 누적 수신량 — '장비 무응답' 감지용
        self.rx_tail = ""          # 아직 줄바꿈이 안 온 수신 조각(레코드 파싱용)
        self.qc = {"aborted": 0, "repaired": 0}   # 중단된 회차 / 전송오류 복구 건수
        self._model, self._model_at = "", -1      # last_model() 캐시
        self.io_state = {"di": None, "do": None, "do_aux": None,
                         "gpio": {}, "current": {}, "gcs": None,
                         "counter": None, "time": None}

    # ---------------------------------------------------------- 내부
    def _push_event(self, kind, text):
        self.seq += 1
        self.events.append({"s": self.seq, "k": kind, "t": text})
        if len(self.events) > _EVENT_KEEP:
            del self.events[:len(self.events) - _EVENT_KEEP]

    def _capture_feed(self, text):
        """수신 원문 적재 — 기본은 파일에 그대로 흘려보내 용량 제한이 없다.

        KNK터미널의 Scroll Back Row Buffers(30000행) 에 해당하는 상한이
        이 프로그램에는 없다(설정 화면에 '무한대'로 표시). 디스크를 쓸 수
        없는 환경에서만 예전처럼 메모리 10MB 링버퍼로 물러난다.
        """
        self._capture_ready()
        if self._capture_fh is not None:
            try:
                self._capture_fh.write(text)
                self._capture_fh.flush()
                self.capture_chars += len(text)
                return
            except OSError:
                self._capture_fh = None          # 디스크 오류 → 메모리 폴백
        self.capture.append(text)
        self.capture_chars += len(text)
        while sum(len(x) for x in self.capture) > _CAPTURE_MAX and len(self.capture) > 1:
            self.capture.pop(0)
            self.capture_truncated = True

    def _capture_ready(self):
        """기록할 파일을 아직 안 열었으면 지금 연다.

        연결하지 않고 로그 파일만 불러온 경우(드래그앤드랍)에도 '💾 저장'이
        동작해야 하므로, 첫 기록 시점에 파일을 만든다. 연결을 끊은 뒤에는
        기존 파일에 이어 쓴다(끊었다고 지금까지 받은 내용이 사라지면 안 된다).
        """
        if self._capture_fh is not None or self._capture_nodisk:
            return
        if self.capture_path:
            try:
                self._capture_fh = open(self.capture_path, "a", encoding="utf-8",
                                        errors="replace", newline="")
                return
            except OSError:
                self._capture_nodisk = True
                return
        self._capture_reset()

    def _capture_reset(self):
        """새 연결 = 새 수신 로그. 파일을 새로 열고 이전 내용은 버린다."""
        self._capture_close()
        self.capture = []
        self.capture_chars = 0
        self.capture_truncated = False
        self.capture_path = None
        try:
            folder = _capture_dir()
            os.makedirs(folder, exist_ok=True)
            path = os.path.join(folder, f"slot{self._cap_id}.log")
            self._capture_fh = open(path, "w", encoding="utf-8",
                                    errors="replace", newline="")
            self.capture_path = path
        except OSError:
            self._capture_fh = None              # 메모리 폴백으로 계속 동작
            self._capture_nodisk = True

    def _capture_close(self):
        if self._capture_fh is not None:
            try:
                self._capture_fh.close()
            except OSError:
                pass
            self._capture_fh = None

    def _capture_text(self):
        """저장·내보내기용 수신 원문 전체."""
        if self._capture_fh is not None:
            try:
                self._capture_fh.flush()
            except OSError:
                pass
        if self.capture_path and os.path.exists(self.capture_path):
            try:
                with open(self.capture_path, encoding="utf-8",
                          errors="replace", newline="") as fh:
                    return fh.read()
            except OSError:
                pass
        return "".join(self.capture)

    def _update_io(self, kind, payload):
        bits = lambda b: [1 if x else 0 for x in b]   # noqa: E731
        st = self.io_state
        if kind == "di":
            st["di"] = bits(payload)
        elif kind == "do":
            b, aux = payload
            st["do"] = bits(b)
            st["do_aux"] = bits(aux) if aux is not None else None
        elif kind == "gpio":
            port, idr, odr = payload
            st["gpio"][port] = {"idr": bits(idr), "odr": bits(odr)}
        elif kind == "current":
            ch, unit, val = payload
            st["current"][f"{ch}|{unit}"] = val
        elif kind == "gcs":
            gid, pin, val = payload
            st["gcs"] = f"Gender {gid}  PIN {pin}  SET {val}"
        elif kind == "counter":
            ok, ng, total = payload
            st["counter"] = {"ok": ok, "ng": ng, "total": total}
        elif kind == "time":
            st["time"] = payload

    def _start_recover(self, reason):
        if not self.start_active:
            return
        self.start_active = False
        self.status = f"검사 시작 실패: {reason}"

    # ------------------------------------------------ 반자동 시작 (제품 안착 → START)
    def _auto_set(self, **kw):
        with self.lock:
            self.auto.update(kw)

    _AUTO_TICK = 0.2        # 진공 확인 주기(초)
    _AUTO_REPLY = 0.25      # 조회 명령을 보내고 응답을 기다리는 시간(초)

    def _auto_read(self, cfg):
        """진공 신호를 한 번 읽는다. True=진공 ON(제품 안착), None=아직 모름."""
        src = cfg["auto_src"]                       # 'di' | 'do'
        self._quiet_send(src.upper())               # 조회 명령(터미널·저장 로그에는 숨겨짐)
        if self._auto_stop.wait(self._AUTO_REPLY):
            return None
        with self.lock:
            bits = self.io_state.get(src)
        ch = cfg["auto_ch"]
        if not bits or len(bits) < ch:
            return None
        high = bool(bits[ch - 1])
        return high if cfg["auto_active"] == "high" else (not high)

    def _auto_loop(self):
        """제품이 올라와 진공이 잡히면 설정한 시간 뒤 START 를 보낸다.

        같은 제품으로 두 번 시작하지 않도록, 검사가 끝난 뒤에는 진공이 한 번
        풀린(제품을 빼낸) 것을 확인해야 다음 시작을 준비한다.
        """
        armed = False           # 다음 안착에서 시작해도 되는 상태인가
        while not self._auto_stop.wait(self._AUTO_TICK):
            if not self.connected:
                self._auto_set(state="연결이 끊겨 해제됨", on=False)
                return
            cfg = _raw_settings()

            if self.test_running:               # 검사 중 — 조회도 보내지 않는다
                self._auto_set(state="검사 진행 중")
                armed = False
                continue

            level = self._auto_read(cfg)
            if level is None:
                self._auto_set(state="신호 확인 중")
                continue
            if not level:                       # 진공 해제 = 제품 없음
                armed = True
                self._auto_set(state="", level=False)      # 평상시 — 표시할 상태 없음
                continue

            self._auto_set(level=True)
            if not armed:                       # 검사 끝난 제품이 아직 올라가 있음
                self._auto_set(state="제품을 빼 주세요")
                continue

            # 설정한 지연을 '진공 감지 시점 기준' 으로 맞춘다 — 마지막 재확인에
            # 걸리는 시간(_AUTO_REPLY)을 미리 빼 두어야 실제 간격이 설정값이 된다.
            delay = float(cfg["auto_delay"])
            self._auto_set(state=f"{delay:g}초 뒤 시작…")
            if self._auto_stop.wait(max(0.0, delay - self._AUTO_REPLY)):
                return
            if not self._auto_read(cfg):        # 지연 중에 제품이 빠졌으면 취소
                self._auto_set(state="진공 해제 — 시작 취소")
                continue

            armed = False
            if not self._auto_run_steps(cfg.get("auto_steps") or []):
                continue
            with self.lock:
                self.auto["count"] += 1
                self.auto["state"] = "시작 명령 전송됨"
                self.start_active = True

    def _auto_run_steps(self, steps):
        """설정된 시작 시퀀스를 순서대로 보낸다. 하나라도 실패하면 중단."""
        if not steps:
            steps = [{"cmd": "START", "wait": 0.0}]
        for i, st in enumerate(steps, start=1):
            cmd = st.get("cmd", "")
            self._auto_set(state=f"{i}/{len(steps)} {cmd} 전송…")
            r = self.send(cmd, unsafe_ok=True)
            if r.get("error"):
                self._auto_set(state=f"{cmd} 실패: {r['error']}")
                return False
            wait = float(st.get("wait", 0) or 0)
            if wait and self._auto_stop.wait(wait):
                return False
        return True

    def auto_probe(self):
        """설정 화면의 '지금 읽기' — 지금 그 채널이 어떤 상태인지 한 번 조회한다.

        장비를 움직이는 명령이 아니라 DI/DO 조회뿐이라 안전하다.
        제품을 올렸다 내렸다 하며 눌러 보면 채널·레벨을 바로 맞출 수 있다.
        """
        if not self.connected:
            return {"error": f"{slot_name(self.slot)}가 연결되어 있지 않습니다."}
        cfg = _raw_settings()
        on = self._auto_read(cfg)
        with self.lock:
            bits = self.io_state.get(cfg["auto_src"])
        if on is None:
            return {"error": "장비가 응답하지 않았습니다. 연결·포트를 확인하세요."}
        return {"ok": True, "vacuum": bool(on),
                "src": cfg["auto_src"], "ch": cfg["auto_ch"],
                "level": "HIGH" if bits[cfg["auto_ch"] - 1] else "LOW",
                "bits": bits}

    def set_auto_start(self, on, unsafe_ok=False):
        with self.lock:
            if not on:
                self._auto_stop.set()
                self.auto.update({"on": False, "state": "꺼짐", "level": None})
                return {"ok": True, "auto": dict(self.auto)}
            if not self.connected:
                return {"error": f"{slot_name(self.slot)}가 연결되어 있지 않습니다."}
            if not unsafe_ok:
                return {"error": "반자동 시작은 장비가 실제로 동작하는 기능입니다.",
                        "unsafe_required": True,
                        "tip": "제품을 올리면 사람이 누르지 않아도 검사가 시작됩니다."}
            if self._auto_thread is not None and self._auto_thread.is_alive():
                return {"ok": True, "auto": dict(self.auto)}
            self._auto_stop.clear()
            self.auto.update({"on": True, "state": "", "count": 0})
            self._auto_thread = threading.Thread(target=self._auto_loop, daemon=True)
            self._auto_thread.start()
            return {"ok": True, "auto": dict(self.auto)}

    def _flush_pending(self):
        if not self.pending:
            return
        block = "\n".join(self.pending)
        self.pending = []
        for run in proto.parse_stream(block, stats=self.qc):
            self.runs.append(_run_dict(run))

    def _on_data(self, text):
        """시리얼 수신 스레드 콜백 — tkinter 판 _handle_rx 와 동일한 규칙.

        화면 표시는 받은 즉시 그대로 내보내되(프롬프트처럼 줄바꿈 없이 끝나는
        출력도 바로 보여야 하므로), **레코드 파싱은 줄이 완성된 뒤에만** 한다.
        읽기 타임아웃(0.2초)에 걸려 반 토막으로 올라온 줄을 그대로 파싱하면
        그 측정값 한 개가 통째로 사라지기 때문이다.
        """
        with self.lock:
            self.rx_total += len(text)
            disp = _display_filter(text)
            if disp:
                self._push_event("rx", disp)
                self._capture_feed(disp)

            self.rx_tail += text
            *lines, self.rx_tail = self.rx_tail.split("\n")
            if len(self.rx_tail) > 65536:        # 줄바꿈 없이 계속 오면 강제 처리
                lines.append(self.rx_tail)
                self.rx_tail = ""
            for line in lines:
                line = proto.strip_colour(line).rstrip("\r\n")

                hit = knk_status.parse_status_line(line)
                if hit is not None:
                    self._update_io(*hit)

                # 검사 진행 여부 — 반자동 시작이 같은 제품을 두 번 돌리지 않도록
                if "Test START." in line:
                    self.test_running = True
                elif "Test END" in line or "Vacuum is OFF" in line \
                        or "Reset Key Detected" in line or "User Break" in line:
                    self.test_running = False

                if "Vacuum is OFF" in line:
                    self._start_recover("진공 미감지 (제품 안착/진공 배관 확인)")
                elif "Reset Key Detected" in line or "User Break" in line:
                    if self.start_active:
                        self._start_recover("검사가 중간에 리셋됨 (DS FW는 START 유지 방식 필요)")
                elif "Test START." in line and self.start_active:
                    self.status = "검사 시작됨 — 측정 진행 중..."
                elif "Test END" in line:
                    self.start_active = False
                    self.status = "검사 완료 (Test END)"

                # 깨진 줄('$ R...')도 일단 담는다 — 복구 여부는 파서가 체크섬으로 판단
                if not proto.looks_like_record(line):
                    continue
                self.pending.append(line)
                kind = line[2:3]
                if kind == "&":            # 요약 블록 끝 → 사이클 확정
                    self.flush_deadline = None
                    self._flush_pending()
                elif kind == "@":          # 요약 블록 시작 → 기다림
                    self.flush_deadline = None
                elif kind == "E":          # 요약 없는 장비 대비 1.5초 유예
                    self.flush_deadline = time.monotonic() + 1.5

    def _on_status(self, text):
        with self.lock:
            self.status = text

    def _send_echo(self, command):
        """명령 전송 + 터미널에 '>>> 명령' 표시(I/O 잡음 숨김 시 DI/DO 는 제외)."""
        self.link.send(command)
        if not (_io_quiet and _IO_CMD.match(command.strip())):
            self._push_event("tx", f">>> {command}\n")

    def _quiet_send(self, command):
        with self.lock:
            if self.link is not None and self.link.is_open:
                try:
                    self._send_echo(command)
                except (UnsafePayload, RuntimeError, OSError):
                    pass

    # ------------------------------------------------------------- API
    @property
    def connected(self):
        return self.link is not None and self.link.is_open

    def brief(self):
        return {"connected": self.connected,
                "port": getattr(self.link, "port", None),
                "baud": getattr(self.link, "baud", None),
                "status": self.status, "seq": self.seq,
                "runs_total": len(self.runs)}

    def connect(self, port, baud):
        with self.lock:
            if self.connected:
                return {"error": f"{slot_name(self.slot)}는 이미 {self.link.port} 에 연결되어 있습니다."}
            if not port:
                return {"error": "포트를 선택하세요. (USB 케이블 연결 후 새로고침)"}
            # 다른 세션이 같은 포트를 쓰고 있으면 미리 안내
            for other in _SESSIONS.values():
                if other is not self and other.connected \
                        and getattr(other.link, "port", None) == port:
                    return {"error": f"{port} 는 {slot_name(other.slot)}가 사용 중입니다."}
            cfg = _raw_settings()
            if cfg["comm_type"] != "serial":
                return {"error": f"설정의 통신 방식이 {cfg['comm_type'].upper()} 입니다. "
                                 "현재 이 프로그램은 Serial 연결만 지원합니다 — "
                                 "터미널 설정(⚙)에서 Serial 로 바꿔 주세요."}
            try:
                self.link = KNKSerial(port=port, baud=int(baud or DEFAULT_BAUD),
                                      on_data=self._on_data,
                                      on_status=self._on_status,
                                      databits=cfg["databits"],
                                      parity=cfg["parity"],
                                      stopbits=cfg["stopbits"],
                                      flow=cfg["flow"],
                                      tx_newline=cfg["tx_newline"])
                self._capture_reset()      # 새 세션 — 저장용 수신 로그도 새로 시작
                self.link.open()
            except Exception as exc:  # noqa: BLE001 — 사용자에게 원문 안내
                self.link = None
                msg = str(exc)
                if "PermissionError" in msg or "액세스" in msg or "Access" in msg:
                    msg += ("  ※ 다른 프로그램(KNKT.exe, PBADataLogger.exe, "
                            "KNK Monitor 창)이 포트를 사용 중일 수 있습니다.")
                return {"error": msg}
            return {"ok": True, "status": self.status}

    def disconnect(self):
        with self.lock:
            self._auto_stop.set()          # 반자동 시작도 함께 내린다
            self.auto.update({"on": False, "state": "꺼짐", "level": None})
            if self.link is not None:
                try:
                    self.link.close()
                except Exception:  # noqa: BLE001
                    pass
                self.link = None
            # 파일 핸들만 닫는다 — 연결을 끊은 뒤에도 '저장'은 되어야 하므로
            # capture_path 는 그대로 두고 내용도 지우지 않는다.
            self._capture_close()
            return {"ok": True, "status": self.status}

    def send(self, command, unsafe_ok=False):
        command = (command or "").strip()
        with self.lock:
            if not self.connected:
                return {"error": "먼저 포트에 연결하세요."}
            if is_unsafe(command) and not unsafe_ok:
                return {"error": f"'{command}' 는 장비가 실제로 동작하는 명령입니다.",
                        "unsafe_required": True, "tip": unsafe_tip(command)}
            try:
                self._send_echo(command)
            except (UnsafePayload, RuntimeError, OSError) as exc:
                return {"error": str(exc)}
            return {"ok": True}

    def start_sequence(self, ch, level, settle, unsafe_ok=False):
        """검사 시작 시퀀스 — 메인 실린더 DO → 진공 대기 → START.

        실기 확인(2026-07-22): DO <ch> LOW 로 제품 인식 → 진공 자동 → START.
        FW 채널 인덱스는 0-기준('DO 0' = CH01).
        """
        if not unsafe_ok:
            return {"error": "장비 동작 명령 허용이 필요합니다.", "unsafe_required": True,
                    "tip": "메인 실린더·진공·검사가 실제로 동작합니다."}
        with self.lock:
            if not self.connected:
                return {"error": "먼저 포트에 연결하세요."}
            self.start_active = True
            try:
                self._send_echo(f"DO {int(ch)} {int(level)}")
            except (UnsafePayload, RuntimeError, OSError) as exc:
                self.start_active = False
                return {"error": str(exc)}
            self.status = f"CH{int(ch) + 1} 동작 — 제품 인식/진공 대기..."

        settle_s = max(0.5, float(settle or 2.0))

        def _rest():
            time.sleep(0.3)
            self._quiet_send("DO")
            time.sleep(max(0.0, settle_s - 0.3))
            with self.lock:
                if not self.connected or not self.start_active:
                    return
                self.status = "START 명령 전송..."
            self._quiet_send("START")
            time.sleep(4.0)
            with self.lock:
                if self.start_active:
                    self.start_active = False
                    if "진행" not in self.status and "완료" not in self.status:
                        self.status = "검사 시작 시퀀스 종료 — 결과/화면 확인"

        threading.Thread(target=_rest, daemon=True).start()
        return {"ok": True}

    def poll_payload(self, seq_from, runs_from):
        with self.lock:
            if self.flush_deadline is not None \
                    and time.monotonic() > self.flush_deadline:
                self.flush_deadline = None
                self._flush_pending()
            return {
                "connected": self.connected,
                "port": getattr(self.link, "port", None),
                "status": self.status,
                "rx": self.rx_total,
                "seq": self.seq,
                "events": [e for e in self.events if e["s"] > seq_from],
                "runs_total": len(self.runs),
                "runs": self.runs[max(0, int(runs_from)):],
                "io": self.io_state,
                "qc": dict(self.qc),        # 중단 회차·전송오류 복구 건수
                "model": self.last_model(),
                "auto": dict(self.auto),    # 반자동 시작 상태
            }

    def last_model(self):
        """이 슬롯에서 마지막으로 확인된 검사 모델명 (저장 파일 이름에 쓴다).

        폴링마다 불리므로 결과를 캐시한다 — 새 사이클이 들어올 때만 갱신.
        """
        n = len(self.runs)
        if self._model_at != n:
            for run in reversed(self.runs):
                if run.get("model"):
                    self._model = run["model"]
                    break
            self._model_at = n
        return self._model

    def last_equip(self):
        """마지막으로 확인된 호기 번호($$N/?N) — 파일 이름의 'N호기'."""
        for run in reversed(self.runs):
            if run.get("equip_no"):
                try:
                    return int(str(run["equip_no"]).strip())
                except ValueError:
                    return str(run["equip_no"]).strip()
        return 0

    def last_process(self):
        """마지막으로 확인된 공정($$P/?P) — 파일 이름의 '종류' 도출용."""
        for run in reversed(self.runs):
            if run.get("process"):
                return str(run["process"]).strip()
        return ""

    def import_text(self, text):
        """로그 파일 불러오기(드래그앤드랍 포함).

        불러온 원문도 수신 로그에 그대로 쌓는다 — 화면에 보이는 내용이
        '💾 저장' 으로 그대로 나와야 하기 때문. (연결 중에 불러오면 장비
        수신분과 시간 순서대로 섞인다 — 화면과 같은 순서다.)
        """
        added = 0
        with self.lock:
            if text:
                self._capture_feed(text if text.endswith("\n") else text + "\n")
            for run in proto.parse_stream(text or "", stats=self.qc):
                self.runs.append(_run_dict(run))
                added += 1
        return {"added": added, "runs_total": len(self.runs),
                "captured": self.capture_chars, "qc": dict(self.qc)}

    def clear(self):
        """이 슬롯을 완전히 초기화 — 화면·집계·저장 로그를 모두 새로 시작한다.

        예전에는 검사 결과 목록만 비우고 저장용 수신 로그는 그대로 두어서,
        '지우기 → 검사 → 저장' 을 하면 지우기 이전에 받아 둔 내용까지 파일에
        따라 나왔다. 지우기 = 새 로그 시작으로 통일한다.
        """
        with self.lock:
            self.runs.clear()
            self.pending = []
            self.flush_deadline = None
            self.qc = {"aborted": 0, "repaired": 0}
            self._model, self._model_at = "", -1
            self.rx_tail = ""
            self._capture_reset()      # 저장 버퍼(파일)도 비운다
            return {"ok": True, "runs_total": 0}

    def export_csv(self):
        """수집된 결과를 KNKMonitor 와 같은 CSV 포맷으로 만든다."""
        with self.lock:
            rows = []
            for i, run in enumerate(self.runs, start=1):
                base = [run["time"], i, run["equip_no"], run["model"],
                        run["process"], run["prod_code"], run["version"],
                        run["result"], run["tact"]]
                for r in run["measurements"]:
                    rows.append(base + ["measure", r["caption"], r["spec_min"],
                                        r["spec_max"], r["value"], r["result"],
                                        "", "", r["checksum_ok"]])
                for r in run["summary"]:
                    rows.append(base + ["summary", r["caption"], "", "", "",
                                        r["result"], r["ok_count"],
                                        r["total_count"], r["checksum_ok"]])
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["received"] + proto.CSV_COLUMNS)
        writer.writerows(rows)
        content = buf.getvalue().encode("utf-8-sig")
        filename = (f"knk_result_{self.slot}번_"
                    f"{dt.datetime.now():%Y%m%d_%H%M%S}.csv")
        return content, filename

    def save_log(self, name):
        """수신 원문 전체를 바탕화면에 .log 로 저장 — KNKT.exe 의 로그 저장과 동일.

        줄바꿈은 KNK터미널과 똑같이 CRLF 로 통일한다. LF 로 섞여 저장되면
        데이터로거로 다시 읽을 때 레코드가 어긋나는 일이 있었다.
        """
        with self.lock:
            content = self._capture_text()
            if not content:
                return {"error": f"{slot_name(self.slot)}에 저장할 내용이 없습니다.\n"
                                 "장비에 연결해 데이터를 받거나, 로그 파일을 이 슬롯 화면에 "
                                 "끌어다 놓은 뒤 저장하세요."}
            truncated = self.capture_truncated
            model = self.last_model()
            proc = self.last_process()
            equip = self.last_equip()

        name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", (name or "").strip()).strip(". ")
        if not name:
            # 기본 이름 = "모델명 종류 N호기" (종류는 공정에서 도출)
            head = _name_with_type(model, proc)
            name = f"{head} {equip}호기" if head else f"KNK 장비로그 {self.slot}번"
        if not name.lower().endswith((".txt", ".log")):
            name += ".log"

        folder = _desktop_dir()
        path = os.path.join(folder, name)
        stem, ext = os.path.splitext(name)
        n = 2
        while os.path.exists(path):
            path = os.path.join(folder, f"{stem} ({n}){ext}")
            n += 1

        if truncated:
            content = ("[KNK 모니터] 디스크에 기록할 수 없어 메모리 버퍼(10MB)로 "
                       "동작했고, 상한 초과로 앞부분이 잘렸습니다.\r\n" + content)
        # 줄바꿈 CRLF 통일 (KNK터미널 저장 파일과 동일)
        content = content.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\r\n")
        try:
            with open(path, "w", encoding="cp949", errors="replace", newline="") as fh:
                fh.write(content)
        except OSError as exc:
            return {"error": f"파일을 저장하지 못했습니다: {exc}"}
        return {"ok": True, "path": path, "chars": len(content)}


_SESSIONS = {}


def _s(slot):
    try:
        slot = int(1 if slot is None else slot)
    except (TypeError, ValueError):
        slot = 1
    if slot not in SLOTS:
        slot = 1
    with _lock:
        if slot not in _SESSIONS:
            _SESSIONS[slot] = _Session(slot)
        return _SESSIONS[slot]


# ------------------------------------------------------------------ 모듈 API
def state():
    """접속 화면 초기화용 — 포트 목록·명령 목록·슬롯별 상태."""
    return {
        "serial_available": SERIAL_AVAILABLE,
        "ports": [{"device": d, "desc": desc} for d, desc in list_serial_ports()],
        "default_port": DEFAULT_PORT,
        "default_baud": DEFAULT_BAUD,
        "bauds": [9600, 19200, 115200, 460800],
        "safe_commands": [{"cmd": c, "tip": t} for c, t in SAFE_COMMANDS],
        "unsafe_commands": [{"cmd": c, "tip": t} for c, t in UNSAFE_COMMANDS],
        "di_labels": knk_status.DI_LABELS,
        "do_labels": knk_status.DO_LABELS,
        "gpio_ports": list(knk_status.GPIO_PORTS),
        "io_quiet": _io_quiet,
        "settings": get_settings(),
        "slots": {k: _s(k).brief() for k in SLOTS},
    }


def poll(cursors):
    """cursors: {slot: (seq_from, runs_from)} → 슬롯별 증분 데이터."""
    return {"io_quiet": _io_quiet,
            "slots": {k: _s(k).poll_payload(*cursors.get(k, (0, 0)))
                      for k in SLOTS}}


def set_io_quiet(on):
    """I/O 조회 잡음 숨김 켜기/끄기 — 끄면 KNKT 처럼 원문이 전부 표시·저장된다."""
    global _io_quiet
    with _lock:
        _io_quiet = bool(on)
        return {"ok": True, "io_quiet": _io_quiet}


def connect(slot, port, baud):
    return _s(slot).connect(port, baud)


def disconnect(slot):
    return _s(slot).disconnect()


def send(slot, command, unsafe_ok=False):
    return _s(slot).send(command, unsafe_ok)


def start_sequence(slot, ch, level, settle, unsafe_ok=False):
    return _s(slot).start_sequence(ch, level, settle, unsafe_ok)


def set_auto_start(slot, on, unsafe_ok=False):
    return _s(slot).set_auto_start(on, unsafe_ok)


def auto_probe(slot):
    return _s(slot).auto_probe()


def import_text(slot, text):
    return _s(slot).import_text(text)


def clear(slot):
    return _s(slot).clear()


def export_csv(slot):
    return _s(slot).export_csv()


def save_log(slot, name):
    return _s(slot).save_log(name)


def swap(a, b):
    """터미널/데이터로거 슬롯 a·b 를 통째로 교환한다.

    연결(시리얼 링크)·수신버퍼·검사결과·반자동 스레드·저장로그(세션 고유 id로
    명명된 파일)가 모두 세션 객체에 들어 있으므로, _SESSIONS 의 키만 맞바꾸고
    slot 번호(표시·안내용)만 갱신하면 연결 중이든 아니든 전부 그대로 따라간다.
    디스크 파일을 옮기지 않으므로 OneDrive/백신 잠금에도 영향받지 않는다.
    """
    try:
        a, b = int(a), int(b)
    except (TypeError, ValueError):
        return {"error": "교환할 슬롯 번호가 올바르지 않습니다."}
    if a == b or a not in SLOTS or b not in SLOTS or 0 in (a, b):
        return {"error": "1~3번 검사기끼리만 교환할 수 있습니다."}
    with _lock:
        sa, sb = _s(a), _s(b)
        # 두 세션 락을 항상 같은 순서(작은 slot 먼저)로 잡아 교착을 막는다
        first, second = (sa, sb) if a < b else (sb, sa)
        with first.lock, second.lock:
            _SESSIONS[a], _SESSIONS[b] = sb, sa
            sa.slot, sb.slot = b, a
    return {"ok": True, "a": a, "b": b,
            "a_conn": _SESSIONS[a].connected, "b_conn": _SESSIONS[b].connected}


# ------------------------------------------------------- 바탕화면 경로
def _desktop_dir():
    """실제 바탕화면 경로. OneDrive 리디렉션(OneDrive\\Desktop)까지 정확히 찾는다."""
    try:
        import ctypes
        import uuid

        class _GUID(ctypes.Structure):
            _fields_ = [("data", ctypes.c_ubyte * 16)]

        g = _GUID()
        # FOLDERID_Desktop
        ctypes.memmove(g.data, uuid.UUID("{B4BFCC3A-DB2C-424C-B029-7FE99A87C641}").bytes_le, 16)
        p = ctypes.c_wchar_p()
        if ctypes.windll.shell32.SHGetKnownFolderPath(
                ctypes.byref(g), 0, None, ctypes.byref(p)) == 0:
            path = p.value
            ctypes.windll.ole32.CoTaskMemFree(p)
            if path and os.path.isdir(path):
                return path
    except Exception:  # noqa: BLE001 — 폴백으로 계속
        pass
    home = os.path.expanduser("~")
    for cand in (os.path.join(home, "OneDrive", "Desktop"),
                 os.path.join(home, "Desktop")):
        if os.path.isdir(cand):
            return cand
    return home
