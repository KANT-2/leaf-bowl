"""기존 관리자 비밀번호(scrypt) 검증."""

import base64
import binascii
import hashlib
import hmac
import unicodedata


def verify_admin_password(password: str, stored_hash: str) -> bool:
    """입력 비밀번호가 저장된 관리자 해시와 일치하는지 확인한다."""
    try:
        scheme, salt_b64, key_b64 = stored_hash.split("$")

        if scheme != "scrypt":
            return False

        salt = base64.b64decode(salt_b64, validate=True)
        expected = base64.b64decode(key_b64, validate=True)

        if len(salt) != 16 or len(expected) != 64:
            return False

        normalized = unicodedata.normalize("NFKC", password)

        actual = hashlib.scrypt(
            normalized.encode("utf-8"),
            salt=salt,
            n=16384,
            r=8,
            p=1,
            dklen=64,
        )

        return hmac.compare_digest(actual, expected)

    except (ValueError, TypeError, binascii.Error):
        return False
