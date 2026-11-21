# 요구사항 대조표

> 실제 배포 서버의 요청·응답 전문은 [evidence.md](evidence.md)에 텍스트로 정리했다(이미지 없이 확인 가능).

미션 PDF "AI Agent 개발: 나만의 AI 비서 구축"의 요구사항을 구현 위치와 증빙 파일로 대조한다. (STEP 14, 2026-11-21)

## 최종 결과물 4가지

| 기능 | 화면 / API | 증빙 |
|---|---|---|
| 데이터 기반 AI 채팅 (요약 반영 답변 + 로딩) | 채팅 탭, `POST /api/chat` | step10-2_chat-summary, step10-2_chat-loading, step11_vercel-chat |
| 데이터 관리 CRUD | 데이터 관리 탭, `/api/data` | step05_swagger-data-api, step10-2_data |
| 대화 기록 저장·목록·불러오기 | 대화 기록 탭, `/api/conversations` | step07_conversations, step10-2_history |
| 배포와 문서화 | Vercel, Render, Swagger, README | step09_render-live, step09_render-swagger, step11_vercel-chat, README.md |

## 기능 요구사항

| 번호 | 요구사항 | 구현 위치 | 증빙 | 결과 |
|---|---|---|---|---|
| 4-1 | Python 3.10 이상, venv, 패키지 5종(fastapi, uvicorn, firebase-admin, openai, python-dotenv) | `backend/.python-version`(3.13), `backend/requirements.txt` | step01_github-repo | 충족 |
| 4-2 | 시계열 데이터 100개 이상, 요약(기간·개수·통계·추세) | `backend/data/seed.csv`(261주), `backend/app/services/summary.py` | step02_summary-preview, step06_summary | 충족 |
| 4-3 | FastAPI 초기화, CORS, 로컬 실행, Swagger `/docs` | `backend/main.py`, `backend/app/config.py` | step03_swagger-docs | 충족 |
| 4-4 | Firestore, 서비스 계정 키를 환경 변수로 관리, `data`·`conversations` 컬렉션 | `backend/app/db.py`, `backend/app/config.py` | step04_firestore-created | 충족 |
| 4-5 | 데이터 API 5개 (CRUD 4 + summary) | `backend/app/routers/data.py`, `services/data_service.py` | step05_swagger-data-api, step06_summary | 충족 |
| 4-6 | 대화 API (저장·목록·삭제), 불러오기 (A) `GET /api/conversations/{id}` | `backend/app/routers/conversations.py` | step07_conversations | 충족 |
| 4-7 | `POST /api/chat`: 요약 조회 → 시스템 프롬프트 삽입 → GPT 호출 → conversations 자동 저장 | `backend/app/services/chat_service.py` | step08_chat | 충족 (참고 1) |
| 4-8 | Render 배포, 배포 URL `/docs`, 콜드스타트 안내 | Render Web Service, `frontend/app.js` 서버 깨우기·다시 시도 | step09_render-live, step09_render-swagger | 충족 |
| 4-9 | 바닐라 HTML/CSS/JS: 채팅(입력·표시·로딩), 데이터 관리, 대화 기록, 요약 표시 | `frontend/` | step10-2 4장 | 충족 |
| 4-10 | Vercel 배포, 환경 변수로 API 서버 URL 설정 | `frontend/vercel.json`, `frontend/build.sh`, Vercel 환경 변수 `API_BASE_URL` | step11_vercel-chat, step14_vercel-env, step14_vercel-build-log | 충족 (STEP 14에서 보완, 참고 2) |
| 4-10 | README: 소개, 기술 스택, 배포 URL 3개, 로컬 실행, 환경 변수, 스크린샷 3장 | `README.md` | GitHub 저장소 첫 화면 | 충족 |

## 제약 사항

| 항목 | 구현 | 결과 |
|---|---|---|
| 백엔드 Render, 프론트엔드 Vercel | my-ai-assistant-pjlv.onrender.com, tteonalkka.vercel.app | 충족 |
| 키를 환경 변수로 관리, 코드에 노출하지 않음 | `.env`와 키 파일은 `.gitignore`로 제외, Render 환경 변수 | 충족 |
| 입력 검증과 최소한의 예외 처리 | Pydantic 스키마(`schemas.py`), 404·503·502 등 오류 응답(`chat_service.ChatError`) | 충족 |
| 토큰 제한 | `OPENAI_MAX_TOKENS` (기본 400, 배포 2000), 대화 이력은 최근 10개만 전송 | 충족 |

## 보너스 (선택)

| 보너스 | 세부 항목 | 결과 |
|---|---|---|
| Function Calling + MCP/GPT Actions | 전체 | 하지 않음 |
| 인사이트·UX 고도화 | 요약/통계 지표 1개 이상 추가 (API) | 하지 않음. "최근값이 평균의 약 몇 배"는 화면에서만 계산 |
| | 그래프 1개 | 충족 (채팅 탭 요약 카드) |
| | CSV 또는 JSON 내려받기 | 충족 (데이터 관리 탭, step13_export) |
| | 다크 모드 | 하지 않음 |

## 참고

1. 채팅 API는 `/api/data/summary` 주소를 HTTP로 다시 호출하지 않고, 그 API가 쓰는 함수 `data_service.get_summary()`를 직접 불러 같은 요약을 쓴다. 결과는 같고, 같은 서버 안에서 불필요한 네트워크 요청을 줄인다.
2. 처음에는 API 주소를 `frontend/config.js`에 직접 적었다. STEP 14 대조 중에 "환경 변수로 API 서버 URL을 설정한다" 요구를 충족하지 못한 것을 발견했다. Vercel은 정적 파일을 그대로 내보내므로 브라우저가 환경 변수를 직접 읽을 수 없다. 배포 때 `build.sh`가 Vercel 환경 변수 `API_BASE_URL`로 `config.js`를 만들도록 바꿨다. 내 PC에서는 빌드 없이 기존 `config.js`를 쓴다.
