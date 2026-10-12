CREATE TABLE payment_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_session_id uuid NOT NULL,
  request_key varchar(80) NOT NULL,
  request_hash varchar(64) NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0 AND amount <= 300000000),
  order_snapshot jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  payment_key varchar(200) UNIQUE,
  order_id uuid UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  method varchar(30),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_payment_request UNIQUE (customer_session_id, request_key),
  CONSTRAINT payment_approval_complete CHECK (
    (order_id IS NULL AND approved_at IS NULL AND method IS NULL) OR
    (order_id IS NOT NULL AND approved_at IS NOT NULL AND method IS NOT NULL AND payment_key IS NOT NULL)
  )
);
CREATE INDEX idx_payment_checkouts_expires ON payment_checkouts(expires_at) WHERE order_id IS NULL;
