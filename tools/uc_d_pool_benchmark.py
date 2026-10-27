"""Read-only pool comparison against the explicitly identified UC-D local test cluster."""

import asyncio
import json
import os
import statistics
import sys
from pathlib import Path
from time import perf_counter
from urllib.parse import urlsplit

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

from admin_orders.infrastructure.orders import SqlAdminOrderReader  # noqa: E402
from core.config import Settings  # noqa: E402
from database import async_database_url, create_db_engine  # noqa: E402
from orders.domain.repository import OrderListFilter  # noqa: E402

CONCURRENCY = 12
REQUESTS = 60
REPEATS = 3
WARMUP = 24
CASES = {"default": (5, 10), "tuning_a": (5, 5), "tuning_b": (10, 10)}


def percentile(values: list[float], proportion: float) -> float:
    ordered = sorted(values)
    return ordered[max(0, int(len(ordered) * proportion + 0.999999) - 1)]


async def verify_target(url: str, directory: Path, system_id: str) -> dict:
    parsed = urlsplit(url)
    expected = directory.resolve()
    if (
        parsed.hostname != "127.0.0.1"
        or parsed.port != 55432
        or not parsed.path.endswith("_test")
        or not expected.is_relative_to(ROOT / ".data")
        or not system_id.isdecimal()
    ):
        raise RuntimeError("benchmark requires the identified loopback UC-D test cluster")
    engine = create_async_engine(async_database_url(url), poolclass=NullPool)
    try:
        async with engine.connect() as connection:
            row = (
                await connection.execute(
                    text(
                        "SELECT current_setting('data_directory'), "
                        "host(inet_server_addr()), inet_server_port(), "
                        "(pg_control_system()).system_identifier, current_database(), "
                        "current_setting('max_connections')::int, "
                        "(SELECT count(*) FROM orders), "
                        "(SELECT count(*) FROM pg_stat_activity)"
                    )
                )
            ).one()
            if (
                Path(row[0]).resolve() != expected
                or row[1] != "127.0.0.1"
                or row[2] != 55432
                or str(row[3]) != system_id
                or row[4] != parsed.path.lstrip("/")
                or not row[4].endswith("_test")
            ):
                raise RuntimeError("connected cluster identity does not match")
            if row[5] < 40 or row[7] + CONCURRENCY + 8 > row[5]:
                raise RuntimeError("PostgreSQL connection headroom is too low")
            return {"database": row[4], "max_connections": row[5], "orders": row[6],
                    "sessions_before": row[7]}
    finally:
        await engine.dispose()


async def measure(url: str, name: str, pool_size: int, overflow: int, workload: str) -> dict:
    settings = Settings(
        _env_file=None,
        database_url=url,
        database_pool_size=pool_size,
        database_max_overflow=overflow,
        database_pool_timeout=30,
        database_pool_recycle=-1,
    )
    engine = create_db_engine(settings)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    in_use = 0
    max_in_use = 0

    @event.listens_for(engine.sync_engine, "checkout")
    def on_checkout(_connection, _record, _proxy):
        nonlocal in_use, max_in_use
        in_use += 1
        max_in_use = max(max_in_use, in_use)

    @event.listens_for(engine.sync_engine, "checkin")
    def on_checkin(_connection, _record):
        nonlocal in_use
        in_use -= 1

    async def one() -> tuple[float, float]:
        start = perf_counter()
        async with sessions() as session:
            await session.connection()
            wait_ms = (perf_counter() - start) * 1000
            if workload == "select_1":
                await session.execute(text("SELECT 1"))
            else:
                await SqlAdminOrderReader(session).list_all(20, None, OrderListFilter())
        return (perf_counter() - start) * 1000, wait_ms

    async def batch(count: int, concurrency: int) -> tuple[list[tuple[float, float]], list[str], float]:
        limiter = asyncio.Semaphore(concurrency)

        async def bounded():
            async with limiter:
                try:
                    return await one(), None
                except Exception as exc:
                    return None, type(exc).__name__

        start = perf_counter()
        results = await asyncio.gather(*(bounded() for _ in range(count)))
        elapsed = perf_counter() - start
        return [result for result, _ in results if result], [error for _, error in results if error], elapsed

    try:
        warm_results, warm_errors, _ = await batch(WARMUP, CONCURRENCY)
        if warm_errors or len(warm_results) != WARMUP:
            raise RuntimeError(f"warmup errors: {warm_errors[:3]}")
        single, single_errors, _ = await batch(20, 1)
        samples: list[tuple[float, float]] = []
        errors = single_errors[:]
        seconds = 0.0
        for _ in range(REPEATS):
            result, failed, elapsed = await batch(REQUESTS, CONCURRENCY)
            samples.extend(result)
            errors.extend(failed)
            seconds += elapsed
        latencies = [sample[0] for sample in samples]
        waits = [sample[1] for sample in samples]
        result = {
            "case": name,
            "workload": workload,
            "pool_size": pool_size,
            "max_overflow": overflow,
            "single_mean_ms": round(statistics.mean(value[0] for value in single), 2) if single else None,
            "throughput_rps": round(len(samples) / seconds, 1),
            "mean_ms": round(statistics.mean(latencies), 2) if latencies else None,
            "p50_ms": round(percentile(latencies, 0.5), 2) if latencies else None,
            "p95_ms": round(percentile(latencies, 0.95), 2) if latencies else None,
            "checkout_mean_ms": round(statistics.mean(waits), 2) if waits else None,
            "checkout_p95_ms": round(percentile(waits, 0.95), 2) if waits else None,
            "errors": len(errors),
            "error_types": sorted(set(errors)),
            "max_connections_used": max_in_use,
            "connections_checked_out_after": engine.sync_engine.pool.checkedout(),
            "event_balance_after": in_use,
        }
        return result
    finally:
        await engine.dispose()


async def main() -> None:
    url = os.environ.get("TEST_DATABASE_URL", "")
    directory = os.environ.get("UC_D_TEST_DATA_DIRECTORY", "")
    system_id = os.environ.get("UC_D_TEST_SYSTEM_ID", "")
    if not url or not directory or not system_id:
        raise RuntimeError("TEST_DATABASE_URL and UC_D_TEST cluster identity are required")
    environment = await verify_target(url, Path(directory), system_id)
    rows = []
    for workload in ("select_1", "admin_orders"):
        for name, (pool_size, overflow) in CASES.items():
            rows.append(await measure(url, name, pool_size, overflow, workload))
    print(json.dumps({"environment": environment, "concurrency": CONCURRENCY, "requests_per_repeat": REQUESTS,
                      "repeats": REPEATS, "warmup": WARMUP, "results": rows}, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
