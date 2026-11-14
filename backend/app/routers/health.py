"""서버 상태 확인용 라우터."""
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["상태"])


@router.get("/health")
def health_check():
    """서버가 켜져 있는지 확인한다. 배포 후 첫 요청 지연(콜드스타트) 대응에도 쓴다."""
    return {"status": "ok"}