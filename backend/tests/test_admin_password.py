"""관리자 scrypt 비밀번호 검증 테스트."""

import base64
import hashlib
import unicodedata

import pytest

from admin_orders.domain.password import verify_admin_password


def make_test_hash(password: str) -> str:
    """테스트에서만 사용하는 임시 해시."""
    salt = b"0123456789abcdef"
    normalized = unicodedata.normalize("NFKC", password)

    key = hashlib.scrypt(
        normalized.encode("utf-8"),
        salt=salt,
        n=16384,
        r=8,
        p=1,
        dklen=64,
    )

    return f"scrypt${base64.b64encode(salt).decode()}${base64.b64encode(key).decode()}"


def test_correct_password() -> None:
    stored = make_test_hash("correct-password")

    assert verify_admin_password("correct-password", stored)


def test_wrong_password() -> None:
    stored = make_test_hash("correct-password")

    assert not verify_admin_password("wrong-password", stored)


def test_nfkc_normalization() -> None:
    stored = make_test_hash("ＡＢＣ１２３")

    assert verify_admin_password("ABC123", stored)


@pytest.mark.parametrize(
    "stored",
    [
        "",
        "invalid",
        "argon2$abc$def",
        "scrypt$invalid",
        "scrypt$@@@$@@@@",
        "scrypt$$",
    ],
)
def test_invalid_hash_is_rejected(stored: str) -> None:
    assert not verify_admin_password("password", stored)
