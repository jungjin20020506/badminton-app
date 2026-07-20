"""로컬 웹서버 — 표준 라이브러리 http.server 기반. 정적 파일 + JSON API."""
import json
import os
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from app import api, db

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_DIR = os.path.join(BASE_DIR, "web")

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".csv": "text/csv; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
}

XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class Handler(BaseHTTPRequestHandler):
    server_version = "KNK-QVS/1.0"

    # ------------------------------------------------------------ helpers
    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path):
        if not os.path.isfile(path):
            self.send_error(404, "Not Found")
            return
        ext = os.path.splitext(path)[1].lower()
        with open(path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_download(self, content, filename, ctype=XLSX_TYPE):
        encoded_name = urllib.parse.quote(filename)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{encoded_name}")
        self.end_headers()
        self.wfile.write(content)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if not length:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {}

    # ------------------------------------------------------------ GET
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(parsed.path)
        qs = urllib.parse.parse_qs(parsed.query)

        try:
            if path == "/" or path == "/index.html":
                return self._send_file(os.path.join(WEB_DIR, "index.html"))
            if path.startswith("/css/") or path.startswith("/js/"):
                # URL은 항상 '/' 구분자를 쓰므로 os.path.normpath로 바로 처리하면 안 됨
                # (Windows에서 '\'로 변환된 뒤 os.path.join이 절대경로로 취급해 엉뚱한 위치를
                #  가리키는 문제가 있었음). '/'로 직접 분해하고 '..'/''는 걸러 안전하게 조립한다.
                parts = [p for p in path.split("/") if p not in ("", ".", "..")]
                return self._send_file(os.path.join(WEB_DIR, *parts))
            if path.startswith("/photos/"):
                parts = [p for p in path.split("/") if p not in ("", ".", "..")]
                return self._send_file(os.path.join(db.DATA_DIR, *parts))
            if path == "/favicon.svg":
                return self._send_file(os.path.join(WEB_DIR, "favicon.svg"))

            if path == "/api/bootstrap":
                return self._send_json(api.bootstrap())
            if path == "/api/stats":
                return self._send_json(api.get_stats())
            if path == "/api/issues":
                return self._send_json(api.get_issues(
                    _first(qs, "model"), _first(qs, "type")))
            if path == "/api/issues/manage":
                return self._send_json(api.list_issues(
                    _first(qs, "model"), _first(qs, "type"),
                    _first(qs, "customer"), _first(qs, "symptom_type"), _first(qs, "tag")))
            if path == "/api/analytics":
                return self._send_json(api.analytics())
            if path == "/api/issues/open":
                return self._send_json(api.open_issues())
            if path == "/api/model":
                return self._send_json(api.model_profile(_first(qs, "name")))
            if path == "/api/templates":
                return self._send_json(api.list_templates())
            if path == "/api/issue/photos":
                return self._send_json(api.get_issue_photos(int(_first(qs, "issue_id") or 0)))
            if path == "/api/issues/export":
                content, filename = api.build_issues_export(
                    _first(qs, "model"), _first(qs, "type"),
                    _first(qs, "customer"), _first(qs, "symptom_type"), _first(qs, "tag"))
                return self._send_download(content, filename)
            if path == "/api/audit":
                return self._send_json(api.audit_list(int(_first(qs, "limit") or 100)))
            if path == "/api/chat/history":
                bm = _first(qs, "bookmarked")
                sql = "SELECT * FROM chat_log" + (" WHERE bookmarked=1" if bm else "") + \
                      " ORDER BY id DESC LIMIT ?"
                return self._send_json(db.query(sql, (int(_first(qs, "limit") or 20),)))
            if path == "/api/sync/status":
                from app import sync
                return self._send_json(sync.status())
            if path == "/api/models/duplicates":
                return self._send_json(api.model_duplicates())
            if path == "/api/report/draft":
                return self._send_json(api.weekly_report_draft(
                    _first(qs, "start"), _first(qs, "end")))
            if path == "/api/backup/status":
                from app import backup
                return self._send_json({"backups": backup.list_backups()})
            if path == "/api/chat/config":
                from app import chatbot
                return self._send_json({"config": chatbot.get_config(),
                                        "ollama": chatbot.ollama_status()})
            if path == "/api/photos":
                return self._send_json(api.get_photos(int(_first(qs, "run_id") or 0)))
            if path == "/api/backup":
                content, filename = api.backup_db()
                return self._send_download(content, filename, "application/octet-stream")
            if path == "/api/run/get":
                run = api.get_run(int(_first(qs, "run_id") or 0))
                return self._send_json(run or {}, 200 if run else 404)
            if path == "/api/sample-log":
                return self._send_json({"text": api.sample_log_text(_first(qs, "name")),
                                        "names": api.sample_log_names()})
            if path == "/api/issue-records":
                return self._send_json(api.get_issue_records(
                    _first(qs, "model"), _first(qs, "component")))
            if path == "/api/run/report":
                run_id = int(_first(qs, "run_id") or 0)
                content, filename = api.build_report(run_id)
                if content is None:
                    self.send_error(404, "Not Found")
                    return
                return self._send_download(content, filename)
            if path == "/api/report/weekly":
                start = _first(qs, "start")
                end = _first(qs, "end")
                if not start or not end:
                    return self._send_json({"error": "start, end 날짜가 필요합니다."}, 400)
                content, filename = api.build_weekly_report(start, end)
                return self._send_download(content, filename)
            if path == "/api/history/search":
                return self._send_json(api.search_history({
                    "start": _first(qs, "start"), "end": _first(qs, "end"),
                    "model": _first(qs, "model"), "customer": _first(qs, "customer"),
                    "tester_type": _first(qs, "tester_type"), "result": _first(qs, "result"),
                }))
            if path == "/api/history/export":
                content, filename = api.build_history_export({
                    "start": _first(qs, "start"), "end": _first(qs, "end"),
                    "model": _first(qs, "model"), "customer": _first(qs, "customer"),
                    "tester_type": _first(qs, "tester_type"), "result": _first(qs, "result"),
                })
                return self._send_download(content, filename)

            self.send_error(404, "Not Found")
        except Exception as e:  # noqa: BLE001
            self._send_json({"error": str(e)}, 500)

    # ------------------------------------------------------------ POST
    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        body = self._read_body()
        try:
            if path == "/api/run/start":
                return self._send_json(api.start_run(body))
            if path == "/api/run/checkitem":
                return self._send_json(api.set_check_item(body.get("item_id"), body.get("result")))
            if path == "/api/run/parse":
                return self._send_json(api.parse_log(
                    body.get("run_id"), body.get("text", ""),
                    body.get("tester_type"), body.get("model_name")))
            if path == "/api/run/finish":
                return self._send_json(api.finish_run(
                    body.get("run_id"), body.get("comment", ""),
                    body.get("component"), body.get("symptom_type"),
                    body.get("issue")))
            if path == "/api/tags/suggest":
                return self._send_json(api.suggest_tags(body.get("text", "")))
            if path == "/api/history/delete":
                return self._send_json(api.delete_history(body.get("run_ids", [])))
            if path == "/api/chat":
                from app import chatbot
                res = chatbot.answer(body.get("message", ""))
                # 대화 이력 저장(+답변에 log_id 부여 → 북마크용)
                try:
                    res["log_id"] = db.execute(
                        "INSERT INTO chat_log(question,reply,mode) VALUES (?,?,?)",
                        (body.get("message", ""), res.get("reply", ""), res.get("mode", "")))
                except Exception:
                    pass
                return self._send_json(res)
            if path == "/api/chat/bookmark":
                db.execute("UPDATE chat_log SET bookmarked=? WHERE id=?",
                           (1 if body.get("on") else 0, int(body.get("id") or 0)))
                return self._send_json({"ok": True})
            if path == "/api/issues/similar":
                return self._send_json(api.similar_issues(body.get("text", "")))
            if path == "/api/issue/quick":
                return self._send_json(api.quick_add_issue(body.get("text", "")))
            if path == "/api/template/save":
                return self._send_json(api.save_template(body.get("text", "")))
            if path == "/api/template/delete":
                return self._send_json(api.delete_template(body.get("id")))
            if path == "/api/issue/photo":
                return self._send_json(api.save_issue_photo(
                    body.get("issue_id"), body.get("filename"), body.get("data"),
                    body.get("photo_type", ""), body.get("caption", "")))
            if path == "/api/issue/photo/update":
                return self._send_json(api.update_issue_photo(
                    body.get("id"), body.get("photo_type"), body.get("caption")))
            if path == "/api/issue/photo/delete":
                return self._send_json(api.delete_issue_photo(body.get("id")))
            if path == "/api/issue/paste":
                return self._send_json(api.paste_import(
                    body.get("model_name"), body.get("customer", ""),
                    body.get("tester_type", ""), body.get("text", "")))
            if path == "/api/sync/start":
                from app import sync
                return self._send_json(sync.start())
            if path == "/api/models/merge":
                return self._send_json(api.merge_models(
                    body.get("from", []), body.get("to", "")))
            if path == "/api/chat/config":
                from app import chatbot
                cfg = chatbot.set_config(body.get("provider"), body.get("model"))
                return self._send_json({"config": cfg, "ollama": chatbot.ollama_status()})
            if path == "/api/issue/save":
                return self._send_json(api.save_issue(body))
            if path == "/api/issue/delete":
                return self._send_json(api.delete_issue(body.get("id")))
            if path == "/api/run/photo":
                return self._send_json(api.save_photo(
                    body.get("run_id"), body.get("photo_type"),
                    body.get("filename"), body.get("data")))
            if path == "/api/photo/delete":
                return self._send_json(api.delete_photo(body.get("id")))
            self.send_error(404, "Not Found")
        except Exception as e:  # noqa: BLE001
            self._send_json({"error": str(e)}, 500)

    def log_message(self, fmt, *args):  # 조용한 로그
        pass


def _first(qs, key):
    v = qs.get(key)
    return v[0] if v else None


def make_server(host, port):
    """서버 객체 생성(바인딩까지). 포트가 사용 중이면 OSError를 던진다."""
    db.init_db()
    from app import backup
    backup.auto_backup()          # 시작 시 오늘자 자동 백업
    return ThreadingHTTPServer((host, port), Handler)


def serve(httpd):
    host, port = httpd.server_address[0], httpd.server_address[1]
    print(f"  KNK 검사기 출하검증 시스템")
    print(f"  → 브라우저에서 접속: http://{host}:{port}")
    print(f"  종료: Ctrl + C  (또는 이 창을 닫기)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 종료합니다.")
        httpd.server_close()


def run(host="127.0.0.1", port=8000):
    serve(make_server(host, port))
