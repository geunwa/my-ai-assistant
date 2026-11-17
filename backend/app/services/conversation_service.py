"""conversations 컬렉션의 읽기·쓰기를 맡는다. 라우터는 이 함수들만 부른다."""
from datetime import datetime, timezone

from app.db import get_db

COLLECTION = "conversations"


def _now() -> str:
    """현재 시각을 UTC ISO 문자열로 돌려준다. 문자열 정렬이 곧 시간순이다."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _col():
    return get_db().collection(COLLECTION)


def list_conversations() -> list[dict]:
    """최근 수정 순으로 목록을 돌려준다. 메시지 본문은 뺀다."""
    docs = _col().order_by("updated_at", direction="DESCENDING").stream()
    result = []
    for doc in docs:
        d = doc.to_dict()
        result.append(
            {
                "id": doc.id,
                "title": d["title"],
                "created_at": d["created_at"],
                "updated_at": d["updated_at"],
            }
        )
    return result


def get_conversation(conv_id: str) -> dict | None:
    """대화 한 건을 메시지까지 돌려준다. 없으면 None."""
    doc = _col().document(conv_id).get()
    if not doc.exists:
        return None
    return {"id": doc.id, **doc.to_dict()}


def create_conversation(title: str, messages: list[dict]) -> dict:
    """새 대화를 만든다. 문서 ID는 Firestore가 자동으로 정한다."""
    now = _now()
    payload = {"title": title, "messages": messages, "created_at": now, "updated_at": now}
    ref = _col().document()
    ref.set(payload)
    return {"id": ref.id, **payload}


def delete_conversation(conv_id: str) -> bool:
    """대화를 삭제한다. 없으면 False."""
    ref = _col().document(conv_id)
    if not ref.get().exists:
        return False
    ref.delete()
    return True


def append_messages(conv_id: str, new_messages: list[dict]) -> None:
    """기존 대화 끝에 메시지를 붙이고 updated_at을 갱신한다."""
    ref = _col().document(conv_id)
    doc = ref.get().to_dict()
    ref.update({"messages": doc["messages"] + new_messages, "updated_at": _now()})
