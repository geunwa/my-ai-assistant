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


def build_system_prompt(summary: dict) -> str:
    """데이터 요약을 담은 시스템 프롬프트를 만든다."""
    if summary["count"] == 0:
        data_text = "현재 저장된 데이터가 없습니다."
    else:
        m = summary["metrics"]
        data_text = (
            f"- 기간: {summary['period']}\n"
            f"- 데이터 개수: {summary['count']}주\n"
            f"- 평균: {m['average']}\n"
            f"- 최대: {m['max']['value']} ({m['max']['date']})\n"
            f"- 최소: {m['min']['value']} ({m['min']['date']})\n"
            f"- 최근값: {m['latest']['value']} ({m['latest']['date']})\n"
            f"- 최근 추세: {summary['trend']}"
        )
    return (
        "너는 해외여행 검색 관심도 데이터를 설명하는 AI 비서다. "
        "관심도는 주간 0~100 지수이며 100이 기간 내 최고 관심도다. "
        "아래 요약 정보만 근거로 한국어로 짧고 쉽게 답한다. "
        "요약에 없는 값이나 원인은 지어내지 말고 모른다고 말한다.\n\n"
        f"[데이터 요약]\n{data_text}"
    )


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

    prompt = [{"role": "system", "content": build_system_prompt(data_service.get_summary())}]
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
