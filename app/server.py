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
}


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

    def _send_xlsx(self, content, filename):
        encoded_name = urllib.parse.quote(filename)
        self.send_response(200)
        self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
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
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        try:
            if path == "/" or path == "/index.html":
                return self._send_file(os.path.join(WEB_DIR, "index.html"))
            if path.startswith("/css/") or path.startswith("/js/"):
                safe = os.path.normpath(path).lstrip("/")
                return self._send_file(os.path.join(WEB_DIR, safe))
            if path == "/favicon.svg":
                return self._send_file(os.path.join(WEB_DIR, "favicon.svg"))

            if path == "/api/bootstrap":
                return self._send_json(api.bootstrap())
            if path == "/api/issues":
                return self._send_json(api.get_issues(
                    _first(qs, "model"), _first(qs, "type")))
            if path == "/api/run/get":
                run = api.get_run(int(_first(qs, "run_id") or 0))
                return self._send_json(run or {}, 200 if run else 404)
            if path == "/api/sample-log":
                return self._send_json({"text": api.sample_log_text()})
            if path == "/api/issue-records":
                return self._send_json(api.get_issue_records(
                    _first(qs, "model"), _first(qs, "component")))
            if path == "/api/run/report":
                run_id = int(_first(qs, "run_id") or 0)
                content, filename = api.build_report(run_id)
                if content is None:
                    self.send_error(404, "Not Found")
                    return
                return self._send_xlsx(content, filename)

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
                    body.get("component"), body.get("symptom_type")))
            self.send_error(404, "Not Found")
        except Exception as e:  # noqa: BLE001
            self._send_json({"error": str(e)}, 500)

    def log_message(self, fmt, *args):  # 조용한 로그
        pass


def _first(qs, key):
    v = qs.get(key)
    return v[0] if v else None


def run(host="127.0.0.1", port=8000):
    db.init_db()
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"  KNK 검사기 출하검증 시스템")
    print(f"  → 브라우저에서 접속: http://{host}:{port}")
    print(f"  종료: Ctrl + C")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 종료합니다.")
        httpd.server_close()
