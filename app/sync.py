# -*- coding: utf-8 -*-
"""Z: 서버 동기화 — 백그라운드 스레드로 스캔·파싱·DB 반영을 실행하고 진행상황을 보고.

서버 파일은 읽기 전용으로만 접근한다. 반영은 전체 재이관(멱등)이라
프로그램에서 직접 등록/수정한 이슈(자동수집 태그 없음)는 건드리지 않는다.
"""
import importlib.util
import os
import threading
import time

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_IMPORTER_PATH = os.path.join(BASE, "tools", "import_issues.py")

STATE = {"running": False, "message": "", "done_at": None, "error": None, "result": None}
_LOCK = threading.Lock()


def _load_importer():
    spec = importlib.util.spec_from_file_location("knk_import_issues", _IMPORTER_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _run():
    try:
        mod = _load_importer()
        res = mod.sync_from_server(progress=lambda m: STATE.update(message=m))
        STATE.update(result=res, error=None)
        from app import api
        api.audit("서버 동기화", "Z:", f"파일 {res['files']}개 · 이슈 {res['issues']}건")
    except Exception as e:  # noqa: BLE001
        STATE.update(error=str(e), message=f"오류: {e}")
    finally:
        STATE.update(running=False, done_at=time.strftime("%Y-%m-%d %H:%M:%S"))


def start():
    with _LOCK:
        if STATE["running"]:
            return {"started": False, "reason": "이미 동기화가 진행 중입니다."}
        STATE.update(running=True, message="동기화 시작…", error=None, result=None, done_at=None)
        threading.Thread(target=_run, daemon=True).start()
        return {"started": True}


def status():
    return dict(STATE)
