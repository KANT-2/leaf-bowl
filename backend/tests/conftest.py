"""테스트는 실제 DB(Supabase)에 접속하지 않는다. backend/.env 값보다 환경변수가 우선한다."""

import os

os.environ["DATABASE_URL"] = ""
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-pytest-only-0123456789abcdef"

from core.config import get_settings  # noqa: E402

get_settings.cache_clear()
