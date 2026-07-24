# -*- coding: utf-8 -*-
"""Z: 파일서버 연동 — 출하검증 폴더의 사진/엑셀을 '읽기 전용'으로 가져온다.

원칙: 이 모듈은 Z: 서버에 절대 쓰지 않는다.
  - 허용: 폴더 목록 읽기, 파일 읽기, 탐색기로 폴더 열기(보기 전용)
  - 금지: 생성/수정/삭제/이동 — 그런 코드는 이 파일에 넣지 말 것

폴더 규약 (예: SM-S952 기능검사기)
  Z:\\드림텍\\제조\\SM-S952\\SUB\\1. 011T2606_기능검사기\\10. 출하검증\\
      ├ 출하이슈사항정리.xlsx                 ← 이슈 원문(미리보기/이관 대상)
      └ 1,2호기 MODIFY(260715)\\              ← 검증 세션(호기 + 날짜)
          ├ DATA\\                            ← 로그
          └ 출하사진\\
              ├ *.JPG                         ← 출하사진
              ├ 마킹\\*.JPG                   ← 마킹 사진
              └ 인주TEST\\*.JPG               ← 인주테스트 사진
"""
import os
import re
import time
import urllib.parse

CUSTOMERS = ["드림텍", "두성테크", "한국성전"]

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
VIDEO_EXT = {".mp4", ".mov", ".avi"}
EXCEL_EXT = {".xlsx", ".xlsm", ".xls"}

VERIFY_DIR_KEY = "출하검증"
PHOTO_DIR_KEY = "출하사진"
MARKING_KEYS = ("마킹",)
INK_KEYS = ("인주",)

_CACHE = {}
_CACHE_TTL = 300          # 네트워크 드라이브 목록 조회는 느려서 5분 캐시


# ---------------------------------------------------------------- 경로 기본
def _root():
    from app import sync
    return os.path.abspath(sync.get_server_path()["path"] or "Z:\\")


def available():
    """Z: 서버에 접근 가능한지 (Vercel 등 사내망 밖이면 False)."""
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return False
    try:
        return os.path.isdir(_root())
    except OSError:
        return False


def _safe(path):
    """서버 루트 밖 경로 차단 (경로 조작 방어). 통과하면 절대경로를 돌려준다."""
    if not path:
        raise ValueError("경로가 필요합니다.")
    p = os.path.abspath(path)
    # 드라이브 루트("Z:\\")는 이미 구분자로 끝나므로 중복 붙이지 않도록 정리
    root = os.path.normcase(_root()).rstrip("\\/")
    if os.path.normcase(p) != root and \
       not os.path.normcase(p).startswith(root + os.sep):
        raise ValueError("서버(Z:) 밖의 경로에는 접근할 수 없습니다.")
    if not os.path.exists(p):
        raise ValueError("파일 또는 폴더를 찾을 수 없습니다.")
    return p


def _cached(key, fn):
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < _CACHE_TTL:
        return hit[1]
    val = fn()
    _CACHE[key] = (time.time(), val)
    return val


def clear_cache():
    _CACHE.clear()


def _listdirs(path):
    """하위 폴더 이름 목록 (접근 불가/없음이면 빈 목록)."""
    def scan():
        try:
            return sorted(d.name for d in os.scandir(path) if d.is_dir())
        except OSError:
            return []
    return _cached(("dirs", os.path.normcase(path)), scan)


def _listfiles(path):
    def scan():
        try:
            return sorted(d.name for d in os.scandir(path) if d.is_file())
        except OSError:
            return []
    return _cached(("files", os.path.normcase(path)), scan)


# ---------------------------------------------------------------- 모델 찾기
def _norm(s):
    return re.sub(r"[^0-9A-Z가-힣]", "", (s or "").upper())


def _model_match(dir_name, model):
    """폴더명이 모델명과 같은 대상인지. DB 모델명은 부위가 붙기도 한다
       (DB "SM-S952 SUB" ↔ 폴더 "SM-S952")."""
    d, m = _norm(dir_name), _norm(model)
    if not d or not m:
        return False
    return d == m or (len(d) >= 4 and m.startswith(d))


def find_model_dirs(model):
    """모델 폴더 후보 목록. 경로: <루트>/<고객사>/<카테고리>/<모델>"""
    root = _root()
    out = []
    for cust in CUSTOMERS:
        cdir = os.path.join(root, cust)
        if not os.path.isdir(cdir):
            continue
        for cat in _listdirs(cdir):
            catp = os.path.join(cdir, cat)
            for name in _listdirs(catp):
                if _model_match(name, model):
                    out.append({"customer": cust, "category": cat,
                                "dir": name, "path": os.path.join(catp, name)})
    return out


