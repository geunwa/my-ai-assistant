"""환경 변수를 읽어 앱 설정값으로 제공한다."""
import os
from pathlib import Path

from dotenv import load_dotenv

# backend/.env 파일을 위치로 직접 지정해 읽는다 (없으면 무시)
# 실행 위치나 uvicorn --reload 방식과 관계없이 항상 같은 파일을 읽게 하려는 설정이다
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_PATH)

# 환경 변수가 없을 때 쓰는 로컬 개발용 기본값
DEFAULT_ALLOWED_ORIGINS = "http://localhost:5500,http://127.0.0.1:5500"


def get_allowed_origins() -> list[str]:
    """쉼표로 구분된 ALLOWED_ORIGINS를 주소 목록으로 바꾼다."""
    raw = os.getenv("ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS)
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]


def get_firebase_json() -> str | None:
    """배포 환경용: 서비스 계정 키 파일의 JSON 내용 전체를 담은 환경 변수."""
    return os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")


def get_firebase_path() -> str | None:
    """내 PC용: 서비스 계정 키 파일의 경로를 담은 환경 변수."""
    return os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")

# OpenAI 기본값: 작고 싼 모델과 짧은 답변 한도
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_OPENAI_MAX_TOKENS = 400


def get_openai_api_key() -> str | None:
    """OpenAI API 키. 없으면 None (채팅만 막고 서버는 계속 동작한다)."""
    return os.getenv("OPENAI_API_KEY") or None


def get_openai_model() -> str:
    """사용할 모델 이름. OPENAI_MODEL로 바꿀 수 있다."""
    return os.getenv("OPENAI_MODEL") or DEFAULT_OPENAI_MODEL


def get_openai_max_tokens() -> int:
    """답변 최대 토큰 수. OPENAI_MAX_TOKENS로 바꿀 수 있고, 잘못된 값이면 기본값을 쓴다."""
    try:
        value = int(os.getenv("OPENAI_MAX_TOKENS", ""))
    except ValueError:
        return DEFAULT_OPENAI_MAX_TOKENS
    return value if value > 0 else DEFAULT_OPENAI_MAX_TOKENS
