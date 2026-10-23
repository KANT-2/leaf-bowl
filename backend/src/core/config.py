"""환경변수 설정. 값은 backend/.env 에서 읽고, 예시는 .env.example 에 둔다."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "leaf & bowl API"
    debug: bool = False

    # 비어 있으면 DB 없이 기동한다 (/health 만 동작). 형식: postgresql+asyncpg://user:pw@host:5432/db
    database_url: str = ""
    # Supabase Transaction pooler(6543)처럼 prepared statement 를 못 쓰는 풀러에서만 true
    database_disable_statement_cache: bool = False

    # 쉼표로 구분한 프론트엔드 주소 목록
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
