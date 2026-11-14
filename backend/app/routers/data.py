"""시계열 데이터 CRUD와 요약 API."""
from fastapi import APIRouter, HTTPException

from app.schemas import DataCreate, DataItem, DataUpdate, SummaryResponse
from app.services import data_service

router = APIRouter(prefix="/api/data", tags=["데이터"])

NOT_FOUND = "해당 ID의 데이터가 없습니다"


@router.get("/summary", response_model=SummaryResponse)
def read_summary():
    """기간, 개수, 평균·최대·최소·최근값, 최근 추세를 돌려준다."""
    return data_service.get_summary()


@router.get("", response_model=list[DataItem])
def read_data():
    """전체 데이터를 날짜 오름차순으로 돌려준다."""
    return data_service.list_items()


@router.post("", response_model=DataItem, status_code=201)
def create_data(body: DataCreate):
    """데이터를 한 건 추가한다."""
    return data_service.create_item(body.model_dump())


@router.put("/{item_id}", response_model=DataItem)
def update_data(item_id: str, body: DataUpdate):
    """데이터를 수정한다. 보낸 항목만 바뀐다."""
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="수정할 항목이 없습니다")
    item = data_service.update_item(item_id, changes)
    if item is None:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return item


@router.delete("/{item_id}")
def delete_data(item_id: str):
    """데이터를 삭제한다."""
    if not data_service.delete_item(item_id):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return {"deleted": item_id}