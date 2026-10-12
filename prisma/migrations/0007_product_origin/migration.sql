-- 상품(음료 등)에 재료 원산지 안내를 추가한다.
ALTER TABLE products ADD COLUMN origin VARCHAR(200);
