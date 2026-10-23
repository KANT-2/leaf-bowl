"""팀 공통 예외.

이 모듈은 FastAPI·SQLAlchemy 를 import 하지 않는 순수 파이썬이라 domain 계층에서도 던질 수 있다.
HTTP 응답으로 바꾸는 일은 core/exception_handlers.py 가 맡는다.

    raise NotFound("주문을 찾을 수 없습니다.")
    raise BusinessRuleViolation("배송지는 최대 5개까지 등록할 수 있습니다.")
"""


class AppError(Exception):
    status_code: int = 400
    code: str = "bad_request"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class BusinessRuleViolation(AppError):
    """도메인 규칙 위반 (예: 최소 주문 금액 미달, 배송지 개수 초과)"""

    status_code = 400
    code = "business_rule_violation"


class Unauthorized(AppError):
    """로그인 필요, 토큰 만료·위조, 로그아웃한 토큰"""

    status_code = 401
    code = "unauthorized"


class Forbidden(AppError):
    """로그인은 했지만 권한 없음 (남의 데이터, 관리자 전용)"""

    status_code = 403
    code = "forbidden"


class NotFound(AppError):
    status_code = 404
    code = "not_found"


class Conflict(AppError):
    """현재 상태와 충돌 (예: 이미 가입된 이메일, 이미 바뀐 주문 상태, version 불일치)"""

    status_code = 409
    code = "conflict"