def _find_verify_dirs(model_dir, max_depth=3):
    """모델 폴더 아래에서 '10. 출하검증' 폴더들을 찾는다(검사기 폴더별로 1개씩)."""
    found = []

    def walk(path, depth):
        for name in _listdirs(path):
            sub = os.path.join(path, name)
            if VERIFY_DIR_KEY in name:
                found.append(sub)
            elif depth < max_depth:
                walk(sub, depth + 1)

    walk(model_dir, 0)
    return found


def _tester_type(dir_name):
    """검사기 폴더명 → 표준 검사기 종류 (tools/import_issues.norm_tester 와 동일 규칙)."""
    s = re.sub(r"^\s*\d+\s*[.\-]\s*", "", dir_name or "")
    low = s.lower()
    for keys, std in [(["방수", "wp", "water"], "방수"), (["vswr"], "VSWR"),
                      (["lna"], "LNA"), (["proximity", "근조도", "조도"], "PROXIMITY"),
                      (["지문", "finger"], "지문"), (["tsp", "touch", "터치"], "TSP")]:
        if any(k in low for k in keys):
            return std
    return "기능검사기"


# ---------------------------------------------------------------- 사진 수집
def file_url(path, thumb=False):
    return ("/api/z/file?path=" + urllib.parse.quote(path, safe="")
            + ("&thumb=1" if thumb else ""))


def _photos_in(path):
    out = []
    for name in _listfiles(path):
        ext = os.path.splitext(name)[1].lower()
        if ext in IMAGE_EXT or ext in VIDEO_EXT:
            full = os.path.join(path, name)
            is_video = ext in VIDEO_EXT
            out.append({"name": name, "path": full, "url": file_url(full),
                        "thumb": file_url(full, thumb=not is_video),
                        "video": is_video})
    return out


def _session_photos(session_dir):
    """세션 폴더의 사진을 출하사진 / 마킹 / 인주TEST 로 분류."""
    base = session_dir
    for name in _listdirs(session_dir):
        if PHOTO_DIR_KEY in name:
            base = os.path.join(session_dir, name)
            break

    groups = {"출하사진": _photos_in(base), "마킹": [], "인주TEST": []}
    for name in _listdirs(base):
        sub = os.path.join(base, name)
        if any(k in name for k in MARKING_KEYS):
            groups["마킹"] += _photos_in(sub)
        elif any(k in name for k in INK_KEYS):
            groups["인주TEST"] += _photos_in(sub)
    return {"photo_dir": base, "groups": groups}


UNIT_RE = re.compile(r"(\d+(?:\s*[,~]\s*\d+)*)\s*호기")
SESSION_DATE_RE = re.compile(r"\((\d{6})\)")


def _session_units(name):
    """'1,2호기 MODIFY(260715)' → [1, 2] / '3~7호기' → [3,4,5,6,7]"""
    m = UNIT_RE.search(name or "")
    if not m:
        return []
    return parse_units(m.group(1))


def _session_date(name):
    m = SESSION_DATE_RE.search(name or "")
    if not m:
        return None
    s = m.group(1)
    return f"20{s[0:2]}-{s[2:4]}-{s[4:6]}"


def parse_units(text):
    """'1' / '3~7' / '1,2,5' / '3-7' → 정수 리스트(중복 제거·정렬)."""
    units = set()
    for part in re.split(r"[,/\s]+", (text or "").replace("호기", "").strip()):
        if not part:
            continue
        m = re.match(r"^(\d+)\s*[~\-]\s*(\d+)$", part)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            if a > b:
                a, b = b, a
            if b - a <= 99:
                units.update(range(a, b + 1))
        elif part.isdigit():
            units.add(int(part))
    return sorted(units)


def unit_label(units):
    """[3,4,5,6,7] → '3~7호기' / [1,2] → '1,2호기' / [] → ''"""
    if not units:
        return ""
    if len(units) == 1:
        return f"{units[0]}호기"
    # 3대 이상 연속이면 범위 표기("3~7호기"), 2대면 나열이 자연스럽다("1,2호기")
    if len(units) >= 3 and units == list(range(units[0], units[-1] + 1)):
        return f"{units[0]}~{units[-1]}호기"
    return ",".join(str(u) for u in units) + "호기"


