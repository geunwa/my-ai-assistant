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