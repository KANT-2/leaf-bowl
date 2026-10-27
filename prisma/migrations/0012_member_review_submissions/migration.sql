-- 회원 주문 리뷰 (#224). 제출 기록의 주인은 주문의 주인과 같이 비회원 세션 또는 회원 중 정확히 하나다 (0011 chk_order_owner 와 같은 방식).
-- customers 표는 FastAPI 가 만들므로 customer_session_id 와 같이 외래키를 걸지 않는다.
ALTER TABLE review_submissions ADD COLUMN customer_id BIGINT;
ALTER TABLE review_submissions ALTER COLUMN customer_session_id DROP NOT NULL;
ALTER TABLE review_submissions
  ADD CONSTRAINT chk_review_submission_owner CHECK (num_nonnulls(customer_session_id, customer_id) = 1);
CREATE INDEX idx_review_submission_customer ON review_submissions (customer_id) WHERE customer_id IS NOT NULL;