# ---------------------------------------------------------------- 모델 자료
def model_assets(model, tester_type=None):
    """모델의 Z: 서버 자료 — 출하이슈 엑셀 + 세션별(호기별) 사진."""
    if not available():
        return {"available": False, "model": model, "root": _root(),
                "reason": "사내 서버(Z:)에 접근할 수 없습니다. 회사 PC에서 실행해 주세요.",
                "testers": []}

    testers = []
    for md in find_model_dirs(model):
        for vdir in _find_verify_dirs(md["path"]):
            tdir = os.path.basename(os.path.dirname(vdir))
            ttype = _tester_type(tdir)
            if tester_type and ttype != tester_type:
                continue

            excels = []
            for name in _listfiles(vdir):
                if name.startswith("~$"):
                    continue                      # 엑셀 임시 잠금 파일
                if os.path.splitext(name)[1].lower() in EXCEL_EXT:
                    full = os.path.join(vdir, name)
                    excels.append({"name": name, "path": full,
                                   "locked": _is_locked(full)})

            sessions = []
            for sname in _listdirs(vdir):
                sdir = os.path.join(vdir, sname)
                sp = _session_photos(sdir)
                counts = {k: len(v) for k, v in sp["groups"].items()}
                if not sum(counts.values()):
                    continue
                sessions.append({
                    "name": sname, "path": sdir,
                    "units": _session_units(sname), "date": _session_date(sname),
                    "counts": counts, "groups": sp["groups"],
                })
            sessions.sort(key=lambda s: (s["date"] or "", s["name"]), reverse=True)

            testers.append({
                "customer": md["customer"], "model_dir": md["dir"],
                "tester_dir": tdir, "tester_type": ttype,
                "verify_dir": vdir, "excels": excels, "sessions": sessions,
            })

    return {"available": True, "model": model, "root": _root(), "testers": testers}


def _is_locked(path):
    """엑셀이 열려 있는지 — 같은 폴더의 '~$파일명' 잠금 파일로 판단."""
    d, n = os.path.split(path)
    return os.path.exists(os.path.join(d, "~$" + n))


def prior_unit_photos(model, tester_type=None, exclude_units=()):
    """이전 호기의 마킹 / 인주TEST 사진 이력 — 새 검증 화면에서 비교용으로 보여준다."""
    assets = model_assets(model, tester_type)
    if not assets.get("available"):
        return {"available": False, "reason": assets.get("reason", ""), "sessions": []}

    ex = set(exclude_units or ())
    out = []
    for t in assets["testers"]:
        for s in t["sessions"]:
            marking = s["groups"].get("마킹") or []
            ink = s["groups"].get("인주TEST") or []
            if not marking and not ink:
                continue
            if s["units"] and ex and set(s["units"]) <= ex:
                continue                          # 지금 검증 중인 호기 자신은 제외
            out.append({
                "tester_dir": t["tester_dir"], "tester_type": t["tester_type"],
                "name": s["name"], "path": s["path"],
                "units": s["units"], "unit_label": unit_label(s["units"]),
                "date": s["date"], "마킹": marking, "인주TEST": ink,
            })
    out.sort(key=lambda s: (s["date"] or "", s["name"]), reverse=True)
    return {"available": True, "sessions": out}


# ---------------------------------------------------------------- 파일 읽기
def read_file(path):
    """서버 파일 원본 바이트 (사진 표시용). 읽기 전용."""
    p = _safe(path)
    if not os.path.isfile(p):
        raise ValueError("파일이 아닙니다.")
    if os.path.getsize(p) > 60 * 1024 * 1024:
        raise ValueError("파일이 너무 큽니다(60MB 초과).")
    with open(p, "rb") as f:
        return f.read(), os.path.splitext(p)[1].lower()


