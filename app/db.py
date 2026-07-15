"""SQLite 연결 및 초기화 헬퍼. 표준 라이브러리(sqlite3)만 사용."""
import os
import sqlite3

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "quality.db")
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")


def get_conn():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """스키마 생성 후, 비어 있으면 초기 데이터를 시딩한다."""
    conn = get_conn()
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()

    # 시딩 여부 판단 (flow_step 비었으면 최초 실행으로 간주)
    cnt = conn.execute("SELECT COUNT(*) AS c FROM flow_step").fetchone()["c"]
    if cnt == 0:
        from app import seed
        seed.seed_all(conn)
        conn.commit()
    conn.close()


def query(sql, args=(), one=False):
    conn = get_conn()
    cur = conn.execute(sql, args)
    rows = cur.fetchall()
    conn.close()
    result = [dict(r) for r in rows]
    return (result[0] if result else None) if one else result


def execute(sql, args=()):
    conn = get_conn()
    cur = conn.execute(sql, args)
    conn.commit()
    lastrow = cur.lastrowid
    conn.close()
    return lastrow
