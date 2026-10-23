"""예외를 HTTP 응답으로 바꾼다. 모든 오류 응답은 {"error": {"code", "message"}} 모양이다."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from core.exceptions import AppError, Unauthorized

logger = logging.getLogger("app.errors")


def error_body(code: str, message: str, details: list | None = None) -> dict:
    body: dict = {"code": code, "message": message}
    if details:
        body["details"] = details
    return {"error": body}


async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
    headers = {"WWW-Authenticate": "Bearer"} if isinstance(exc, Unauthorized) else None
    return JSONResponse(error_body(exc.code, exc.message), status_code=exc.status_code, headers=headers)


async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    # 입력값(input)은 비밀번호일 수 있으므로 위치와 이유만 돌려준다
    details = [{"loc": list(err["loc"]), "msg": err["msg"]} for err in exc.errors()]
    return JSONResponse(error_body("validation_error", "입력값을 확인해주세요.", details), status_code=422)


async def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    message = exc.detail if isinstance(exc.detail, str) else "요청을 처리할 수 없습니다."
    return JSONResponse(
        error_body(f"http_{exc.status_code}", message), status_code=exc.status_code, headers=exc.headers
    )


async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("처리하지 못한 오류: %s %s", request.method, request.url.path)
    return JSONResponse(error_body("internal_error", "서버 오류가 발생했습니다."), status_code=500)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, handle_app_error)
    app.add_exception_handler(RequestValidationError, handle_validation_error)
    app.add_exception_handler(StarletteHTTPException, handle_http_exception)
    app.add_exception_handler(Exception, handle_unexpected)
