#!/usr/bin/env python3
"""KNK 검사기 출하검증 자동화 프로그램 — 실행 진입점.

사용법:
    python run.py              # 기본 127.0.0.1:8000 로 실행 후 브라우저 자동 열기
    python run.py --port 9000  # 포트 지정
    python run.py --no-browser # 브라우저 자동 열기 끄기

필요 조건: Python 3.9+ (표준 라이브러리만 사용, 별도 설치 불필요)
포트가 이미 사용 중이면 다음 포트(최대 +10)로 자동 변경해 실행합니다.
"""
import argparse
import sys
import threading
import webbrowser

from app import server


def main():
    ap = argparse.ArgumentParser(description="KNK 검사기 출하검증 시스템")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

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

    if not args.no_browser:
        url = f"http://{args.host}:{httpd.server_address[1]}"
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    server.serve(httpd)


if __name__ == "__main__":
    main()
