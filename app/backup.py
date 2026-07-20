# -*- coding: utf-8 -*-
"""자동 백업 — 프로그램 시작 시 quality.db 를 날짜별로 안전 복사(로컬).

- data/backups/quality-YYYYMMDD.db 형태로 하루 1개 생성(이미 있으면 건너뜀)
- 최근 KEEP개만 남기고 오래된 백업 자동 삭제
- sqlite 온라인 백업 API 사용(무결성 보장), 실패해도 프로그램 실행에는 영향 없음
"""
import os
import sqlite3
from datetime import datetime

from app import db

KEEP = 14
BACKUP_DIR = os.path.join(db.DATA_DIR, "backups")


def auto_backup():
    """오늘자 백업이 없으면 생성하고, 오래된 것 정리. (조용히 실패)"""
    try:
        if not os.path.exists(db.DB_PATH):
            return None
        os.makedirs(BACKUP_DIR, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d")
        dest = os.path.join(BACKUP_DIR, f"quality-{stamp}.db")
        if not os.path.exists(dest):
            src = sqlite3.connect(db.DB_PATH)
            dst = sqlite3.connect(dest)
            with dst:
                src.backup(dst)          # 온라인 백업(락 안전)
            dst.close(); src.close()
        _prune()
        return dest
    except Exception as e:  # noqa: BLE001
        print(f"[백업 안내] 자동 백업을 건너뜁니다: {e}")
        return None


def _prune():
    files = sorted(f for f in os.listdir(BACKUP_DIR)
                   if f.startswith("quality-") and f.endswith(".db"))
    for f in files[:-KEEP]:
        try:
            os.remove(os.path.join(BACKUP_DIR, f))
        except OSError:
            pass


def list_backups():
    """백업 파일 목록(최신순) — 날짜/크기."""
    if not os.path.isdir(BACKUP_DIR):
        return []
    out = []
    for f in sorted(os.listdir(BACKUP_DIR), reverse=True):
        if f.startswith("quality-") and f.endswith(".db"):
            p = os.path.join(BACKUP_DIR, f)
            out.append({"file": f,
                        "date": f[8:16],
                        "size_kb": round(os.path.getsize(p) / 1024, 1)})
    return out
