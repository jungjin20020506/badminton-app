"""Vercel 서버리스 진입점.

로컬 실행(python run.py)과 별개로, Vercel 배포 시 /api/* 요청을 처리한다.
정적 파일(web/)은 Vercel이 CDN에서 직접 서빙하고, 이 함수는 API만 담당한다.

주의: Vercel 서버리스는 파일시스템이 읽기전용이라 SQLite DB를 /tmp 에 만든다.
      인스턴스가 새로 뜰 때마다(cold start) 시드 데이터가 재생성되며 축적 데이터는
      영구 보존되지 않는다(시연/데모용). 실제 운영/축적은 로컬 실행(python run.py)에서 이뤄진다.
"""
import os
import sys

# 프로젝트 루트를 import 경로에 추가 (app 패키지 로드)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import db
from app.server import Handler

# cold start 시 1회 스키마 생성 + 시드
db.init_db()


# Vercel Python 런타임은 이 파일 안에 top-level로 정의된 "handler" 클래스를 정적 분석으로
# 찾는다. `handler = Handler` 같은 별칭 대입은 인식하지 못하므로 반드시 클래스 정의여야 한다.
class handler(Handler):
    pass
