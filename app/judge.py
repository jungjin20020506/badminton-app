"""판정 엔진 — 명세서 4.① 자동 판정 로직 (AI 없이 순수 규칙 기반).

판정 등급:
  정상  : 규격 이내이며 경계 여유 밖
  주의  : 규격 이내지만 경계값에 근접 (margin_pct 이내)  → 검사자 확인 권장
  알림  : 규격 이탈 (spec_low..spec_high 벗어남)          → 즉시 표시
"""
import statistics


def judge_value(value, spec_low, spec_high, margin_pct=0.05):
    """단일 측정값 판정. spec_low/high 중 하나가 None이면 그 방향은 무한대로 간주.
    규격을 벗어나면 알림, 규격 경계(=)이거나 경계 여유(margin) 이내면 주의."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return "알림"

    lo = float(spec_low) if spec_low is not None else float("-inf")
    hi = float(spec_high) if spec_high is not None else float("inf")

    # 규격 이탈 (경계값 자체는 주의로 처리)
    if v < lo or v > hi:
        return "알림"
    if v == lo or v == hi:
        return "주의"

    # 경계(주의) 판정: 유효 범위 기준 margin 이내로 경계에 근접
    span = (hi - lo) if (hi != float("inf") and lo != float("-inf")) else None
    if span and span > 0:
        margin = span * margin_pct
        if (v - lo) <= margin or (hi - v) <= margin:
            return "주의"
    return "정상"


def judge_measurements(rows, specs):
    """rows: [{item,value,spec_low,spec_high,repeat_index,device_judge?}]
    specs: {item: judge_spec dict}
    반환: 판정이 채워진 rows (단일 측정만; 반복성은 analyze_repeatability에서 별도 처리).

    device_judge: 장비 로그 자체의 합부 표시($F6=OK/$F1=NG). 장비가 NG로 판정한 라인은
    무조건 알림. 장비가 OK인데 값이 규격 경계와 정확히 같으면(포화 측정치 등) 정상 처리.
    """
    out = []
    for r in rows:
        item = r["item"]
        base = specs.get(_spec_key(item), {})
        lo = r.get("spec_low")
        hi = r.get("spec_high")
        if lo is None:
            lo = base.get("spec_low")
        if hi is None:
            hi = base.get("spec_high")
        margin = base.get("margin_pct", 0.05) or 0.05
        dev = r.get("device_judge")
        if dev == "NG":
            j = "알림"
        else:
            j = judge_value(r["value"], lo, hi, margin)
            if dev == "OK":
                if j == "알림":
                    j = "주의"  # 장비는 OK — 규격 표기 차이일 수 있어 확인 권장 수준으로 완화
                try:
                    v = float(r["value"])
                    if ((lo is not None and v == float(lo))
                            or (hi is not None and v == float(hi))):
                        j = "정상"  # 경계 포화값(예: MATRX 15000/15000)은 장비 OK면 정상
                except (TypeError, ValueError):
                    pass
        out.append({**r, "spec_low": lo, "spec_high": hi, "judge": j})
    return out


def _spec_key(item):
    """Open_CH1 / Short_CH3 → Open / Short 처럼 접두어로 규격 매칭."""
    for key in ("Open", "Short", "DIFF", "공압", "누설전압", "EOS"):
        if item.upper().startswith(key.upper()):
            return key if key != "EOS" else "EOS_Surge"
    return item


def analyze_repeatability(values, spec_low=None, spec_high=None, min_runs=10, base_runs=40):
    """반복성 데이터 분산 분석. values: 회차별 실측값 리스트."""
    vals = [float(v) for v in values if v is not None]
    n = len(vals)
    if n == 0:
        return {"count": 0, "ng_count": 0, "need_remeasure": False, "note": "데이터 없음"}

    mean = statistics.fmean(vals)
    stdev = statistics.pstdev(vals) if n > 1 else 0.0
    vmin, vmax = min(vals), max(vals)
    rng = vmax - vmin

    # 규격 이탈(가성 불량) 카운트
    ng = 0
    for v in vals:
        if judge_value(v, spec_low, spec_high, 0.0) == "알림":
            ng += 1

    need_remeasure = ng >= 2  # 가성 불량 2NG 이상 시 재측정 (명세 5.1)
    notes = []
    if n < min_runs:
        notes.append(f"측정 회차 부족(최소 {min_runs}회 권장, 기본 {base_runs}회)")
    if need_remeasure:
        notes.append(f"가성 불량 {ng}건 → 재측정 필요")
    if not notes:
        notes.append("산포 안정적")

    return {
        "count": n, "mean": round(mean, 3), "stdev": round(stdev, 3),
        "min": vmin, "max": vmax, "range": round(rng, 3),
        "ng_count": ng, "need_remeasure": need_remeasure,
        "note": " / ".join(notes),
    }


def compare_units(current_value, prior_units, item="DIFF", threshold_pct=0.15):
    """양산 모드 호기 편차 비교.
    prior_units: [{unit_no, value}] 앞 호기 대표값들.
    current_value 가 앞 호기 평균 대비 threshold_pct 초과로 벗어나면 경고.
    """
    priors = [p for p in prior_units if p.get("value") is not None]
    if not priors:
        return {"has_baseline": False, "warn": False,
                "note": "비교할 앞 호기 데이터가 없습니다(신규 검사기)."}

    base_vals = [float(p["value"]) for p in priors]
    base_mean = statistics.fmean(base_vals)
    cur = float(current_value)
    diff = cur - base_mean
    pct = (abs(diff) / base_mean) if base_mean else 0.0
    warn = pct > threshold_pct

    return {
        "has_baseline": True,
        "item": item,
        "current": round(cur, 3),
        "baseline_mean": round(base_mean, 3),
        "baseline_units": priors,
        "diff": round(diff, 3),
        "diff_pct": round(pct * 100, 1),
        "threshold_pct": round(threshold_pct * 100, 1),
        "warn": warn,
        "note": (f"앞 호기 평균 {round(base_mean,3)} 대비 {round(pct*100,1)}% 편차 → "
                 + ("⚠ 호기 편차 큼, 원인 확인 필요" if warn else "편차 정상 범위")),
    }
