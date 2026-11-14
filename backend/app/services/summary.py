"""데이터 목록에서 요약 정보를 계산한다. Firestore와 무관한 순수 계산 함수."""
import statistics

WINDOW = 8        # 최근 추세 비교에 쓰는 주 수
FLAT_RATE = 5.0   # 변화율 절대값이 이 값(%) 이하이면 '유지'


def build_summary(rows: list[dict]) -> dict:
    """date, value를 가진 항목 목록으로 기간·개수·지표·추세를 만든다."""
    if not rows:
        return {"period": None, "count": 0, "metrics": None, "trend": "데이터가 없습니다"}

    rows = sorted(rows, key=lambda r: r["date"])
    values = [r["value"] for r in rows]
    max_row = max(rows, key=lambda r: r["value"])
    min_row = min(rows, key=lambda r: r["value"])

    if len(values) < 2 * WINDOW:
        trend = f"판단 불가 (추세 계산에는 데이터가 {2 * WINDOW}개 이상 필요)"
    else:
        recent = statistics.mean(values[-WINDOW:])
        previous = statistics.mean(values[-2 * WINDOW:-WINDOW])
        rate = (recent - previous) / previous * 100 if previous else 0.0
        if rate > FLAT_RATE:
            label = "상승"
        elif rate < -FLAT_RATE:
            label = "하락"
        else:
            label = "유지"
        trend = (
            f"{label} (최근 {WINDOW}주 평균 {recent:.1f}, "
            f"직전 {WINDOW}주 평균 {previous:.1f}, 변화율 {rate:+.1f}%)"
        )

    return {
        "period": f"{rows[0]['date']} ~ {rows[-1]['date']}",
        "count": len(rows),
        "metrics": {
            "average": round(statistics.mean(values), 1),
            "max": {"value": max_row["value"], "date": max_row["date"]},
            "min": {"value": min_row["value"], "date": min_row["date"]},
            "latest": {"value": rows[-1]["value"], "date": rows[-1]["date"]},
        },
        "trend": trend,
    }