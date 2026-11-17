"""FastAPI 앱 진입점: 앱 초기화, CORS 설정, 라우터 연결."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_allowed_origins
from app.routers import chat, conversations, data, health

app = FastAPI(
    title="나만의 AI 비서 API",
    description="해외여행 검색 관심도 데이터를 이해하고 답하는 AI 비서",
    version="0.1.0",
)

# 허용한 주소의 웹페이지만 이 서버를 호출할 수 있게 한다
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(data.router)
app.include_router(conversations.router)
app.include_router(chat.router)
