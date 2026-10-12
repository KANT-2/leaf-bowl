ALTER TABLE site_content ADD COLUMN banner_pages JSONB NOT NULL DEFAULT '[]', ADD COLUMN has_banner_pages BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN banner_visible BOOLEAN NOT NULL DEFAULT TRUE;

-- Carry existing uploaded banners into the ordered page list.
UPDATE site_content SET
  banner_pages =
    CASE WHEN main_image <> '' THEN jsonb_build_array(jsonb_build_object(
      'id', 'legacy-main', 'image', main_image, 'mobileImage', main_mobile_image,
      'alt', 'leaf & bowl 메인 배너', 'href', '/menu', 'visible', true
    )) ELSE '[]'::jsonb END ||
    CASE WHEN hero_image <> '' THEN jsonb_build_array(jsonb_build_object(
      'id', 'legacy-ad', 'image', hero_image, 'mobileImage', hero_mobile_image,
      'alt', hero_alt, 'href', hero_href, 'visible', true
    )) ELSE '[]'::jsonb END,
  has_banner_pages = true
WHERE main_image <> '' OR hero_image <> '';
