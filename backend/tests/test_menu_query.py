"""MenuQuery(메뉴 검색 조건)의 규칙 R3·R4·R6·R7 을 검증한다. DB 가 필요 없다."""

import dataclasses

import pytest

from catalog.domain.product import MenuQuery, SortKey
from core.exceptions import BusinessRuleViolation


def test_defaults_match_the_spec():
    query = MenuQuery.create()
    assert query.category is None
    assert query.q is None
    assert query.exclude_allergens == ()
    assert query.sort is SortKey.DEFAULT
    assert (query.page, query.size) == (1, 10)


def test_offset_is_the_number_of_rows_to_skip():
    assert MenuQuery.create().offset == 0
    assert MenuQuery.create(page=3, size=5).offset == 10


def test_q_is_trimmed_and_blank_becomes_none():
    assert MenuQuery.create(q="  치킨  ").q == "치킨"
    assert MenuQuery.create(q="   ").q is None
    assert MenuQuery.create(q="").q is None


def test_exclude_allergens_are_trimmed_deduplicated_and_keep_order():
    query = MenuQuery.create(exclude_allergens=[" 대두 ", "우유", "대두", "", "  "])
    assert query.exclude_allergens == ("대두", "우유")


def test_exclude_allergens_is_a_tuple():
    assert isinstance(MenuQuery.create(exclude_allergens=["대두"]).exclude_allergens, tuple)


def test_price_range_is_inclusive_when_min_equals_max():
    query = MenuQuery.create(min_price=9900, max_price=9900)
    assert (query.min_price, query.max_price) == (9900, 9900)


def test_min_price_greater_than_max_price_is_rejected():
    with pytest.raises(BusinessRuleViolation):
        MenuQuery.create(min_price=12000, max_price=9000)


@pytest.mark.parametrize("kwargs", [{"min_price": -1}, {"max_price": -1}])
def test_negative_price_is_rejected(kwargs):
    with pytest.raises(BusinessRuleViolation):
        MenuQuery.create(**kwargs)


@pytest.mark.parametrize("kwargs", [{"page": 0}, {"page": -1}, {"size": 0}, {"size": 51}])
def test_page_and_size_out_of_range_are_rejected(kwargs):
    with pytest.raises(BusinessRuleViolation):
        MenuQuery.create(**kwargs)


@pytest.mark.parametrize("size", [1, 50])
def test_size_boundaries_are_allowed(size):
    assert MenuQuery.create(size=size).size == size


def test_a_query_built_directly_is_also_checked():
    # create() 를 거치지 않고 직접 만들어도 규칙이 지켜져야 한다
    with pytest.raises(BusinessRuleViolation):
        MenuQuery(page=0)


def test_query_is_immutable():
    query = MenuQuery.create()
    with pytest.raises(dataclasses.FrozenInstanceError):
        query.page = 2  # type: ignore[misc]


def test_sort_keys_are_the_three_allowed_values():
    assert {key.value for key in SortKey} == {"default", "priceLow", "priceHigh"}
