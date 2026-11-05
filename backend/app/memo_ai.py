import json

import httpx

from .config import OLLAMA_MODEL, OLLAMA_URL

# 제안서 5.2: 자유 메모에서 관심사, 추천받은 내용, 다음에 물어볼 내용, 기념일을 추출
CATEGORIES = ["interest", "recommendation", "question", "anniversary"]

SYSTEM_PROMPT = """너는 만남 메모에서 정보를 뽑아 사람별로 정리하는 도우미다.
메모에 적힌 내용만 쓰고, 없는 내용을 지어내지 마라. 뽑을 내용이 없으면 items를 빈 배열로 둔다.

category는 다음 넷 중 하나다.
- interest: 그 사람의 관심사, 취미, 요즘 빠진 것
- recommendation: 그 사람이 나에게 추천해 준 것 (맛집, 책, 영화 등)
- question: 다음에 만나면 물어볼 내용, 결과가 궁금한 일 (시험, 면접, 이사 등)
- anniversary: 생일, 결혼기념일 같은 기념일

person은 그 내용의 주인공 이름을 "함께한 사람" 목록에서 그대로 고른다.
"둘 다", "모두", "다들"처럼 여러 명에 해당하는 내용은 해당하는 사람 수만큼 항목을 각각 만든다.
content는 짧은 한 문장으로 쓴다.
date는 기념일에만 쓰고 메모에 적힌 표현 그대로 옮긴다. 연도가 메모에 없으면 연도를 붙이지 않는다. 그 외에는 빈 문자열로 둔다.

예시) 함께한 사람: 가영, 나준
메모: 둘 다 요즘 요가 한대. 가영 생일 3월 2일.
결과: 가영 interest "요가를 함", 나준 interest "요가를 함", 가영 anniversary "생일" date "3월 2일"
"""


class MemoAIError(Exception):
    pass


class OllamaUnavailable(MemoAIError):
    pass


def _schema(names: list[str]) -> dict:
    # 모델이 이 형식의 JSON만 내도록 강제한다
    return {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "person": {"type": "string", "enum": names},
                        "category": {"type": "string", "enum": CATEGORIES},
                        "content": {"type": "string"},
                        "date": {"type": "string"},
                    },
                    "required": ["person", "category", "content", "date"],
                },
            }
        },
        "required": ["items"],
    }


def _chat(memo: str, names: list[str]) -> str:
    body = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "think": False,
        "format": _schema(names),
        "options": {"temperature": 0},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"함께한 사람: {', '.join(names)}\n\n메모:\n{memo}"},
        ],
    }
    try:
        # 메모는 내 컴퓨터의 Ollama로만 보낸다 (외부 전송 없음)
        res = httpx.post(f"{OLLAMA_URL}/api/chat", json=body, timeout=180)
    except httpx.ConnectError as e:
        raise OllamaUnavailable(f"Ollama가 켜져 있지 않습니다 ({OLLAMA_URL})") from e
    except httpx.HTTPError as e:
        raise MemoAIError(f"Ollama 요청 실패: {e}") from e
    if res.status_code != 200:
        raise MemoAIError(f"Ollama 오류 ({res.status_code}): {res.text[:200]}")
    return res.json()["message"]["content"]


def classify_memo(memo: str, names: list[str]) -> list[dict]:
    """메모 → [{person, category, content, date}]"""
    try:
        items = json.loads(_chat(memo, names))["items"]
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        raise MemoAIError("AI 응답을 읽지 못했습니다") from e

    result, seen = [], set()
    for item in items:
        content = str(item.get("content", "")).strip()
        key = (item.get("person"), item.get("category"), content)
        if item.get("person") in names and item.get("category") in CATEGORIES and content and key not in seen:
            seen.add(key)
            result.append({
                "person": item["person"],
                "category": item["category"],
                "content": content,
                "date": str(item.get("date") or "").strip() or None,
            })
    return result
