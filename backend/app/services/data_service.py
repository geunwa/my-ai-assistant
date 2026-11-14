"""data 컬렉션의 읽기·쓰기를 맡는다. 라우터는 이 함수들만 부른다."""
from app.db import get_db
from app.services.summary import build_summary

COLLECTION = "data"


def _to_item(doc) -> dict:
    """Firestore 문서를 문서 ID가 포함된 딕셔너리로 바꾼다."""
    return {"id": doc.id, **doc.to_dict()}


def list_items() -> list[dict]:
    """모든 데이터를 날짜 오름차순으로 돌려준다."""
    docs = get_db().collection(COLLECTION).order_by("date").stream()
    return [_to_item(doc) for doc in docs]


def create_item(payload: dict) -> dict:
    """새 문서를 만든다. 문서 ID는 Firestore가 자동으로 정한다."""
    ref = get_db().collection(COLLECTION).document()
    ref.set(payload)
    return {"id": ref.id, **payload}


def update_item(item_id: str, changes: dict) -> dict | None:
    """일부 항목만 수정한다. 문서가 없으면 None을 돌려준다."""
    ref = get_db().collection(COLLECTION).document(item_id)
    if not ref.get().exists:
        return None
    ref.update(changes)
    return _to_item(ref.get())


def delete_item(item_id: str) -> bool:
    """문서를 삭제한다. 문서가 없으면 False를 돌려준다."""
    ref = get_db().collection(COLLECTION).document(item_id)
    if not ref.get().exists:
        return False
    ref.delete()
    return True


def get_summary() -> dict:
    """전체 데이터로 요약 정보를 만든다."""
    return build_summary(list_items())