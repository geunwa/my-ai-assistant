"""Firestore 연결을 만들고 공유한다."""
import json

import firebase_admin
from firebase_admin import credentials, firestore

from app.config import get_firebase_json, get_firebase_path


def _build_credential():
    """환경 변수에서 서비스 계정 키를 읽어 인증 정보를 만든다."""
    raw_json = get_firebase_json()
    if raw_json:
        return credentials.Certificate(json.loads(raw_json))

    path = get_firebase_path()
    if path:
        return credentials.Certificate(path)

    raise RuntimeError(
        "Firebase 서비스 계정 키가 없습니다. "
        "FIREBASE_SERVICE_ACCOUNT_JSON 또는 FIREBASE_SERVICE_ACCOUNT_PATH를 설정하세요."
    )


def get_db():
    """Firestore 클라이언트를 돌려준다. Firebase 앱은 처음 한 번만 초기화한다."""
    try:
        firebase_admin.get_app()
    except ValueError:
        firebase_admin.initialize_app(_build_credential())
    return firestore.client()