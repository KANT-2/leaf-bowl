"""W102: compare the existing optimistic update with test-only SELECT FOR UPDATE."""

import asyncio
import json
import os
import statistics
import sys
from collections import Counter
from pathlib import Path
from time import perf_counter
from urllib.parse import urlsplit

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import async_sessionmaker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))
sys.path.insert(0, str(ROOT / "backend" / "tests"))

from uc_d_pool_benchmark import verify_target  # noqa: E402

from admin_orders.application.order_status import AdminOrderStatusService  # noqa: E402
from core.config import Settings  # noqa: E402
from core.exceptions import Conflict  # noqa: E402
from database import create_db_engine  # noqa: E402
from orders.domain.order import OrderStatus  # noqa: E402
from orders.infrastructure.repositories import SqlOrderRepository  # noqa: E402
from test_admin_order_postgres import ADMIN_ID, make_order, snapshot  # noqa: E402

SYSTEM_ID = "7700979184671432628"
DATA_DIRECTORY = ROOT / ".data" / "uc-d-postgres-20261026"
DATABASE = "leaf_bowl_uc_d_test"
CONCURRENT_REQUESTS = 2
WARMUP_PAIRS = 2
PAIRS_PER_REPEAT = 10
REPEATS = 3
POOL_SIZE = 5
MAX_OVERFLOW = 10


def percentile(values: list[float], proportion: float) -> float:
    ordered = sorted(values)
    return ordered[max(0, int(len(ordered) * proportion + 0.999999) - 1)]


async def request(sessions, order_id, mode: str, start: asyncio.Event, *,
                  lock_timeout_ms: int = 2000, ready: asyncio.Event | None = None) -> dict:
    await start.wait()
    begin = perf_counter()
    acquisition_ms = None
    try:
        async with sessions() as session:
            await session.execute(text(f"SET LOCAL lock_timeout = '{lock_timeout_ms}ms'"))
            await session.execute(text("SET LOCAL statement_timeout = '5000ms'"))
            if mode == "pessimistic":
                if ready is not None:
                    ready.set()
                lock_start = perf_counter()
                row = (await session.execute(
                    text("SELECT status, version FROM orders WHERE id = :id FOR UPDATE"),
                    {"id": order_id},
                )).one()
                acquisition_ms = (perf_counter() - lock_start) * 1000
                # Recheck under the row lock before calling the unchanged production service.
                if row.status != OrderStatus.RECEIVED.value or row.version != 1:
                    raise Conflict("stale order after row lock")
            await AdminOrderStatusService(session, SqlOrderRepository(session)).change_status(
                order_id, to_status=OrderStatus.CONFIRMED, version=1,
                reason="W102 isolated locking comparison", admin_id=str(ADMIN_ID),
            )
        outcome = "success"
    except Conflict:
        outcome = "conflict"
    except DBAPIError as exc:
        sqlstate = getattr(exc.orig, "sqlstate", None)
        outcome = "lock_timeout" if sqlstate == "55P03" else "deadlock" if sqlstate == "40P01" else "db_error"
    except TimeoutError:
        outcome = "client_timeout"
    return {"outcome": outcome, "latency_ms": (perf_counter() - begin) * 1000,
            "lock_acquire_ms": acquisition_ms}


async def trial(sessions, engine, mode: str) -> tuple[list[dict], float]:
    order_id = await make_order(sessions)
    before = await snapshot(sessions, order_id)
    assert before[0] == ("received", 1) and len(before[1]) == 1
    start = asyncio.Event()
    tasks = [asyncio.create_task(request(sessions, order_id, mode, start))
             for _ in range(CONCURRENT_REQUESTS)]
    await asyncio.sleep(0)
    begin = perf_counter()
    start.set()
    results = await asyncio.wait_for(asyncio.gather(*tasks), timeout=10)
    elapsed = perf_counter() - begin
    after = await snapshot(sessions, order_id)
    assert Counter(item["outcome"] for item in results) == {"success": 1, "conflict": 1}
    assert after[0] == ("confirmed", 2) and len(after[1]) == 2
    assert after[1][-1].changed_by == "admin" and after[1][-1].admin_user_id == ADMIN_ID
    assert engine.sync_engine.pool.checkedout() == 0
    return results, elapsed


