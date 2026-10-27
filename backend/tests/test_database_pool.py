"""Pool configuration and safe local PostgreSQL checkout checks."""

import os
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import TimeoutError as PoolTimeoutError

from admin_orders.infrastructure.orders import SqlAdminOrderReader
from core.config import Settings
from database import create_db_engine
from orders.domain.repository import OrderListFilter

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("database_pool_size", 0),
        ("database_pool_size", 51),
        ("database_max_overflow", -1),
        ("database_max_overflow", 51),
        ("database_pool_timeout", 0),
        ("database_pool_timeout", 301),
        ("database_pool_recycle", -2),
        ("database_pool_recycle", 0),
        ("database_pool_recycle", 86401),
    ],
)
def test_invalid_pool_settings_are_rejected(field, value):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{field: value})


def test_invalid_pool_setting_from_environment_is_rejected(monkeypatch):
    monkeypatch.setenv("DATABASE_POOL_SIZE", "0")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


@pytest.mark.anyio
async def test_pool_defaults_and_custom_values():
    defaults = Settings(_env_file=None, database_url="postgresql://localhost/unused_test")
    assert (defaults.database_pool_size, defaults.database_max_overflow,
            defaults.database_pool_timeout, defaults.database_pool_recycle) == (5, 10, 30, -1)
    settings = Settings(
        _env_file=None,
        database_url="postgresql://localhost/unused_test",
        database_pool_size=2,
        database_max_overflow=0,
        database_pool_timeout=0.05,
        database_pool_recycle=60,
        database_disable_statement_cache=True,
    )
    engine = create_db_engine(settings)
    try:
        pool = engine.sync_engine.pool
        assert (pool.size(), pool._max_overflow, pool._timeout, pool._recycle) == (2, 0, 0.05, 60)
        assert pool._pre_ping is True
        assert engine.url.drivername == "postgresql+asyncpg"
    finally:
        await engine.dispose()


@pytest.mark.anyio
async def test_shared_engine_closes_on_app_shutdown(monkeypatch):
    import database

    settings = Settings(_env_file=None, database_url="postgresql://localhost/unused_test")
    monkeypatch.setattr(database, "get_settings", lambda: settings)
    monkeypatch.setattr(database, "_engine", None)
    monkeypatch.setattr(database, "_session_factory", None)
    engine = database.get_engine()
    assert database.get_engine() is engine
    async with database.new_session():
        pass
    await database.close_db()
    assert database._engine is None
    assert database._session_factory is None


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_local_postgres_reader_timeout_and_connection_return():
    url = os.environ.get("TEST_DATABASE_URL", "")
    directory = os.environ.get("UC_D_TEST_DATA_DIRECTORY", "")
    system_id = os.environ.get("UC_D_TEST_SYSTEM_ID", "")
    if not url or not directory or not system_id:
        pytest.skip("explicit local cluster identity is required")
    parsed = urlsplit(url)
    expected = Path(directory).resolve()
    if (parsed.hostname != "127.0.0.1" or parsed.port != 55432 or not parsed.path.endswith("_test")
            or not expected.is_relative_to(ROOT / ".data")):
        pytest.fail("only the dedicated UC-D loopback test cluster is allowed")

    settings = Settings(_env_file=None, database_url=url, database_pool_size=1,
                        database_max_overflow=0, database_pool_timeout=0.05)
    engine = create_db_engine(settings)
    try:
        async with engine.connect() as connection:
            row = (await connection.execute(text(
                "SELECT current_setting('data_directory'), (pg_control_system()).system_identifier, "
                "host(inet_server_addr()), inet_server_port(), current_database()"
            ))).one()
            if (Path(row[0]).resolve() != expected or str(row[1]) != system_id
                    or row[2] != "127.0.0.1" or row[3] != 55432 or row[4] != parsed.path.lstrip("/")):
                pytest.fail("connected cluster identity does not match")
            with pytest.raises(PoolTimeoutError):
                async with engine.connect():
                    pass
        assert engine.sync_engine.pool.checkedout() == 0
        from sqlalchemy.ext.asyncio import async_sessionmaker

        async with async_sessionmaker(engine)() as session:
            orders = await SqlAdminOrderReader(session).list_all(20, None, OrderListFilter())
            assert isinstance(orders, list)
        assert engine.sync_engine.pool.checkedout() == 0
    finally:
        await engine.dispose()
