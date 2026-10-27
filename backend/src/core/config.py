"""환경변수 설정. 값은 backend/.env 에서 읽고, 예시는 .env.example 에 둔다."""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "leaf & bowl API"
    debug: bool = False

    # 비어 있으면 DB 없이 기동한다 (/health 만 동작). 형식: postgresql+asyncpg://user:pw@host:5432/db
    database_url: str = ""
    # Supabase Transaction pooler(6543)처럼 prepared statement 를 못 쓰는 풀러에서만 true
    database_disable_statement_cache: bool = False
    # SQLAlchemy AsyncAdaptedQueuePool 기본값과 동일하다.
    database_pool_size: int = Field(default=5, ge=1, le=50)
    database_max_overflow: int = Field(default=10, ge=0, le=50)
    database_pool_timeout: float = Field(default=30, gt=0, le=300)
    database_pool_recycle: int = Field(default=-1, ge=-1, le=86400)

    @field_validator("database_pool_recycle")
    @classmethod
    def validate_pool_recycle(cls, value: int) -> int:
        if value == 0:
            raise ValueError("DATABASE_POOL_RECYCLE must be -1 or at least 1 second")
        return value

    # 쉼표로 구분한 프론트엔드 주소 목록
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # 공개 메뉴 검색 결과에만 적용한다. 인증·회원·블랙리스트는 이 캐시를 사용하지 않는다.
    catalog_cache_enabled: bool = True
    catalog_cache_ttl_seconds: float = Field(default=60, gt=0, le=3600)
    catalog_cache_max_entries: int = Field(default=256, ge=1, le=4096)

    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
