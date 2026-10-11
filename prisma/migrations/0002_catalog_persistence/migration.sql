ALTER TABLE catalog_meta ADD COLUMN next_customer_id INTEGER NOT NULL DEFAULT 12 CHECK (next_customer_id >= 12);
ALTER TABLE catalog_meta ADD COLUMN has_season_pages BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN allergens_text VARCHAR(400) NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN is_new BOOLEAN;
ALTER TABLE ingredients ADD COLUMN allergens_text VARCHAR(400) NOT NULL DEFAULT '';
ALTER TABLE ingredients ADD COLUMN origin VARCHAR(100);
ALTER TABLE ingredients ADD COLUMN origin_detail VARCHAR(300);
ALTER TABLE reviews ADD COLUMN via VARCHAR(10) CHECK (via IN ('pickup', 'delivery'));
ALTER TABLE reviews ADD COLUMN original_product_id VARCHAR(80);

CREATE TABLE deleted_review_ids (
  id VARCHAR(80) PRIMARY KEY,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE catalog_imports (
  checksum VARCHAR(64) PRIMARY KEY,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stable option/item order and sales reporting after restart.
ALTER TABLE order_items ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN product_type VARCHAR(10) CHECK (product_type IN ('salad', 'drink', 'custom'));
CREATE INDEX idx_orders_completed ON orders (updated_at DESC) WHERE status = 'completed';