# ---------------------------------------------------------------- 썸네일
# 출하사진 원본은 장당 3~4MB라 그리드에 그대로 깔면 브라우저가 멈춘다.
# 카메라 JPEG에 들어 있는 EXIF 내장 썸네일(수십 KB)을 꺼내 쓰고,
# 없으면 Pillow(설치돼 있을 때만)로 축소, 그마저 없으면 원본을 돌려준다.
# 새 의존성을 강제하지 않기 위한 3단 폴백.
def _exif_thumbnail(raw):
    import struct
    if raw[:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 4 <= len(raw):
        if raw[i] != 0xFF:
            return None
        marker, size = raw[i + 1], struct.unpack(">H", raw[i + 2:i + 4])[0]
        if marker == 0xE1 and raw[i + 4:i + 10] == b"Exif\x00\x00":
            return _thumb_from_exif(raw[i + 10:i + 2 + size])
        if marker in (0xDA, 0xD9):
            return None
        i += 2 + size
    return None


def _thumb_from_exif(tiff):
    import struct
    if len(tiff) < 8:
        return None
    end = "<" if tiff[:2] == b"II" else ">" if tiff[:2] == b"MM" else None
    if not end:
        return None
    try:
        ifd0 = struct.unpack(end + "I", tiff[4:8])[0]
        n = struct.unpack(end + "H", tiff[ifd0:ifd0 + 2])[0]
        ifd1 = struct.unpack(end + "I", tiff[ifd0 + 2 + n * 12:ifd0 + 6 + n * 12])[0]
        if not ifd1 or ifd1 >= len(tiff):
            return None
        n1 = struct.unpack(end + "H", tiff[ifd1:ifd1 + 2])[0]
        off = length = None
        for k in range(n1):
            e = ifd1 + 2 + k * 12
            tag = struct.unpack(end + "H", tiff[e:e + 2])[0]
            val = struct.unpack(end + "I", tiff[e + 8:e + 12])[0]
            if tag == 0x0201:
                off = val
            elif tag == 0x0202:
                length = val
        if off is None or not length:
            return None
        data = tiff[off:off + length]
        return data if data[:2] == b"\xff\xd8" else None
    except (struct.error, IndexError):
        return None


def _pillow_thumbnail(path):
    try:
        from PIL import Image                                       # 선택적 의존성
    except ImportError:
        return None
    try:
        import io
        im = Image.open(path)
        im.thumbnail((480, 480))
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=80)
        return buf.getvalue()
    except Exception:                                               # noqa: BLE001
        return None


def read_thumbnail(path):
    """그리드용 축소 이미지. 캐시에 두어 네트워크 드라이브를 반복해 읽지 않는다."""
    p = _safe(path)
    if os.path.splitext(p)[1].lower() not in IMAGE_EXT:
        raise ValueError("이미지가 아닙니다.")

    from app import db
    import hashlib
    st = os.stat(p)
    key = hashlib.sha1(f"{os.path.normcase(p)}|{st.st_mtime_ns}|{st.st_size}"
                       .encode("utf-8")).hexdigest()
    cdir = os.path.join(db.DATA_DIR, "zthumb")
    cpath = os.path.join(cdir, key + ".jpg")
    if os.path.isfile(cpath):
        with open(cpath, "rb") as f:
            return f.read(), ".jpg"

    with open(p, "rb") as f:
        raw = f.read()
    thumb = _exif_thumbnail(raw) or _pillow_thumbnail(p)
    if not thumb:
        return raw, os.path.splitext(p)[1].lower()      # 축소 불가 → 원본

    os.makedirs(cdir, exist_ok=True)
    tmp = cpath + ".part"
    with open(tmp, "wb") as f:
        f.write(thumb)
    os.replace(tmp, cpath)
    return thumb, ".jpg"


MAX_PREVIEW_ROWS = 300
MAX_PREVIEW_COLS = 20
EMU_PER_PX = 9525            # 914400 EMU = 1인치 = 96px → 1px = 9525 EMU

# 엑셀(xlsx)은 사실상 zip이다. 셀에 '떠 있는' 그림은 셀 값이 아니라
# xl/drawings/drawingN.xml 의 앵커(from 행/열)로 위치가 잡히고, 실제 이미지는
# xl/media/ 에 들어 있다. openpyxl 이 이 앵커를 놓치는 경우가 있어(선언된 시트
# 범위 밖 열 등) zip 을 직접 열어 파싱한다. 새 의존성 없이 표준 라이브러리만 사용.
_XL_NS = {
    "pr": "http://schemas.openxmlformats.org/package/2006/relationships",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}
_R_ID = "{%s}id" % _XL_NS["r"]
_R_EMBED = "{%s}embed" % _XL_NS["r"]


def _zip_rels(zf, part):
    """part('xl/drawings/drawing1.xml')의 관계파일을 읽어 {rId: target} 반환."""
    import posixpath
    import xml.etree.ElementTree as ET
    d, n = posixpath.split(part)
    rp = posixpath.join(d, "_rels", n + ".rels")
    out = {}
    try:
        root = ET.fromstring(zf.read(rp))
    except KeyError:
        return out
    for rel in root:
        out[rel.get("Id")] = rel.get("Target")
    return out