async def controlled_lock_checks(sessions, engine) -> dict:
    waited_order = await make_order(sessions)
    start = asyncio.Event()
    ready = asyncio.Event()
    async with sessions() as blocker:
        await blocker.execute(text("SELECT id FROM orders WHERE id = :id FOR UPDATE"), {"id": waited_order})
        waiter = asyncio.create_task(request(sessions, waited_order, "pessimistic", start, ready=ready))
        start.set()
        await asyncio.wait_for(ready.wait(), timeout=2)
        await asyncio.sleep(0.08)
        assert not waiter.done(), "FOR UPDATE contender should still be waiting"
        await blocker.rollback()
    waited = await asyncio.wait_for(waiter, timeout=5)
    assert waited["outcome"] == "success" and waited["lock_acquire_ms"] >= 60
    assert (await snapshot(sessions, waited_order))[0] == ("confirmed", 2)

    timed_out_order = await make_order(sessions)
    async with sessions() as blocker:
        await blocker.execute(text("SELECT id FROM orders WHERE id = :id FOR UPDATE"), {"id": timed_out_order})
        start = asyncio.Event()
        task = asyncio.create_task(request(sessions, timed_out_order, "pessimistic", start, lock_timeout_ms=30))
        start.set()
        timed_out = await asyncio.wait_for(task, timeout=5)
        assert timed_out["outcome"] == "lock_timeout"
        await blocker.rollback()
    assert (await snapshot(sessions, timed_out_order))[0] == ("received", 1)
    assert engine.sync_engine.pool.checkedout() == 0
    return {"controlled_wait_ms": round(waited["lock_acquire_ms"], 2),
            "forced_timeout": timed_out["outcome"]}


async def main() -> None:
    url = os.environ.get("TEST_DATABASE_URL", "")
    parsed = urlsplit(url)
    if (parsed.hostname != "127.0.0.1" or parsed.port != 55432
            or parsed.path != f"/{DATABASE}"
            or os.environ.get("UC_D_TEST_SYSTEM_ID") != SYSTEM_ID
            or Path(os.environ.get("UC_D_TEST_DATA_DIRECTORY", ".")).resolve() != DATA_DIRECTORY.resolve()):
        raise RuntimeError("W102 requires the previously identified disposable local cluster")
    environment = await verify_target(url, DATA_DIRECTORY, SYSTEM_ID)
    engine = create_db_engine(Settings(_env_file=None, database_url=url,
                                       database_pool_size=POOL_SIZE, database_max_overflow=MAX_OVERFLOW))
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with sessions() as session:
            await session.execute(text("INSERT INTO admin_users (id, login_id, password_hash) "
                                       "VALUES (:id, 'uc_d_local_test', 'test-only-unused-hash') "
                                       "ON CONFLICT (id) DO NOTHING"), {"id": ADMIN_ID})
            await session.commit()
        for mode in ("optimistic", "pessimistic"):
            for _ in range(WARMUP_PAIRS):
                await trial(sessions, engine, mode)

        samples = {"optimistic": [], "pessimistic": []}
        elapsed = {"optimistic": 0.0, "pessimistic": 0.0}
        for repeat in range(REPEATS):
            modes = ("optimistic", "pessimistic") if repeat % 2 == 0 else ("pessimistic", "optimistic")
            for mode in modes:
                for _ in range(PAIRS_PER_REPEAT):
                    result, seconds = await trial(sessions, engine, mode)
                    samples[mode].extend(result)
                    elapsed[mode] += seconds
        rows = []
        for mode in ("optimistic", "pessimistic"):
            results = samples[mode]
            latencies = [item["latency_ms"] for item in results]
            waits = [item["lock_acquire_ms"] for item in results if item["lock_acquire_ms"] is not None]
            outcomes = Counter(item["outcome"] for item in results)
            rows.append({"mode": mode, "requests": len(results), "success": outcomes["success"],
                         "conflict": outcomes["conflict"],
                         "errors": len(results) - outcomes["success"] - outcomes["conflict"],
                         "mean_ms": round(statistics.mean(latencies), 2),
                         "p50_ms": round(percentile(latencies, 0.5), 2),
                         "p95_ms": round(percentile(latencies, 0.95), 2),
                         "throughput_rps": round(len(results) / elapsed[mode], 1),
                         "lock_acquire_mean_ms": round(statistics.mean(waits), 2) if waits else None,
                         "lock_acquire_p95_ms": round(percentile(waits, 0.95), 2) if waits else None,
                         "timeouts": outcomes["lock_timeout"] + outcomes["client_timeout"],
                         "deadlocks": outcomes["deadlock"]})
        controls = await controlled_lock_checks(sessions, engine)
        assert engine.sync_engine.pool.checkedout() == 0
        print(json.dumps({"environment": environment, "pool_size": POOL_SIZE,
                          "max_overflow": MAX_OVERFLOW, "concurrent_requests": CONCURRENT_REQUESTS,
                          "warmup_pairs_per_mode": WARMUP_PAIRS, "pairs_per_repeat": PAIRS_PER_REPEAT,
                          "repeats": REPEATS, "results": rows, "controls": controls,
                          "checked_out_after": engine.sync_engine.pool.checkedout()}, indent=2))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
