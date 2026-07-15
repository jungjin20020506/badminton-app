#!/usr/bin/env python3
"""KNK 검사기 출하검증 자동화 프로그램 — 실행 진입점.

사용법:
    python run.py              # 기본 127.0.0.1:8000 로 실행 후 브라우저 자동 열기
    python run.py --port 9000  # 포트 지정
    python run.py --no-browser # 브라우저 자동 열기 끄기

필요 조건: Python 3.9+ (표준 라이브러리만 사용, 별도 설치 불필요)
"""
import argparse
import sys
import threading
import webbrowser

from app.server import run


def main():
    ap = argparse.ArgumentParser(description="KNK 검사기 출하검증 시스템")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    if not args.no_browser:
        url = f"http://{args.host}:{args.port}"
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    try:
        run(args.host, args.port)
    except OSError as e:
        print(f"[오류] 서버 시작 실패: {e}\n다른 포트로 시도하세요: python run.py --port 9000", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
