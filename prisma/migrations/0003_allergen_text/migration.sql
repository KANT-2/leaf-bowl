-- The catalog accepts up to 400 characters of allergen text.
ALTER TABLE allergens ALTER COLUMN name TYPE VARCHAR(400);

-- Keep the ordered identifier after the catalog FK is set to NULL.
ALTER TABLE order_items ADD COLUMN original_product_id VARCHAR(80);
UPDATE order_items SET original_product_id = product_id;