def _zip_resolve(base, target):
    """상대 target('../media/image1.png')을 base 기준 절대 zip 경로로."""
    import posixpath
    return posixpath.normpath(posixpath.join(posixpath.dirname(base), target))


def _sheet_drawing_map(zf):
    """{시트제목: drawing.xml 경로} — 워크북→시트→드로잉 관계를 따라간다."""
    import xml.etree.ElementTree as ET
    out = {}
    try:
        wb = ET.fromstring(zf.read("xl/workbook.xml"))
    except KeyError:
        return out
    wb_rels = _zip_rels(zf, "xl/workbook.xml")
    sheets = wb.find("main:sheets", _XL_NS)
    if sheets is None:
        return out
    for sh in sheets.findall("main:sheet", _XL_NS):
        title = sh.get("name")
        part = wb_rels.get(sh.get(_R_ID))
        if not part:
            continue
        sheet_part = _zip_resolve("xl/workbook.xml", part)
        try:
            sroot = ET.fromstring(zf.read(sheet_part))
        except KeyError:
            continue
        dr = sroot.find("main:drawing", _XL_NS)
        if dr is None:
            continue
        dtarget = _zip_rels(zf, sheet_part).get(dr.get(_R_ID))
        if dtarget:
            out[title] = _zip_resolve(sheet_part, dtarget)
    return out


def _parse_drawing(zf, drawing_part, with_bytes=False):
    """drawing.xml 의 그림 앵커 목록 → [{row, col, w, h, ext, (bytes)}] (from 행 순)."""
    import xml.etree.ElementTree as ET
    try:
        root = ET.fromstring(zf.read(drawing_part))
    except KeyError:
        return []
    drels = _zip_rels(zf, drawing_part)
    out = []
    for anchor in list(root):
        frm = anchor.find("xdr:from", _XL_NS)
        row = int(frm.findtext("xdr:row", "0", _XL_NS)) if frm is not None else 0
        col = int(frm.findtext("xdr:col", "0", _XL_NS)) if frm is not None else 0
        pic = anchor.find("xdr:pic", _XL_NS)
        if pic is None:
            continue
        blip = pic.find("xdr:blipFill/a:blip", _XL_NS)
        if blip is None:
            continue
        media = drels.get(blip.get(_R_EMBED))
        if not media:
            continue
        media_part = _zip_resolve(drawing_part, media)
        ext_el = pic.find("xdr:spPr/a:xfrm/a:ext", _XL_NS)
        w = int(ext_el.get("cx", "0")) // EMU_PER_PX if ext_el is not None else 0
        h = int(ext_el.get("cy", "0")) // EMU_PER_PX if ext_el is not None else 0
        item = {"row": row, "col": col, "w": w, "h": h,
                "ext": os.path.splitext(media_part)[1].lower() or ".png"}
        if with_bytes:
            try:
                item["bytes"] = zf.read(media_part)
            except KeyError:
                continue
        out.append(item)
    out.sort(key=lambda x: (x["row"], x["col"]))
    return out


def _sheet_images(path, sheet_title, with_bytes=False):
    """한 시트에 박힌 그림 목록(from 행 순). zip 파싱 실패 시 빈 목록."""
    import zipfile
    try:
        zf = zipfile.ZipFile(path)
    except (OSError, zipfile.BadZipFile):
        return []
    with zf:
        dmap = _sheet_drawing_map(zf)
        part = dmap.get(sheet_title)
        if not part:
            return []
        return _parse_drawing(zf, part, with_bytes=with_bytes)


def excel_image(path, sheet, idx):
    """시트의 idx번째 박힌 그림 원본 바이트. 미리보기의 <img>가 호출한다(읽기 전용)."""
    p = _safe(path)
    if os.path.splitext(p)[1].lower() not in EXCEL_EXT:
        raise ValueError("엑셀 파일이 아닙니다.")
    imgs = _sheet_images(p, sheet, with_bytes=True)
    idx = int(idx)
    if idx < 0 or idx >= len(imgs):
        raise ValueError("이미지를 찾을 수 없습니다.")
    return imgs[idx]["bytes"], imgs[idx]["ext"]


def _excel_image_url(path, sheet, idx):
    q = urllib.parse.urlencode({"path": path, "sheet": sheet, "idx": idx})
    return "/api/z/excel-image?" + q


