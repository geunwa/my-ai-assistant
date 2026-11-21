# 배포 실행 증빙 (텍스트)

배포된 서버에 실제로 요청을 보내 받은 응답을 그대로 옮긴 기록입니다. 스크린샷(evidence/*.png)과 같은 내용을 텍스트로 남겨, 이미지 없이도 확인할 수 있게 했습니다.

- 확인 일시: 2026-11-21 15:28~15:31 (한국 시간, UTC 06:28~06:31)
- 확인 방법: 브라우저로 각 주소를 열고 응답 본문을 복사
- 프론트엔드: https://tteonalkka.vercel.app
- 백엔드 API: https://my-ai-assistant-pjlv.onrender.com
- API 문서: https://my-ai-assistant-pjlv.onrender.com/docs

## 목차

1. [백엔드 접속: GET /api/health](#1-백엔드-접속-get-apihealth)
2. [API 문서: /docs와 /openapi.json](#2-api-문서-docs와-openapijson)
3. [프론트엔드 접속과 API 주소 설정](#3-프론트엔드-접속과-api-주소-설정)
4. [데이터 요약: GET /api/data/summary](#4-데이터-요약-get-apidatasummary)
5. [컨텍스트 주입: 요약이 GPT 답변에 반영된 증거](#5-컨텍스트-주입-요약이-gpt-답변에-반영된-증거)
6. [대화 저장과 불러오기: /api/conversations](#6-대화-저장과-불러오기-apiconversations)

---

## 1. 백엔드 접속: GET /api/health

요청

```
GET https://my-ai-assistant-pjlv.onrender.com/api/health
```

응답 (200)

```json
{"status":"ok"}
```

참고: 서버가 쉬고 있어서 첫 요청 때 Render의 "Application loading" 화면이 약 40초 동안 나온 뒤 위 응답이 왔습니다(06:28:37 요청 감지 → 06:29:03 시작 완료). README와 화면에 안내한 콜드 스타트 동작과 같습니다.

## 2. API 문서: /docs와 /openapi.json

요청

```
GET https://my-ai-assistant-pjlv.onrender.com/docs
GET https://my-ai-assistant-pjlv.onrender.com/openapi.json
```

결과

- `/docs` 페이지 제목: **나만의 AI 비서 API - Swagger UI**
- `/openapi.json` 정보: `"openapi": "3.1.0"`, `"title": "나만의 AI 비서 API"`, `"version": "0.1.0"`
- `/openapi.json`에 등록된 경로 11개

| 태그 | 메서드 | 경로 | 설명(openapi.json의 description) |
|---|---|---|---|
| 상태 | GET | `/api/health` | 서버가 켜져 있는지 확인한다. 배포 후 첫 요청 지연(콜드스타트) 대응에도 쓴다. |
| 데이터 | GET | `/api/data/summary` | 기간, 개수, 평균·최대·최소·최근값, 최근 추세를 돌려준다. |
| 데이터 | GET | `/api/data` | 전체 데이터를 날짜 오름차순으로 돌려준다. |
| 데이터 | POST | `/api/data` | 데이터를 한 건 추가한다. (201, 검증 실패 422) |
| 데이터 | PUT | `/api/data/{item_id}` | 데이터를 수정한다. 보낸 항목만 바뀐다. |
| 데이터 | DELETE | `/api/data/{item_id}` | 데이터를 삭제한다. |
| 대화 | GET | `/api/conversations` | 대화 목록(id, 제목, 시각)을 최근 수정 순으로 돌려준다. |
| 대화 | POST | `/api/conversations` | 대화를 새로 저장한다. (201) |
| 대화 | GET | `/api/conversations/{conv_id}` | 대화 한 건을 메시지 전체와 함께 돌려준다. |
| 대화 | DELETE | `/api/conversations/{conv_id}` | 대화를 삭제한다. |
| 채팅 | POST | `/api/chat` | 질문에 답한다. conversation_id가 없으면 새 대화를 만들고, 있으면 이어서 저장한다. |

`/openapi.json`에 들어 있는 입력 검증 규칙 (Pydantic 스키마가 그대로 문서로 나온 것)

| 스키마 | 필드 | 규칙 |
|---|---|---|
| DataCreate | date | 필수, 주 시작일 (YYYY-MM-DD) |
| DataCreate | value | 필수, `minimum: 0.0`, `maximum: 100.0` (검색 관심도 지수 0~100점) |
| DataCreate | memo | 선택, `maxLength: 200` |
| ChatRequest | message | 필수, `minLength: 1`, `maxLength: 1000` |
| Message | role | `user` 또는 `assistant` |
| Message | content | `minLength: 1`, `maxLength: 4000` |
| ConversationCreate | title / messages | 제목 1~100자, 메시지 최대 200개 |

## 3. 프론트엔드 접속과 API 주소 설정

요청

```
GET https://tteonalkka.vercel.app/
GET https://tteonalkka.vercel.app/config.js
```

결과

- 페이지 제목: **떠날까 · 해외여행 검색 관심도 AI 비서**
- 화면 구성: 탭 "채팅", "데이터 관리", "대화 기록" / 상태 표시 "서버 확인 중" → "서버 연결됨"
- 요약 영역 문구: "단위: 점 (주간 검색 관심도 지수) · 기간 중 검색이 가장 많았던 주 = 100점 · 검색 횟수나 %가 아니에요"
- `config.js` 응답 본문 (Vercel 환경 변수 `API_BASE_URL`로 배포 때 만들어진 파일)

```js
// 배포 때 build.sh가 Vercel 환경 변수 API_BASE_URL로 만든 파일
window.APP_CONFIG = {
  API_BASE_URL: "https://my-ai-assistant-pjlv.onrender.com",
};
```

Vercel 빌드 로그에도 `config.js: Vercel 환경 변수 API_BASE_URL 사용` 줄이 찍혔습니다(이미지 증빙: evidence/step14_vercel-build-log.png).

## 4. 데이터 요약: GET /api/data/summary

요청

```
GET https://my-ai-assistant-pjlv.onrender.com/api/data/summary
```

응답 (200)

```json
{
  "period": "2021-11-07 ~ 2026-11-01",
  "count": 261,
  "metrics": {
    "average": 39.7,
    "max": { "value": 100.0, "date": "2026-10-18" },
    "min": { "value": 11.0, "date": "2021-12-19" },
    "latest": { "value": 77.0, "date": "2026-11-01" }
  },
  "trend": "상승 (최근 8주 평균 60.0, 직전 8주 평균 35.2, 변화율 +70.2%)"
}
```

- 데이터 261개 (요구사항: 100개 이상)
- 기간, 개수, 평균·최대·최소·최근값, 최근 추세를 모두 포함

## 5. 컨텍스트 주입: 요약이 GPT 답변에 반영된 증거

### 5-1. 실제 코드 (backend/app/services/chat_service.py)

`POST /api/chat`이 호출하는 `chat()` 함수입니다. 요약을 가져와 시스템 프롬프트로 만들고, GPT를 호출한 뒤 대화를 저장합니다.

```python
def chat(message: str, conversation_id: str | None) -> dict:
    """질문에 답하고 대화를 저장한다. 저장은 답변을 받은 뒤에만 한다."""
    api_key = _require_api_key()
    history = []
    if conversation_id:
        conv = conversation_service.get_conversation(conversation_id)
        if conv is None:
            raise ChatError(404, "해당 ID의 대화가 없습니다")
        history = conv["messages"][-HISTORY_LIMIT:]          # 최근 10개만

    summary = data_service.get_summary()                       # 1) 요약 조회 (/api/data/summary와 같은 함수)
    prompt = [{"role": "system",
               "content": build_system_prompt(summary, first_reply=not history)}]  # 2) 시스템 프롬프트에 삽입
    prompt += history + [{"role": "user", "content": message}]
    answer = _call_openai(api_key, prompt)                     # 3) GPT 호출

    new_messages = [
        {"role": "user", "content": message},
        {"role": "assistant", "content": answer},
    ]
    if conversation_id:                                        # 4) conversations에 자동 저장
        conversation_service.append_messages(conversation_id, new_messages)
    else:
        title = message.strip()[:TITLE_LENGTH]
        conversation_id = conversation_service.create_conversation(title, new_messages)["id"]
    return {"conversation_id": conversation_id, "answer": answer}
```

`build_system_prompt()`가 만드는 시스템 프롬프트의 데이터 부분 (같은 파일)

```python
data_lines = [
    f"- 기간: {summary['period']}",
    f"- 데이터 개수: {summary['count']}주",
    f"- 평균: 관심도 지수 {m['average']}점",
    f"- 최대: 관심도 지수 {m['max']['value']}점 ({m['max']['date']} 주)",
    f"- 최소: 관심도 지수 {m['min']['value']}점 ({m['min']['date']} 주)",
    f"- 최근값: 관심도 지수 {m['latest']['value']}점 ({m['latest']['date']} 주)",
    f"- 최근 추세: {summary['trend']} (괄호 안 평균은 점, 변화율은 %)",
]
```

### 5-2. 실행 결과: 답변 속 숫자가 요약 값과 같음

아래 6-2의 대화(`dtnXyvedLb6zkrLoOqyA`)에서 GPT가 답한 숫자를 4번의 요약 응답과 비교했습니다.

| 답변에 나온 값 | 요약 응답의 값 | 일치 |
|---|---|---|
| 최근 주 2026-11-01, 77점 | `latest: {value: 77.0, date: "2026-11-01"}` | 일치 |
| 최근 8주 평균 60.0점 | `trend: "... 최근 8주 평균 60.0 ..."` | 일치 |
| 그전 8주 평균 35.2점 | `trend: "... 직전 8주 평균 35.2 ..."` | 일치 |
| 70.2% 상승 | `trend: "상승 ... 변화율 +70.2%"` | 일치 |

GPT는 이 데이터를 학습한 적이 없으므로, 답변의 숫자는 시스템 프롬프트에 넣은 요약에서 온 것입니다.

요약에 없는 값을 물으면 지어내지 않습니다. 같은 서버의 대화 "3월 해외여행 관심도 어때?"(`DgmAHA0x6ckIyz7Mndvj`)에서 GPT는 "지금 가진 요약에는 3월만 따로 떼어 본 값은 없어서 정확한 3월 관심도 지수는 모른다"고 답했습니다(이미지 증빙: docs/presentation.html 9장).

## 6. 대화 저장과 불러오기: /api/conversations

### 6-1. 대화 목록: GET /api/conversations

요청

```
GET https://my-ai-assistant-pjlv.onrender.com/api/conversations
```

응답 (200, 7건 중 최근 3건)

```json
[
  {
    "id": "dtnXyvedLb6zkrLoOqyA",
    "title": "요즘 해외여행 관심도 어때?",
    "created_at": "2026-11-21T06:00:39+00:00",
    "updated_at": "2026-11-21T06:00:39+00:00"
  },
  {
    "id": "DgmAHA0x6ckIyz7Mndvj",
    "title": "3월 해외여행 관심도 어때?",
    "created_at": "2026-11-21T05:51:16+00:00",
    "updated_at": "2026-11-21T05:51:16+00:00"
  },
  {
    "id": "14LvyDyfdAeFzkf1Q3kE",
    "title": "9월 해외여행 관심도 어때?",
    "created_at": "2026-11-21T00:56:43+00:00",
    "updated_at": "2026-11-21T00:56:43+00:00"
  }
]
```

- 목록에는 메시지 본문이 없고 id, 제목, 시각만 있습니다.
- 제목이 모두 질문 문장인 이유: `/api/chat`이 새 대화를 자동 저장할 때 첫 질문의 앞 30자를 제목으로 쓰기 때문입니다.
- 2026-11-17, 2026-11-19에 만든 대화도 남아 있어, 서버를 다시 시작해도 Firestore에 저장된 대화가 유지됨을 보여 줍니다.

### 6-2. 대화 불러오기: GET /api/conversations/{id} (방식 A)

요청

```
GET https://my-ai-assistant-pjlv.onrender.com/api/conversations/dtnXyvedLb6zkrLoOqyA
```

응답 (200)

```json
{
  "id": "dtnXyvedLb6zkrLoOqyA",
  "title": "요즘 해외여행 관심도 어때?",
  "created_at": "2026-11-21T06:00:39+00:00",
  "updated_at": "2026-11-21T06:00:39+00:00",
  "messages": [
    {
      "role": "user",
      "content": "요즘 해외여행 관심도 어때?"
    },
    {
      "role": "assistant",
      "content": "해외여행 관심도는 실제 검색 횟수나 비율이 아니라, 기간 중 검색이 가장 많았던 주를 100점으로 둔 **상대 지수**예요. \n최근 주인 2026-11-01 기준으로는 관심도 지수 **77점(100점 만점)**이고, 최근 8주 평균도 **60.0점**으로 그전 8주 평균 **35.2점**보다 **70.2% 상승**해서, 요즘은 뚜렷하게 올라가는 흐름으로 보여요."
    }
  ]
}
```

### 6-3. 없는 ID 처리

요청

```
GET https://my-ai-assistant-pjlv.onrender.com/api/conversations/5srdnCB5eSaAoyLaCvwX
```

응답 (404)

```json
{"detail":"해당 ID의 대화가 없습니다"}
```

### 6-4. 저장 코드 (backend/app/services/conversation_service.py)

```python
def create_conversation(title: str, messages: list[dict]) -> dict:
    """새 대화를 만든다. 문서 ID는 Firestore가 자동으로 정한다."""
    now = _now()
    payload = {"title": title, "messages": messages, "created_at": now, "updated_at": now}
    ref = _col().document()
    ref.set(payload)
    return {"id": ref.id, **payload}


def append_messages(conv_id: str, new_messages: list[dict]) -> None:
    """기존 대화 끝에 메시지를 붙이고 updated_at을 갱신한다."""
    ref = _col().document(conv_id)
    doc = ref.get().to_dict()
    ref.update({"messages": doc["messages"] + new_messages, "updated_at": _now()})
```

`POST /api/conversations` 라우터(backend/app/routers/conversations.py)도 같은 `create_conversation()`을 호출하며, 성공하면 201과 함께 위 `payload`에 `id`를 더한 Conversation 객체를 돌려줍니다.
