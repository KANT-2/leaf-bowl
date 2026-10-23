"""주문 서비스 의존성. 테스트는 app.dependency_overrides[get_order_service] 로 메모리 저장소를 넣는다."""

from fastapi import HTTPException, status

from orders.application.service import OrderService


def get_order_service() -> OrderService:
    # TODO(UC-C 5단계): orders.customer_id 마이그레이션(A안) 적용 후 SQL 저장소로 조립한다.
    #   OrderService(session, SqlOrderRepository(session), SqlCatalogReader(session), SqlSettingsReader(session))
    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "주문 저장소가 아직 연결되지 않았습니다.")
