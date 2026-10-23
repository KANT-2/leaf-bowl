"""팀 공통 인증 의존성. 다른 기능의 router 에서 이렇게 쓴다.

    from core.dependencies import CurrentCustomer, get_current_customer

    @router.get("/api/orders")
    async def list_my_orders(customer: CurrentCustomer = Depends(get_current_customer)):
        ...  # customer.id 로 본인 데이터만 조회

    @router.patch("/api/admin/orders/{order_id}/status")
    async def change_status(admin: CurrentAdmin = Depends(require_admin)):
        ...

토큰이 없거나 만료·위조됐거나 로그아웃한 토큰이면 401 이 자동으로 나간다.
구현은 auth/presentation/dependencies.py 에 있다.
"""

from auth.presentation.dependencies import CurrentAdmin, CurrentCustomer, get_current_customer, require_admin

__all__ = ["CurrentAdmin", "CurrentCustomer", "get_current_customer", "require_admin"]