def excel_preview(path):
    """출하이슈사항 엑셀 미리보기 — 텍스트 + 셀에 박힌 사진을 함께 돌려준다(읽기 전용).

    사진은 데이터로 가공하지 않고, 엑셀 원본에 있는 그대로(앵커된 행 옆)에 붙여
    캡처처럼 보이게 한다.
    """
    p = _safe(path)
    if os.path.splitext(p)[1].lower() not in EXCEL_EXT:
        raise ValueError("엑셀 파일이 아닙니다.")
    try:
        import openpyxl
        wb = openpyxl.load_workbook(p, data_only=True, read_only=True)
    except PermissionError:
        raise ValueError(_LOCK_MSG.format(name=os.path.basename(p)))
    except Exception as e:                                          # noqa: BLE001
        raise ValueError(f"엑셀을 읽지 못했습니다: {e}")

    sheets = []
    for ws in wb.worksheets:
        rows, truncated = [], False
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i >= MAX_PREVIEW_ROWS:
                truncated = True
                break
            rows.append([_cell_text(c) for c in row[:MAX_PREVIEW_COLS]])
        while rows and not any(c.strip() for c in rows[-1]):
            rows.pop()
        rows = _drop_empty_cols(rows)               # 병합셀 때문에 생기는 빈 열 정리

        # 박힌 그림 → 앵커된 행(from row, 0-based)에 붙인다. 시트 텍스트 행 순서와 동일.
        imgs = _sheet_images(p, ws.title, with_bytes=False)
        images = [{"row": im["row"], "col": im["col"], "w": im["w"], "h": im["h"],
                   "url": _excel_image_url(p, ws.title, i)}
                  for i, im in enumerate(imgs)]
        sheets.append({"name": ws.title, "rows": rows,
                       "images": images, "truncated": truncated})
    wb.close()
    return {"path": p, "name": os.path.basename(p),
            "locked": _is_locked(p), "sheets": sheets}


def _cell_text(c):
    """셀 값 → 표시 문자열. 날짜는 시각(00:00:00)을 떼고 날짜만 보여준다."""
    import datetime as _dt
    if c is None:
        return ""
    if isinstance(c, _dt.datetime):
        return c.strftime("%Y-%m-%d") if (c.hour, c.minute, c.second) == (0, 0, 0) \
            else c.strftime("%Y-%m-%d %H:%M")
    if isinstance(c, _dt.date):
        return c.strftime("%Y-%m-%d")
    return str(c)


def _drop_empty_cols(rows):
    """전부 빈 열 제거 — 엑셀 병합셀 탓에 생기는 빈 칸이 표를 넓게 만든다."""
    if not rows:
        return rows
    width = max(len(r) for r in rows)
    keep = [i for i in range(width)
            if any(i < len(r) and r[i].strip() for r in rows)]
    return [[(r[i] if i < len(r) else "") for i in keep] for r in rows]


_LOCK_MSG = ("'{name}' 파일이 열려 있어 읽을 수 없습니다.\n"
             "엑셀에서 파일을 저장하고 닫은 뒤 다시 시도해 주세요.")


# 탐색기 폴더 창의 윈도우 클래스 (일반 폴더 / '내 PC' 등)
_EXPLORER_CLASSES = {"CabinetWClass", "ExploreWClass"}


def _explorer_windows():
    """현재 열려 있는 탐색기 폴더 창들의 HWND 집합."""
    import ctypes
    from ctypes import wintypes
    user32 = ctypes.windll.user32
    found = set()
    buf = ctypes.create_unicode_buffer(256)
    proc_ty = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

    def _cb(hwnd, _lparam):
        if user32.IsWindowVisible(hwnd):
            user32.GetClassNameW(hwnd, buf, 256)
            if buf.value in _EXPLORER_CLASSES:
                found.add(hwnd)
        return True

    user32.EnumWindows(proc_ty(_cb), 0)
    return found


