"""대화 기록 저장·조회·삭제 API."""
from fastapi import APIRouter, HTTPException

from app.schemas import Conversation, ConversationCreate, ConversationSummary
from app.services import conversation_service

router = APIRouter(prefix="/api/conversations", tags=["대화"])

NOT_FOUND = "해당 ID의 대화가 없습니다"


@router.get("", response_model=list[ConversationSummary])
def read_conversations():
    """대화 목록(id, 제목, 시각)을 최근 수정 순으로 돌려준다."""
    return conversation_service.list_conversations()


@router.post("", response_model=Conversation, status_code=201)
def create_conversation(body: ConversationCreate):
    """대화를 새로 저장한다."""
    return conversation_service.create_conversation(
        body.title, [m.model_dump() for m in body.messages]
    )


@router.get("/{conv_id}", response_model=Conversation)
def read_conversation(conv_id: str):
    """대화 한 건을 메시지 전체와 함께 돌려준다."""
    conv = conversation_service.get_conversation(conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return conv


@router.delete("/{conv_id}")
def delete_conversation(conv_id: str):
    """대화를 삭제한다."""
    if not conversation_service.delete_conversation(conv_id):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return {"deleted": conv_id}
