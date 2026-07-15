"""2단계 문서 자동화 — 검증 완료 데이터를 엑셀 체크시트로 출력. openpyxl 사용."""
import io

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from app import db

HEADER_FILL = PatternFill("solid", fgColor="1F2937")
HEADER_FONT = Font(color="FFFFFF", bold=True)
SECTION_FILL = PatternFill("solid", fgColor="E5E7EB")
PASS_FILL = PatternFill("solid", fgColor="DCFCE7")
FAIL_FILL = PatternFill("solid", fgColor="FEE2E2")
ALERT_FILL = PatternFill("solid", fgColor="FEE2E2")
WARN_FILL = PatternFill("solid", fgColor="FEF3C7")
THIN = Side(style="thin", color="D1D5DB")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def _run_data(run_id):
    run = db.query(
        "SELECT r.*, t.model_name, t.model_rev, t.tester_type, t.unit_no, t.customer "
        "FROM inspection_run r JOIN tester t ON t.tester_id = r.tester_id WHERE r.run_id = ?",
        (run_id,), one=True,
    )
    if not run:
        return None
    run["check_items"] = db.query("SELECT * FROM check_item WHERE run_id = ? ORDER BY seq", (run_id,))
    run["measurements"] = db.query(
        "SELECT * FROM measurement WHERE run_id = ? AND repeat_index IS NULL ORDER BY item", (run_id,)
    )
    return run


def _kv_row(ws, row, label, value):
    ws.cell(row=row, column=1, value=label).font = Font(bold=True)
    ws.cell(row=row, column=1).fill = SECTION_FILL
    ws.cell(row=row, column=2, value=value)
    for col in (1, 2):
        ws.cell(row=row, column=col).border = BORDER


def build_checksheet(run_id):
    """검증 세션 1건에 대한 체크시트 엑셀(bytes)을 생성. run이 없으면 None."""
    run = _run_data(run_id)
    if not run:
        return None, None

    wb = Workbook()
    ws = wb.active
    ws.title = "체크시트"
    ws.column_dimensions["A"].width = 20
    ws.column_dimensions["B"].width = 34
    ws.column_dimensions["C"].width = 34
    ws.column_dimensions["D"].width = 16

    ws.merge_cells("A1:D1")
    ws["A1"] = "KNK 검사기 출하검증 체크시트"
    ws["A1"].font = Font(size=16, bold=True)
    ws["A1"].alignment = Alignment(horizontal="center")
    ws.row_dimensions[1].height = 28

    row = 3
    for label, value in [
        ("모델명 / REV", f"{run['model_name']} / {run['model_rev'] or '-'}"),
        ("검사기 종류 / 호기", f"{run['tester_type']} / {run['unit_no'] or '-'}호기"),
        ("고객사", run["customer"] or "-"),
        ("검사자 / 검증 모드", f"{run['inspector']} / {run['verify_mode']}"),
        ("검증일", run["run_date"]),
        ("종합 판정", run["result"]),
    ]:
        _kv_row(ws, row, label, value)
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="검사 항목 결과 (Check Sheet)").font = Font(bold=True, size=12)
    row += 1
    headers = ["No", "구분", "항목", "판정"]
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=row, column=col, value=h)
        c.font = HEADER_FONT
        c.fill = HEADER_FILL
        c.border = BORDER
        c.alignment = Alignment(horizontal="center")
    row += 1
    for it in run["check_items"]:
        ws.cell(row=row, column=1, value=it["seq"]).border = BORDER
        ws.cell(row=row, column=2, value=it["category"]).border = BORDER
        ws.cell(row=row, column=3, value=it["item_name"]).border = BORDER
        rcell = ws.cell(row=row, column=4, value=it["result"])
        rcell.border = BORDER
        rcell.alignment = Alignment(horizontal="center")
        if it["result"] == "PASS":
            rcell.fill = PASS_FILL
        elif it["result"] == "FAIL":
            rcell.fill = FAIL_FILL
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="측정 데이터 (Log 자동 판정)").font = Font(bold=True, size=12)
    row += 1
    headers = ["측정 항목", "실측값", "규격(low~high)", "판정"]
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=row, column=col, value=h)
        c.font = HEADER_FONT
        c.fill = HEADER_FILL
        c.border = BORDER
        c.alignment = Alignment(horizontal="center")
    row += 1
    if run["measurements"]:
        for m in run["measurements"]:
            ws.cell(row=row, column=1, value=m["item"]).border = BORDER
            ws.cell(row=row, column=2, value=m["value"]).border = BORDER
            ws.cell(row=row, column=3, value=f"{m['spec_low']} ~ {m['spec_high']}").border = BORDER
            jcell = ws.cell(row=row, column=4, value=m["judge"])
            jcell.border = BORDER
            jcell.alignment = Alignment(horizontal="center")
            if m["judge"] == "알림":
                jcell.fill = ALERT_FILL
            elif m["judge"] == "주의":
                jcell.fill = WARN_FILL
            row += 1
    else:
        ws.cell(row=row, column=1, value="측정 데이터 없음")
        row += 1

    row += 1
    ws.cell(row=row, column=1, value="검사자 의견").font = Font(bold=True, size=12)
    row += 1
    ws.merge_cells(start_row=row, start_column=1, end_row=row + 2, end_column=4)
    c = ws.cell(row=row, column=1, value=run["inspector_comment"] or "-")
    c.alignment = Alignment(wrap_text=True, vertical="top")
    c.border = BORDER

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    safe_model = "".join(ch for ch in run["model_name"] if ch not in '\\/:*?"<>|')
    date_part = (run["run_date"] or "")[:10].replace("-", "")
    filename = f"체크시트_{safe_model}_{date_part}.xlsx"
    return buf.read(), filename