def _force_front(hwnd):
    """창을 브라우저(프로그램) 앞으로 끌어올린다.

    핵심: SetWindowPos 로 잠깐 TOPMOST 로 올렸다가 바로 NOTOPMOST 로 내리면,
    포그라운드 권한 없이도 z-order 최상단(브라우저 위)으로 온다.
    거기에 AttachThreadInput 으로 실제 포커스까지 넘긴다.
    64비트에서 핸들이 잘리지 않도록 argtypes 를 반드시 지정한다.
    """
    import ctypes
    from ctypes import wintypes
    user32 = ctypes.windll.user32
    HWND = wintypes.HWND
    user32.ShowWindow.argtypes = [HWND, ctypes.c_int]
    user32.SetWindowPos.argtypes = [HWND, HWND, ctypes.c_int, ctypes.c_int,
                                    ctypes.c_int, ctypes.c_int, wintypes.UINT]
    user32.BringWindowToTop.argtypes = [HWND]
    user32.SetForegroundWindow.argtypes = [HWND]
    user32.GetForegroundWindow.restype = HWND
    user32.GetWindowThreadProcessId.argtypes = [HWND, ctypes.c_void_p]
    user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    user32.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]

    SW_RESTORE = 9
    TOPMOST, NOTOPMOST = HWND(-1), HWND(-2)
    FLAGS = 0x0001 | 0x0002 | 0x0040          # NOSIZE | NOMOVE | SHOWWINDOW
    user32.ShowWindow(hwnd, SW_RESTORE)
    user32.SetWindowPos(hwnd, TOPMOST, 0, 0, 0, 0, FLAGS)
    user32.SetWindowPos(hwnd, NOTOPMOST, 0, 0, 0, 0, FLAGS)
    try:
        fg = user32.GetForegroundWindow()
        fg_thread = user32.GetWindowThreadProcessId(fg, None)
        my_thread = user32.GetWindowThreadProcessId(hwnd, None)
        user32.AttachThreadInput(fg_thread, my_thread, True)
        user32.BringWindowToTop(hwnd)
        user32.SetForegroundWindow(hwnd)
        user32.AttachThreadInput(fg_thread, my_thread, False)
    except Exception:                                     # noqa: BLE001
        pass


def _allow_setforeground():
    """이후 실행되는 프로세스(탐색기)가 스스로 앞으로 나올 수 있게 허용."""
    try:
        import ctypes
        ctypes.windll.user32.AllowSetForegroundWindow(-1)  # ASFW_ANY
    except Exception:                                     # noqa: BLE001
        pass


def _raise_new_explorer(before):
    """열린 탐색기 창을 앞으로 올린다(백그라운드 스레드에서 호출).

    탐색기 기본 설정은 새 창을 만들지 않고 기존 창을 재사용해 폴더로 이동한다.
    그래서 '새 창'뿐 아니라, 새 창이 없으면 방금 활성화된(재사용된) 탐색기 창도
    대상으로 삼는다. 대상이 애매하면(관련 없는 창을 잘못 올리지 않도록) 넘어간다.
    """
    import ctypes
    import time as _t
    from ctypes import wintypes
    user32 = ctypes.windll.user32
    user32.GetForegroundWindow.restype = wintypes.HWND

    target = None
    for _ in range(20):                                   # 최대 ~2초, 새 창 대기
        _t.sleep(0.1)
        new = _explorer_windows() - before
        if new:
            target = next(iter(new))
            break

    if target is None:
        cur = _explorer_windows()
        fg = user32.GetForegroundWindow()
        if fg in cur:                 # 재사용 창이 이미 활성 → 그 창을 확실히 올림
            target = fg
        elif len(cur) == 1:           # 탐색기 창이 하나뿐이면 그게 우리 폴더
            target = next(iter(cur))

    if target:
        _force_front(target)


def open_folder(path):
    """탐색기로 폴더 열기(보기 전용). 파일 경로를 주면 그 파일이 선택된 채로 열린다.

    주의 1: explorer 는 '/select,<경로>' 를 반드시 '하나의 인자'로 받아야 한다.
            ["explorer", "/select,", p] 처럼 나눠 넘기면 사이에 공백이 끼어 무시된다.
    주의 2: 백그라운드(웹서버)에서 띄운 탐색기 창은 기본적으로 브라우저 뒤에 열린다.
            새 창을 찾아 앞으로 끌어올린다(_raise_new_explorer).
    """
    p = _safe(path)
    if os.name != "nt":
        raise ValueError("탐색기 열기는 Windows에서만 지원합니다.")
    import subprocess
    import threading

    before = _explorer_windows()
    _allow_setforeground()

    if os.path.isdir(p):
        os.startfile(p)                                   # noqa: S606
        result = {"ok": True, "path": p, "selected": False}
    else:
        # 파일 → 상위 폴더를 열고 그 파일을 선택. 실패하면 폴더만이라도 연다.
        try:
            subprocess.Popen(f'explorer /select,"{p}"', shell=False)
            result = {"ok": True, "path": p, "selected": True}
        except OSError:
            os.startfile(os.path.dirname(p))              # noqa: S606
            result = {"ok": True, "path": os.path.dirname(p), "selected": False}

    # 창이 뜨는 즉시 앞으로 — 응답은 기다리지 않고 바로 돌려준다.
    threading.Thread(target=_raise_new_explorer, args=(before,), daemon=True).start()
    return result


