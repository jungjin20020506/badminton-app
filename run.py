#!/usr/bin/env python3
"""KNK 검사기 출하검증 자동화 프로그램 — 실행 진입점.

사용법:
    python run.py              # 네이티브 창(pywebview)으로 실행 — 프로그램처럼 뜸
    python run.py --browser    # 네이티브 창 대신 웹 브라우저로 열기
    python run.py --no-browser # 창/브라우저 모두 안 열고 서버만 (팀 서버·자동실행용)
    python run.py --port 9000  # 포트 지정
    python run.py --host 0.0.0.0  # 팀 서버 모드(사내망 다른 PC에서 접속)

필요 조건: Python 3.9+ (표준 라이브러리로 동작). 네이티브 창은 pywebview 가
설치돼 있으면 사용하고, 없거나 실패하면 자동으로 브라우저로 엽니다.
포트가 이미 사용 중이면 다음 포트(최대 +10)로 자동 변경해 실행합니다.
"""
import argparse
import sys
import threading
import webbrowser

from app import server

WINDOW_TITLE = "KNK 지킴 - 검사기 출하검증"


def main():
    ap = argparse.ArgumentParser(description="KNK 검사기 출하검증 시스템")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--no-browser", action="store_true",
                    help="창·브라우저 모두 열지 않고 서버만 (자동실행/팀 서버용)")
    ap.add_argument("--browser", action="store_true",
                    help="네이티브 창 대신 웹 브라우저로 열기")
    ap.add_argument("--attach", action="store_true",
                    help="이미 실행 중인 서버에 창만 하나 더 붙임(서버는 안 띄움)")
    args = ap.parse_args()

    open_host = "127.0.0.1" if args.host in ("0.0.0.0", "") else args.host
    if args.attach:                         # 서버는 이미 떠 있음 — 창만 붙인다
        _attach_window(f"http://{open_host}:{args.port}")
        return

    httpd = None
    for port in range(args.port, args.port + 10):
        try:
            httpd = server.make_server(args.host, port)
            break
        except OSError:
            print(f"[안내] 포트 {port} 가 사용 중입니다 → 다음 포트로 자동 변경합니다.")
    if httpd is None:
        print(f"[오류] {args.port}~{args.port + 9} 포트가 모두 사용 중입니다. "
              f"다른 포트로 시도하세요: python run.py --port 9000", file=sys.stderr)
        sys.exit(1)

    port = httpd.server_address[1]
    # 0.0.0.0 은 브라우저·창이 접속할 수 없는 주소이므로 localhost 로 연다
    open_host = "127.0.0.1" if args.host in ("0.0.0.0", "") else args.host
    url = f"http://{open_host}:{port}"
    team_mode = args.host == "0.0.0.0"

    # 로컬 실행이고 브라우저/서버전용 모드가 아니면 네이티브 창으로 띄운다.
    if not args.no_browser and not args.browser and not team_mode:
        if _run_native(httpd, url):        # 창을 닫으면 여기서 종료
            return

    if not args.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    if team_mode:
        print("\n  [팀 서버 모드] 같은 사내망의 다른 PC에서 아래 주소로 접속하세요:")
        for ip in _lan_ips():
            print(f"      http://{ip}:{port}")
        print("      (방화벽 허용 창이 뜨면 '액세스 허용' 을 눌러 주세요)\n")

    server.serve(httpd)


def _run_native(httpd, url):
    """pywebview 네이티브 창으로 띄운다.

    반환값 True = 이 함수가 실행(과 종료)을 책임졌으니 호출부는 그대로 끝내면 됨.
    False = pywebview 자체가 없어 네이티브 창을 시도조차 못함 → 호출부가 브라우저로.
    WebView2 백엔드가 없어 창만 못 여는 경우엔 이 안에서 브라우저로 폴백한다.
    """
    try:
        import webview
    except Exception:
        return False                        # pywebview 미설치 → 브라우저 폴백

    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()
    print(f"  {WINDOW_TITLE}")
    print(f"  → 프로그램 창으로 실행 중 (주소: {url})")
    print(f"  종료: 창을 닫거나 이 검은 창에서 Ctrl + C")
    try:
        webview.create_window(WINDOW_TITLE, url, width=1280, height=860,
                              min_size=(1024, 700))
        webview.start()                     # 창을 닫을 때까지 메인 스레드에서 블록
    except Exception as exc:                # WebView2 미설치 등 → 브라우저로 폴백
        print(f"[안내] 네이티브 창을 열 수 없어 브라우저로 엽니다: {exc}")
        webbrowser.open(url)
        try:
            server_thread.join()            # 브라우저 사용 중 — 서버를 계속 살려 둔다
        except KeyboardInterrupt:
            pass
    finally:
        httpd.shutdown()
        httpd.server_close()
    return True


def _attach_window(url):
    """이미 떠 있는 서버에 네이티브 창만 하나 더 연다(서버 기동 없음)."""
    try:
        import webview
        webview.create_window(WINDOW_TITLE, url, width=1280, height=860,
                              min_size=(1024, 700))
        webview.start()
    except Exception:
        webbrowser.open(url)


def _lan_ips():
    """이 PC의 사내망 IPv4 주소 목록 (접속 안내용)."""
    import socket
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))          # 실제 전송 없음 — 기본 경로 IP 확인용
        ips.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except OSError:
        pass
    return ips or ["<이 PC의 IP>"]


if __name__ == "__main__":
    main()
