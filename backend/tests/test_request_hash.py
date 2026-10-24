"""멱등키 요청 해시. 고정 벡터는 Next.js 의 requestHash(createOrderSchema.parse(입력)) 로 만든 값이다."""

import copy

import pytest

from orders.domain.request_hash import request_hash

# 기존 화면 입력(날짜 + 시간대 표시)을 검증한 결과. 음료 키는 고른 순서 그대로다
LEGACY_SLOT = {
    "items": [
        {
            "productId": 0,
            "dressingKeys": ["dressing-1"],
            "drinkKeys": ["drink-2", "drink-1"],
            "ingredientKeys": [],
            "quantity": 2,
        }
    ],
    "ordererName": "홍길동",
    "phone": "010-1234-5678",
    "address": "서울 중구 세종대로 110",
    "addressDetail": "",
    "desiredDate": "2026-10-13",
    "desiredSlot": "12:00–13:00",
    "desiredStartAt": "2026-10-13T03:00:00.000Z",
    "desiredEndAt": "2026-10-13T04:00:00.000Z",
}
LEGACY_SLOT_HASH = "0176da83cfc7c19d6e20958adcd47ca5894cd010addf5b89c6fcbcf336b66edc"

# UTC 입력, 세 종류의 품목, JSON 이스케이프가 필요한 문자(따옴표·탭·줄바꿈·역슬래시·이모지)
MIXED = {
    "items": [
        {
            "dressingKeys": ["dressing-3", "dressing-0"],
            "drinkKeys": [],
            "ingredientKeys": ["tomato", "avocado", "egg"],
            "quantity": 1,
        },
        {
            "productId": 3,
            "dressingKeys": [],
            "optionSelections": {"extra": ["nuts", "corn"], "dressing": ["dressing-2"]},
            "drinkKeys": [],
            "ingredientKeys": [],
            "quantity": 3,
        },
        {"dressingKeys": [], "drinkKeys": ["drink-0"], "ingredientKeys": [], "quantity": 99},
    ],
    "ordererName": '김 "종복"',
    "phone": "01098765432",
    "address": "부산 해운대구\t우동 1",
    "addressDetail": "101동\n1203호 \\ \U0001f957",
    "desiredStartAt": "2026-10-14T01:00:00.000Z",
    "desiredEndAt": "2026-10-14T02:00:00.000Z",
    "desiredDate": "2026-10-14",
    "desiredSlot": "10:00–11:00",
}
MIXED_HASH = "9efc105e282c4ec3b9b283feab8ec2b1ca9d7cba302a1c95b45dfb3a11679c7f"


@pytest.mark.parametrize(("order_input", "expected"), [(LEGACY_SLOT, LEGACY_SLOT_HASH), (MIXED, MIXED_HASH)])
def test_matches_nextjs_request_hash(order_input, expected):
    assert request_hash(order_input) == expected


def changed(base: dict, edit) -> dict:
    value = copy.deepcopy(base)
    edit(value)
    return value


def test_selection_order_does_not_matter():
    def reorder(v):
        v["items"][0]["ingredientKeys"].reverse()
        v["items"][1]["optionSelections"]["extra"].reverse()
        v["items"][1]["optionSelections"] = dict(reversed(v["items"][1]["optionSelections"].items()))

    assert request_hash(changed(MIXED, reorder)) == MIXED_HASH
    assert request_hash(changed(LEGACY_SLOT, lambda v: v["items"][0]["drinkKeys"].reverse())) == LEGACY_SLOT_HASH


def test_key_order_and_missing_optional_values_do_not_matter():
    assert request_hash(dict(reversed(MIXED.items()))) == MIXED_HASH
    assert request_hash(MIXED | {"memo": None}) == MIXED_HASH


@pytest.mark.parametrize(
    "edit",
    [
        lambda v: v["items"].reverse(),  # 품목 순서는 주문 내역에 남는다
        lambda v: v["items"][0]["dressingKeys"].reverse(),  # 드레싱 순서는 정렬하지 않는다 (TS 와 같게)
        lambda v: v["items"][2].update(quantity=98),
        lambda v: v.update(addressDetail="101동 1203호"),
    ],
)
def test_different_content_gives_a_different_hash(edit):
    assert request_hash(changed(MIXED, edit)) != MIXED_HASH


def test_hash_is_hex_sha256():
    assert len(request_hash(MIXED)) == 64
    int(request_hash(MIXED), 16)


def test_floats_are_rejected():
    with pytest.raises(TypeError):
        request_hash({"items": [], "total": 1.5})
