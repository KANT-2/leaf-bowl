"""요청 로깅. 메서드·경로·상태 코드·처리 시간만 남긴다.

쿼리스트링, 헤더(Authorization), 요청·응답 본문은 기록하지 않는다 (토큰·비밀번호·개인정보 보호).
"""

import logging
import time
import uuid

from fastapi import Request, Response
from starlette.middleware.base import RequestResponseEndpoint

logger = logging.getLogger("app.request")


async def log_requests(request: Request, call_next: RequestResponseEndpoint) -> Response:
    request_id = uuid.uuid4().hex[:8]
    started = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
    finally:
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.info("%s %s %s %d %.1fms", request_id, request.method, request.url.path, status_code, elapsed_ms)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time-Ms"] = f"{elapsed_ms:.1f}"
    return response
