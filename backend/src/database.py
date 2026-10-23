"""공통 DB 설정: 비동기 엔진·세션·선언 기반 클래스.

테이블 소유권
- Base       : FastAPI 가 새로 만드는 테이블 (customers, token_blacklist ...). lifespan 에서 create_all 한다.
- LegacyBase : 인수한 Prisma 테이블 (products, orders ...). 매핑만 하고 생성·변경은 Prisma 마이그레이션이 맡는다.
"""

from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from core.config import get_settings


class Base(DeclarativeBase):
    pass


class LegacyBase(DeclarativeBase):
    pass


_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def is_configured() -> bool:
    return bool(get_settings().database_url)


def async_database_url(url: str) -> str:
    """Supabase·Prisma 에서 복사한 postgresql:// 주소도 asyncpg 드라이버로 접속하게 맞춘다."""
    url = url.strip().strip("\"'")
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+asyncpg://" + url.removeprefix(prefix)
    return url


def get_engine() -> AsyncEngine:
    global _engine, _session_factory
    if _engine is None:
        settings = get_settings()
        if not settings.database_url:
            raise RuntimeError("DATABASE_URL 이 설정되지 않았습니다. backend/.env 를 확인하세요.")
        connect_args = {"statement_cache_size": 0} if settings.database_disable_statement_cache else {}
        _engine = create_async_engine(
            async_database_url(settings.database_url), pool_pre_ping=True, connect_args=connect_args
        )
        _session_factory = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


async def get_session() -> AsyncIterator[AsyncSession]:
    """요청마다 세션 하나. 커밋은 응용 서비스가 하고, 예외가 나면 여기서 롤백된다."""
    get_engine()
    assert _session_factory is not None
    async with _session_factory() as session:
        yield session


async def init_db() -> None:
    """FastAPI 소유 테이블만 만든다. 이미 있으면 건드리지 않는다."""
    import models  # noqa: F401  각 기능의 ORM 모델을 Base.metadata 에 등록한다

    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Supabase 는 public 테이블을 Data API(anon 키)로 노출한다. RLS 를 켜고 정책을 두지 않으면 외부 접근이 막힌다.
        # 테이블 소유자로 접속하는 FastAPI 는 RLS 를 거치지 않으므로 영향이 없다. 일반 PostgreSQL 에서도 무해하다.
        for table in Base.metadata.sorted_tables:
            await conn.execute(text(f'ALTER TABLE "{table.name}" ENABLE ROW LEVEL SECURITY'))


async def ping() -> None:
    async with get_engine().connect() as conn:
        await conn.execute(text("SELECT 1"))


async def close_db() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None
