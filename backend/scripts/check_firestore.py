"""Firestore 연결 확인: 테스트 문서를 쓰고, 읽고, 삭제한다."""
import sys
from pathlib import Path

# scripts 폴더에서 실행해도 app 폴더를 찾을 수 있게 backend 폴더를 경로에 추가한다
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import get_db  # noqa: E402

COLLECTION = "connection_test"


def main():
    db = get_db()
    ref = db.collection(COLLECTION).document()

    ref.set({"message": "연결 확인", "ok": True})
    print(f"1. 쓰기 성공: 문서 ID {ref.id}")

    print(f"2. 읽기 성공: {ref.get().to_dict()}")

    ref.delete()
    print(f"3. 삭제 성공: 존재 여부 {ref.get().exists}")
    print("Firestore 연결 정상")


if __name__ == "__main__":
    main()