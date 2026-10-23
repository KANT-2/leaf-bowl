-- 회원 주문 (FastAPI UC-C). 주문의 주인은 비회원 세션(customer_session_id) 또는 회원(customer_id) 중 정확히 하나다.
-- customers 표는 FastAPI 가 만들고 Prisma 마이그레이션 이력에는 없으므로 외래키를 걸지 않는다 (customer_session_id 와 같은 방식).
ALTER TABLE orders ADD COLUMN customer_id BIGINT;
ALTER TABLE orders ALTER COLUMN customer_session_id DROP NOT NULL;
ALTER TABLE orders ADD CONSTRAINT chk_order_owner CHECK (num_nonnulls(customer_session_id, customer_id) = 1);

-- 같은 회원이 같은 재전송 식별키로 다시 보내도 주문은 한 건. 비회원 주문은 기존 uq_order_request 가 맡는다
-- (회원 주문의 customer_session_id 는 NULL 이라 uq_order_request 에서 서로 충돌하지 않는다).
CREATE UNIQUE INDEX uq_order_member_request ON orders (customer_id, request_key) WHERE customer_id IS NOT NULL;
-- 회원의 내 주문 목록: 최신순 + 다음 쪽(마지막으로 본 주문 기준)
CREATE INDEX idx_orders_customer ON orders (customer_id, created_at DESC, id DESC) WHERE customer_id IS NOT NULL;
