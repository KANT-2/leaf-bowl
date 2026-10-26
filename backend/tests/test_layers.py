"""4계층 의존 규칙을 import 로 검사한다: 표현 → 응용 → 도메인 ← 인프라.

- 표현(presentation): 응용·도메인만. DB(sqlalchemy·database)와 인프라 구현을 모른다.
- 응용(application): 도메인만. 웹(fastapi)·DB 를 모르고 Repository Protocol 에만 의존한다.
- 도메인(domain): 다른 계층과 프레임워크를 모르는 순수 파이썬. core 에서는 도메인 예외만 쓴다.
- 인프라(infrastructure): 도메인만. 표현·응용을 역참조하지 않는다.
- 어떤 구현을 넣을지 정하는 조립(<기능>/container.py, main.py)은 계층 밖이라 검사하지 않는다.

다른 기능도 같은 규칙을 지키게 되면 CHECKED 에 추가한다.
"""

import ast
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parents[1] / "src"
CHECKED = ("orders",)
LAYERS = ("presentation", "application", "domain", "infrastructure")

ALLOWED_LAYERS = {
    "presentation": {"presentation", "application", "domain"},
    "application": {"application", "domain"},
    "domain": {"domain"},
    "infrastructure": {"infrastructure", "domain"},
}
FORBIDDEN_PACKAGES = {
    "presentation": {"sqlalchemy", "asyncpg", "database"},
    "application": {"fastapi", "starlette", "pydantic", "sqlalchemy", "asyncpg", "database"},
    "domain": {"fastapi", "starlette", "pydantic", "sqlalchemy", "asyncpg", "database", "jwt", "pwdlib"},
    "infrastructure": {"fastapi", "starlette"},
}
DOMAIN_CORE_ALLOWED = {"core.exceptions"}


def imported_modules(source: str) -> list[tuple[int, str]]:
    found = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            found += [(node.lineno, alias.name) for alias in node.names]
        elif isinstance(node, ast.ImportFrom):
            found.append((node.lineno, "." * node.level + (node.module or "")))
    return found


def violations(layer: str, source: str) -> list[str]:
    """이 계층의 파일이 어기는 import 를 '줄: 모듈 (이유)' 로 돌려준다."""
    problems = []
    for line, module in imported_modules(source):
        parts = module.split(".")
        if module.startswith("."):
            problems.append(f"{line}: {module} (상대 import 는 계층을 알아보기 어렵다)")
        elif parts[0] in FORBIDDEN_PACKAGES[layer]:
            problems.append(f"{line}: {module} ({layer} 는 {parts[0]} 를 쓰지 않는다)")
        elif len(parts) > 1 and parts[1] in LAYERS and parts[1] not in ALLOWED_LAYERS[layer]:
            problems.append(f"{line}: {module} ({layer} → {parts[1]} 방향은 허용하지 않는다)")
        elif layer == "domain" and parts[0] == "core" and module not in DOMAIN_CORE_ALLOWED:
            problems.append(f"{line}: {module} (도메인은 core 에서 예외만 쓴다)")
    return problems


def layer_files(feature: str) -> list[tuple[str, Path]]:
    return [(layer, path) for layer in LAYERS for path in sorted((SRC / feature / layer).glob("*.py"))]


@pytest.mark.parametrize("feature", CHECKED)
def test_every_layer_is_a_package(feature):
    for layer in LAYERS:
        assert (SRC / feature / layer / "__init__.py").is_file(), f"{feature}/{layer}/__init__.py 가 없다"


@pytest.mark.parametrize("feature", CHECKED)
def test_layers_only_depend_inward(feature):
    found = {
        f"{path.relative_to(SRC).as_posix()}:{problem}"
        for layer, path in layer_files(feature)
        for problem in violations(layer, path.read_text(encoding="utf-8"))
    }
    assert not found, "계층 규칙 위반:\n" + "\n".join(sorted(found))


@pytest.mark.parametrize(
    ("layer", "source"),
    [
        ("presentation", "from orders.infrastructure.repositories import SqlOrderRepository"),
        ("presentation", "from sqlalchemy.ext.asyncio import AsyncSession"),
        ("application", "from orders.presentation.schemas import CreateOrderRequest"),
        ("application", "from fastapi import HTTPException"),
        ("domain", "import sqlalchemy"),
        ("domain", "from pydantic import BaseModel"),
        ("domain", "from orders.application.service import OrderService"),
        ("domain", "from core.security import create_access_token"),
        ("infrastructure", "from orders.application.service import OrderService"),
        ("infrastructure", "from fastapi import Depends"),
        ("domain", "def f():\n    from orders.infrastructure import models"),  # 함수 안 import 도 잡는다
        ("domain", "from .order import Order"),
    ],
)
def test_checker_catches_each_kind_of_violation(layer, source):
    assert violations(layer, source)


@pytest.mark.parametrize(
    ("layer", "source"),
    [
        ("presentation", "from orders.application.service import OrderService\nfrom orders.domain.order import Order"),
        ("application", "from orders.domain.repository import OrderRepository"),
        ("domain", "from core.exceptions import Conflict\nfrom customers.domain.customer import normalize_phone"),
        ("infrastructure", "from sqlalchemy import select\nfrom orders.domain.order import Order"),
    ],
)
def test_checker_allows_inward_dependencies(layer, source):
    assert violations(layer, source) == []
