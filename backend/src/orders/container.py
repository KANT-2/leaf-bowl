"""주문 모듈 조립. 4계층 밖에서 응용 서비스에 어떤 인프라 구현을 넣을지 정한다 (main.py 가 앱을 조립하는 것과 같다).

표현 계층은 이 함수를 Depends 로 받기만 하므로 SQLAlchemy·Repository 구현을 모른다.
요청마다 세션 하나로 저장소·카탈로그·설정을 묶는다. 테스트는 app.dependency_overrides[get_order_service] 로
메모리 저장소를 넣는다.
"""

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from orders.application.service import OrderService
from orders.infrastructure.receipt_image import PillowReceiptRenderer
from orders.infrastructure.repositories import SqlCatalogReader, SqlOrderRepository, SqlSettingsReader


def get_order_service(session: AsyncSession = Depends(get_session)) -> OrderService:
    # 인증 의존성도 같은 get_session 을 쓰므로 FastAPI 가 한 요청 안에서 같은 세션을 나눠 쓴다
    return OrderService(
        session,
        SqlOrderRepository(session),
        SqlCatalogReader(session),
        SqlSettingsReader(session),
        receipt_renderer=PillowReceiptRenderer(),
    )
