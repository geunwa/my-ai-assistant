"""환경 변수를 읽어 앱 설정값으로 제공한다."""
import os

from dotenv import load_dotenv

# backend/.env 파일이 있으면 읽어서 환경 변수로 등록한다 (없으면 무시)
load_dotenv()

# 환경 변수가 없을 때 쓰는 로컬 개발용 기본값
DEFAULT_ALLOWED_ORIGINS = "http://localhost:5500,http://127.0.0.1:5500"


def get_allowed_origins() -> list[str]:
    """쉼표로 구분된 ALLOWED_ORIGINS를 주소 목록으로 바꾼다."""
    raw = os.getenv("ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS)
    return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]