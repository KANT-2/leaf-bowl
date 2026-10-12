-- No review/session FK: deletion or expiry must not erase the one-review-per-purchase claim.
CREATE TABLE review_submissions (
  order_item_id BIGINT PRIMARY KEY CHECK (order_item_id > 0),
  review_id VARCHAR(80) NOT NULL,
  customer_session_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_review_submission_id UNIQUE (review_id)
);
CREATE INDEX idx_review_submission_session ON review_submissions (customer_session_id);
