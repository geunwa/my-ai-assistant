"""요청과 응답의 형태(스키마)를 정의한다. FastAPI가 이 정의로 입력을 검사하고 Swagger 문서를 만든다."""
from datetime import date as date_type
from typing import Optional

from pydantic import BaseModel, Field, field_validator


def _check_date(value: str) -> str:
    """YYYY-MM-DD 형식의 실제 존재하는 날짜인지 확인한다."""
    try:
        date_type.fromisoformat(value)
    except ValueError:
        raise ValueError("날짜는 YYYY-MM-DD 형식의 실제 날짜여야 합니다")
    if len(value) != 10:
        raise ValueError("날짜는 YYYY-MM-DD 형식이어야 합니다")
    return value


class DataCreate(BaseModel):
    """데이터 추가 요청."""
    date: str = Field(description="주 시작일 (YYYY-MM-DD)", examples=["2026-11-15"])
    value: float = Field(ge=0, le=100, description="검색 관심도 (0~100)", examples=[55])
    memo: str = Field(default="", max_length=200, description="메모 (선택)")

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        return _check_date(v)


class DataUpdate(BaseModel):
    """데이터 수정 요청. 바꿀 항목만 보내면 된다."""
    date: Optional[str] = Field(default=None, description="주 시작일 (YYYY-MM-DD)")
    value: Optional[float] = Field(default=None, ge=0, le=100, description="검색 관심도 (0~100)")
    memo: Optional[str] = Field(default=None, max_length=200, description="메모")

    @field_validator("date")
    @classmethod
    def validate_date(cls, v: Optional[str]) -> Optional[str]:
        return v if v is None else _check_date(v)


class DataItem(BaseModel):
    """데이터 응답. 문서 ID가 함께 온다."""
    id: str
    date: str
    value: float
    memo: str = ""


class PointInfo(BaseModel):
    """값과 그 날짜."""
    value: float
    date: str


class Metrics(BaseModel):
    average: float
    max: PointInfo
    min: PointInfo
    latest: PointInfo


class SummaryResponse(BaseModel):
    """데이터 요약: 기간, 개수, 지표, 최근 추세."""
    period: Optional[str]
    count: int
    metrics: Optional[Metrics]
    trend: str