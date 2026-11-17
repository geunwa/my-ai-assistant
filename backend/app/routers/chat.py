"""AI 비서 채팅 API."""
from fastapi import APIRouter, HTTPException

from app.schemas import ChatRequest, ChatResponse
from app.services import chat_service

router = APIRouter(prefix="/api/chat", tags=["채팅"])


@router.post("", response_model=ChatResponse)
def post_chat(body: ChatRequest):
    """질문에 답한다. conversation_id가 없으면 새 대화를 만들고, 있으면 이어서 저장한다."""
    try:
        return chat_service.chat(body.message, body.conversation_id)
    except chat_service.ChatError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
