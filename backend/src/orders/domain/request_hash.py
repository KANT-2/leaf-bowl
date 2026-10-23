"""재전송 식별키(Idempotency-Key)로 온 요청이 이전과 같은 내용인지 비교하는 해시. 순수 파이썬이다.

Next.js modules/orders/request-hash.ts 와 같은 입력이면 같은 값을 낸다 (tests/test_request_hash.py 고정 벡터).
입력은 검증을 마치고 기본값이 채워진 주문 요청을 API 의 JSON 키(camelCase) 그대로 담은 dict 다.

- 객체 키는 정렬하고 값이 None 인 키는 뺀다 (TS 의 undefined 와 같게).
- 품목의 drinkKeys·ingredientKeys·optionSelections 의 선택 키는 고른 순서가 달라도 같게 본다.
  가격 계산은 선택마다 더하기만 하므로 순서가 결과를 바꾸지 않는다.
- 품목(items) 순서와 dressingKeys 순서는 그대로 둔다. 주문 내역에 그대로 남는 내용이다.
"""

import hashlib
import json
from collections.abc import Mapping
from typing import Any


def request_hash(order_input: Mapping[str, Any]) -> str:
    normalized = {**order_input, "items": [_normalize_item(item) for item in order_input.get("items", ())]}
    return hashlib.sha256(_canonical(normalized).encode("utf-8")).hexdigest()


def _normalize_item(item: Mapping[str, Any]) -> dict[str, Any]:
    normalized = {
        **item,
        "drinkKeys": sorted(item.get("drinkKeys", ())),
        "ingredientKeys": sorted(item.get("ingredientKeys", ())),
    }
    if item.get("optionSelections") is not None:
        normalized["optionSelections"] = {group: sorted(keys) for group, keys in item["optionSelections"].items()}
    return normalized


def _canonical(value: Any) -> str:
    """키를 정렬한 JSON. 문자열·숫자 표기는 JavaScript 의 JSON.stringify 와 같다."""
    if isinstance(value, Mapping):
        entries = sorted(((k, v) for k, v in value.items() if v is not None), key=lambda kv: kv[0])
        return "{" + ",".join(f"{_scalar(k)}:{_canonical(v)}" for k, v in entries) + "}"
    if isinstance(value, list | tuple):
        return "[" + ",".join(_canonical(v) for v in value) + "]"
    return _scalar(value)


def _scalar(value: Any) -> str:
    if isinstance(value, float):
        # JSON.stringify 와 표기가 갈리는 실수는 주문 요청에 없다 (금액·수량은 정수)
        raise TypeError("요청 해시에는 정수만 쓸 수 있습니다.")
    return json.dumps(value, ensure_ascii=False)
