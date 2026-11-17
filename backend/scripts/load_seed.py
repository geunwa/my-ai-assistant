"""seed.csv를 Firestore data 컬렉션에 넣는다.

- 컬렉션에 이미 문서가 있으면 아무것도 쓰지 않고 멈춘 뒤 진행 여부를 묻는다.
- --dry-run: CSV만 검사하고 Firestore에는 접속하지 않는다.
"""
import argparse
import csv
import sys
from pathlib import Path

# scripts 폴더에서 실행해도 app 폴더를 찾을 수 있게 backend 폴더를 경로에 추가한다
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.schemas import DataCreate  # noqa: E402

SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "seed.csv"
COLLECTION = "data"
BATCH_SIZE = 400  # Firestore 배치 한도(500건)보다 작게 나눈다


def read_seed() -> list[dict]:
    """CSV를 읽고 API와 같은 스키마로 한 줄씩 검증한다."""
    items = []
    # utf-8-sig: 파일 맨 앞의 BOM을 제거한다
    with open(SEED_PATH, encoding="utf-8-sig", newline="") as f:
        for line_no, row in enumerate(csv.DictReader(f), start=2):
            try:
                item = DataCreate(
                    date=row["date"], value=float(row["value"]), memo=row.get("memo") or ""
                )
            except Exception as e:
                sys.exit(f"seed.csv {line_no}번째 줄 오류: {e}")
            items.append(item.model_dump())
    return items


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="CSV만 검사하고 쓰지 않는다")
    args = parser.parse_args()

    items = read_seed()
    dates = [i["date"] for i in items]
    print(f"CSV 검사 통과: {len(items)}건, 기간 {min(dates)} ~ {max(dates)}")
    if len(set(dates)) != len(dates):
        sys.exit("중복된 날짜가 있어 중단합니다.")
    if args.dry_run:
        print("dry-run: Firestore에는 쓰지 않았습니다.")
        return

    from app.db import get_db

    db = get_db()
    col = db.collection(COLLECTION)
    existing = len(list(col.limit(1).stream()))
    if existing:
        count = len(list(col.stream()))
        print(f"data 컬렉션에 이미 {count}건이 있습니다. 중복을 막기 위해 멈춥니다.")
        print("기존 데이터를 그대로 두고 추가하려면 y를 입력하세요 (그 외 입력은 취소).")
        if not sys.stdin.isatty() or input("> ").strip().lower() != "y":
            sys.exit("취소했습니다. 아무것도 쓰지 않았습니다.")

    written = 0
    for start in range(0, len(items), BATCH_SIZE):
        batch = db.batch()
        for item in items[start : start + BATCH_SIZE]:
            batch.set(col.document(), item)
        batch.commit()
        written += len(items[start : start + BATCH_SIZE])
        print(f"{written}/{len(items)}건 기록")
    print("적재 완료")


if __name__ == "__main__":
    main()
