"""앱 조립: lifespan(DB 초기화·종료), 미들웨어, 예외 핸들러, 라우터."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

import database
from auth.presentation.login_history import router as login_history_router
from auth.presentation.router import router as auth_router
from bowls.presentation.router import router as bowls_router
from catalog.presentation.router import router as catalog_router
from core.config import get_settings
from core.exception_handlers import register_exception_handlers
from core.middleware import log_requests
from customers.presentation.address_router import router as addresses_router
from customers.presentation.router import router as customers_router
from orders.presentation.router import router as orders_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    if database.is_configured():
        await database.init_db()
        logger.info("DB 연결 확인, FastAPI 소유 테이블 준비 완료")
    else:
        logger.warning("DATABASE_URL 이 없어 DB 없이 시작합니다. /health 만 동작합니다.")
    yield
    await database.close_db()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

    # 아래에 기존 미들웨어·예외 핸들러·health 코드가 이어집니다.

    # 나중에 추가한 미들웨어가 바깥쪽에서 실행된다: CORS → 로깅 → 라우터
    app.middleware("http")(log_requests)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-Process-Time-Ms"],
    )
    register_exception_handlers(app)

    @app.get("/health", tags=["health"])
    async def health() -> dict:
        return {"status": "ok"}

    @app.get("/health/db", tags=["health"])
    async def health_db() -> dict:
        if not database.is_configured():
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "DATABASE_URL 이 설정되지 않았습니다.")
        await database.ping()
        return {"status": "ok"}

    # 기능 라우터는 여기에 등록한다
    app.include_router(auth_router)
    app.include_router(customers_router)
    app.include_router(addresses_router)
    app.include_router(login_history_router)
    app.include_router(orders_router)
    app.include_router(catalog_router)
    app.include_router(bowls_router)
    return app


app = create_app()