def verify_folder_for(model, tester_type=None):
    """모델의 '10. 출하검증' 폴더 경로(이슈 작성용 바로가기). 없으면 None."""
    assets = model_assets(model, tester_type)
    if not assets.get("available"):
        return None
    for t in assets["testers"]:
        return t
    return None


# ---------------------------------------------------------------- 이슈 이관
def import_model_issues(model, tester_type=None, customer=""):
    """모델의 출하이슈사항 엑셀을 읽어 프로그램 이슈관리에 반영(멱등, 읽기 전용).

    검증 완료 시 호출된다. 엑셀이 열려 있으면 읽지 못하므로 명확한 경고를 돌려준다.
    """
    if not available():
        return {"ok": False, "error": "사내 서버(Z:)에 접근할 수 없습니다."}

    assets = model_assets(model, tester_type)
    targets = []
    for t in assets.get("testers", []):
        for x in t["excels"]:
            if "이슈" in x["name"]:
                targets.append((t, x))
    if not targets:
        return {"ok": False, "error": "서버에서 출하이슈사항 엑셀을 찾지 못했습니다.",
                "not_found": True}

    locked = [x["name"] for _t, x in targets if x["locked"]]
    if locked:
        return {"ok": False, "locked": True,
                "error": _LOCK_MSG.format(name=", ".join(locked))}

    from app import db, tagging
    import importlib.util
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    spec = importlib.util.spec_from_file_location(
        "knk_import_issues", os.path.join(base, "tools", "import_issues.py"))
    imp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(imp)

    conn = db.get_conn()
    added = updated = 0
    # 이 프로그램이 서버 엑셀에 직접 기록한 내역(server_export_text)은 다시 읽어
    # 들이지 않는다 — 프로그램에 원본 이슈가 이미 있으므로 중복 등록이 된다.
    norm = lambda s: re.sub(r"\s+", " ", str(s or "")).strip()      # noqa: E731
    exported = {norm(r["server_export_text"]) for r in conn.execute(
        "SELECT server_export_text FROM issue_history "
        "WHERE server_export_text IS NOT NULL AND server_export_text != ''").fetchall()}
    try:
        for t, x in targets:
            try:
                entries = imp.read_issue_file(x["path"])
            except PermissionError:
                return {"ok": False, "locked": True,
                        "error": _LOCK_MSG.format(name=x["name"])}
            except Exception as e:                                  # noqa: BLE001
                return {"ok": False, "error": f"'{x['name']}' 읽기 실패: {e}"}

            for e in entries:
                raw = (e.get("raw") or "").strip()
                if not raw:
                    continue
                if norm(raw) in exported:      # 프로그램이 기록한 행 — 원본이 이미 있음
                    updated += 1
                    continue
                symptom = e.get("symptom") or raw
                title = imp.make_title(e.get("unit", ""), symptom, raw)
                note = f"{imp.TAG} 검사기:{t['tester_dir']} · 출처:{x['path']}"
                # 멱등: 같은 모델의 같은 원문이 이미 있으면 건너뛴다
                dup = conn.execute(
                    "SELECT id FROM issue_history WHERE model_name=? AND raw_text=?",
                    (model, raw)).fetchone()
                if dup:
                    updated += 1
                    continue
                conn.execute(
                    """INSERT INTO issue_history
                       (model_name, tester_type, item, symptom, action, note,
                        issue_date, unit_label, customer, board_type, raw_text, title,
                        symptom_type, tags, status)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (model, t["tester_type"], title, symptom, e.get("action") or "",
                     note, e.get("date") or "", e.get("unit") or "",
                     customer or t["customer"], "", raw, title,
                     tagging.classify_category(raw),
                     tagging.tags_field(tagging.auto_tags(raw)), ""))
                added += 1
        conn.commit()
    finally:
        conn.close()

    return {"ok": True, "added": added, "existing": updated,
            "files": [x["name"] for _t, x in targets]}
