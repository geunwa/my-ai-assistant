"""AI 비서의 답변을 만든다: 요약을 시스템 프롬프트에 넣고 OpenAI를 호출한다."""
import openai

from app.config import get_openai_api_key, get_openai_max_tokens, get_openai_model
from app.services import conversation_service, data_service

HISTORY_LIMIT = 10     # 모델에 보내는 이전 메시지 수(최근 N개)
TITLE_LENGTH = 30      # 자동 제목 길이
TIMEOUT_SECONDS = 30


class ChatError(Exception):
    """사용자에게 보여줄 메시지와 상태 코드를 가진 채팅 오류."""

    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message


SOURCE_TEXT = "Google Trends, 검색어 '해외여행', 대한민국, 웹 검색, 수집일 2026-11-09"


def build_system_prompt(summary: dict, first_reply: bool = True) -> str:
    """데이터 요약과 단위 설명을 담은 시스템 프롬프트를 만든다.

    first_reply가 True이면 지수가 검색 횟수가 아니라는 점을 이번 답변에서 짚게 하고,
    False이면 이미 설명했으므로 반복하지 않게 한다.
    """
    if summary["count"] == 0:
        data_text = "현재 저장된 데이터가 없습니다."
    else:
        m = summary["metrics"]
        data_lines = [
            f"- 기간: {summary['period']}",
            f"- 데이터 개수: {summary['count']}주",
            f"- 평균: 관심도 지수 {m['average']}",
            f"- 최대: 관심도 지수 {m['max']['value']} ({m['max']['date']} 주)",
            f"- 최소: 관심도 지수 {m['min']['value']} ({m['min']['date']} 주)",
            f"- 최근값: 관심도 지수 {m['latest']['value']} ({m['latest']['date']} 주)",
            f"- 최근 추세: {summary['trend']}",
        ]
        data_text = "\n".join(data_lines)
    if first_reply:
        scale_rule = (
            "이번이 대화의 첫 답변이므로, 관심도 지수는 검색 횟수가 아니라 "
            "기간 중 가장 검색이 많았던 주를 100으로 둔 상대 지수라는 점을 한 문장으로 짚는다."
        )
    else:
        scale_rule = "지수의 뜻은 이미 설명했으므로 다시 길게 설명하지 않는다."
    prompt_lines = [
        "너는 해외여행 검색 관심도 데이터를 쉽게 설명해 주는 AI 비서 '떠날까'다.",
        "친절하고 부드러운 해요체로, 보통 2~4문장으로 짧게 답한다.",
        "",
        "[데이터 설명]",
        f"- 출처: {SOURCE_TEXT}",
        "- 값은 주간 검색 관심도 지수(0~100)다. 기간 중 검색이 가장 많았던 주가 100이며, "
        "실제 검색 횟수나 출국자 수가 아니다.",
        "- 날짜는 그 주의 시작일(일요일)이다.",
        "",
        "[답변 규칙]",
        "- 숫자를 말할 때는 '관심도 지수 77(최고 100 기준)'처럼 단위와 뜻을 붙인다.",
        f"- {scale_rule}",
        "- 아래 요약에 없는 값, 원인, 실제 출국자 수는 지어내지 말고 모른다고 말한다.",
        "",
        "[데이터 요약]",
        data_text,
    ]
    return "\n".join(prompt_lines)


def _require_api_key() -> str:
    """키가 없으면 서버를 죽이지 않고 알기 쉬운 오류를 낸다."""
    api_key = get_openai_api_key()
    if not api_key:
        raise ChatError(503, "OPENAI_API_KEY가 설정되지 않아 채팅을 사용할 수 없습니다. backend/.env에 키를 넣어 주세요.")
    return api_key


def _call_openai(api_key: str, messages: list[dict]) -> str:
    """OpenAI를 호출하고 실패는 ChatError로 바꾼다."""
    try:
        client = openai.OpenAI(api_key=api_key, timeout=TIMEOUT_SECONDS, max_retries=1)
        res = client.chat.completions.create(
            model=get_openai_model(),
            messages=messages,
            max_completion_tokens=get_openai_max_tokens(),
        )
    except openai.AuthenticationError:
        raise ChatError(502, "OpenAI API 키가 올바르지 않습니다. 키를 확인해 주세요.")
    except openai.RateLimitError:
        raise ChatError(429, "OpenAI 사용 한도를 넘었거나 요청이 너무 많습니다. 잠시 후 다시 시도하거나 결제·한도를 확인해 주세요.")
    except openai.NotFoundError:
        raise ChatError(502, "설정한 OpenAI 모델을 찾을 수 없습니다. OPENAI_MODEL 값을 확인해 주세요.")
    except (openai.APIConnectionError, openai.APITimeoutError):
        raise ChatError(504, "OpenAI에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.")
    except openai.OpenAIError:
        raise ChatError(502, "OpenAI 호출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
    except ImportError:
        # 서버 환경에서 OpenAI 라이브러리의 일부를 불러오지 못한 경우
        raise ChatError(503, "서버에서 OpenAI 라이브러리를 불러오지 못했습니다. 서버 환경(패키지 설치·보안 정책)을 확인해 주세요.")
    answer = (res.choices[0].message.content or "").strip()
    if not answer:
        raise ChatError(502, "OpenAI가 빈 답변을 돌려줬습니다. 다시 질문해 주세요.")
    return answer


def chat(message: str, conversation_id: str | None) -> dict:
    """질문에 답하고 대화를 저장한다. 저장은 답변을 받은 뒤에만 한다."""
    # 키가 없거나 대화 ID가 틀렸을 때 데이터 조회·호출 전에 먼저 알려 준다
    api_key = _require_api_key()
    history = []
    if conversation_id:
        conv = conversation_service.get_conversation(conversation_id)
        if conv is None:
            raise ChatError(404, "해당 ID의 대화가 없습니다")
        history = conv["messages"][-HISTORY_LIMIT:]

    summary = data_service.get_summary()
    prompt = [{"role": "system", "content": build_system_prompt(summary, first_reply=not history)}]
    prompt += history + [{"role": "user", "content": message}]
    answer = _call_openai(api_key, prompt)

    new_messages = [
        {"role": "user", "content": message},
        {"role": "assistant", "content": answer},
    ]
    if conversation_id:
        conversation_service.append_messages(conversation_id, new_messages)
    else:
        title = message.strip()[:TITLE_LENGTH]
        conversation_id = conversation_service.create_conversation(title, new_messages)["id"]
    return {"conversation_id": conversation_id, "answer": answer}
