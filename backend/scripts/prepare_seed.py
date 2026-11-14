"""지난 미션의 주간 데이터를 (date, value, memo) 시드 파일로 바꾸고 요약을 미리 계산해 본다."""
import csv
import statistics
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SOURCE = DATA_DIR / "weekly_clean.csv"
SEED = DATA_DIR / "seed.csv"

WINDOW = 8        # 최근 추세 비교에 쓰는 주 수
FLAT_RATE = 5.0   # 변화율 절대값이 이 값(%) 이하이면 '유지'


def build_rows():
    """weekly_clean.csv를 읽어 date, value, memo 목록을 만든다."""
    rows = []
    with SOURCE.open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            memo = ""
            if r["is_outlier"] == "True":
                direction = "급증" if float(r["deviation"]) > 0 else "급감"
                memo = f"관심도 {direction}(이상치)"
            rows.append(
                {"date": r["date"], "value": int(float(r["value"])), "memo": memo}
            )
    rows.sort(key=lambda x: x["date"])
    return rows


def write_seed(rows):
    """시드 파일을 저장한다. 엑셀에서도 한글이 깨지지 않도록 utf-8-sig로 쓴다."""
    with SEED.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["date", "value", "memo"])
        writer.writeheader()
        writer.writerows(rows)


def summarize(rows):
    """GPT 시스템 프롬프트에 넣을 요약 정보를 계산한다."""
    values = [r["value"] for r in rows]
    max_row = max(rows, key=lambda r: r["value"])
    min_row = min(rows, key=lambda r: r["value"])

    recent = statistics.mean(values[-WINDOW:])
    previous = statistics.mean(values[-2 * WINDOW:-WINDOW])
    rate = (recent - previous) / previous * 100 if previous else 0.0

    if rate > FLAT_RATE:
        trend = "상승"
    elif rate < -FLAT_RATE:
        trend = "하락"
    else:
        trend = "유지"

    return {
        "period": f"{rows[0]['date']} ~ {rows[-1]['date']}",
        "count": len(rows),
        "metrics": {
            "average": round(statistics.mean(values), 1),
            "max": {"value": max_row["value"], "date": max_row["date"]},
            "min": {"value": min_row["value"], "date": min_row["date"]},
            "latest": {"value": rows[-1]["value"], "date": rows[-1]["date"]},
        },
        "trend": f"{trend} (최근 {WINDOW}주 평균 {recent:.1f}, 직전 {WINDOW}주 평균 {previous:.1f}, 변화율 {rate:+.1f}%)",
    }


def main():
    rows = build_rows()
    write_seed(rows)
    memo_count = sum(1 for r in rows if r["memo"])

    print(f"시드 파일 저장: {SEED.name}")
    print(f"데이터 개수: {len(rows)}개 (과제 최소 100개)")
    print(f"memo가 있는 주: {memo_count}개")
    print("처음 3줄:")
    for r in rows[:3]:
        print("  ", r)
    print("요약 미리보기:")
    summary = summarize(rows)
    for key, value in summary.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()