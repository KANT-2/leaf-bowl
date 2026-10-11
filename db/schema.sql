-- leaf & bowl 최신 전체 스키마. 신규 DB에서 직접 SQL 초기화할 때 사용한다.
-- Prisma 관리 DB는 npm run db:migrate를 사용한다.
-- psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/schema.sql
BEGIN;
-- 0001_baseline
-- leaf & bowl DB 스키마 (PostgreSQL)
-- 관리자 카탈로그(lib/admin/catalog.ts 의 catalogSchema)를 그대로 옮긴 구조.
-- 지금 .data/admin/catalog.json 한 파일에 저장하는 내용을 테이블로 나눈다.
-- 실행 순서: schema.sql → seed.sql
-- 재료와 재료 기준 자동 품절은 맨 아래 '재료' 절에 있다.
--
-- 규칙
-- - id 는 관리자 화면이 만드는 문자열 id 를 그대로 쓴다 (예: salad-0, drink-1).
-- - 배열 순서가 화면 순서이므로 sort_order 로 보존한다.
-- - 관리자 데이터에서 빈 문자열('')인 값은 그대로 '' 로 저장한다 (NOT NULL DEFAULT '').
-- - 관리자 데이터에서 아예 없을 수 있는 항목(optional)만 NULL 을 허용한다.

-- 카탈로그 전체의 저장 버전. 동시에 두 화면이 저장할 때 늦은 쪽을 거부하는 데 쓴다 (409).
CREATE TABLE catalog_meta (
  id          SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),   -- 항상 1행
  revision    INTEGER     NOT NULL CHECK (revision > 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 매장 위치 (1행)
CREATE TABLE store_location (
  id              SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name            VARCHAR(100) NOT NULL,
  address         VARCHAR(300) NOT NULL,
  detail_address  VARCHAR(200) NOT NULL DEFAULT ''
);

-- 메뉴 분류 (든든한 단백질 · 플랜트 베이스 · 새로운 조합). 고객 화면 필터 탭 순서
CREATE TABLE categories (
  name        VARCHAR(80) PRIMARY KEY,
  sort_order  INTEGER     NOT NULL
);

-- 상품: 샐러드 · 음료 · 드레싱을 type 으로 구분
CREATE TABLE products (
  id           VARCHAR(80)   PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]+$'),
  customer_id  INTEGER       UNIQUE,                                           -- 고객 주소 번호 (/product/0), 샐러드만
  type         VARCHAR(10)   NOT NULL CHECK (type IN ('salad', 'drink', 'dressing')),
  name         VARCHAR(80)   NOT NULL,
  name_en      VARCHAR(100),
  price        INTEGER       NOT NULL CHECK (price >= 0),     -- 샐러드 가격 · 음료 추가 금액
  description  VARCHAR(600)  NOT NULL DEFAULT '',
  ingredients  VARCHAR(600),
  category     VARCHAR(80)   NOT NULL,                                          -- 샐러드는 categories.name, 음료·드레싱은 '음료'·'드레싱'
  status       VARCHAR(10)   NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'soldout', 'hidden')),
  badge        VARCHAR(5)    NOT NULL DEFAULT '' CHECK (badge IN ('', 'BEST', 'NEW', 'PLANT', 'PICK')),
  image        VARCHAR(200)  NOT NULL DEFAULT '',
  deleted      BOOLEAN       NOT NULL DEFAULT FALSE,                            -- 삭제해도 행은 남긴다 (리뷰·시즌 연결 보존)
  sort_order   INTEGER       NOT NULL,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_type ON products (type, sort_order);

-- 알레르기 유발 재료 (닭고기, 우유, 토마토 …). 이름은 중복 불가
CREATE TABLE allergens (
  id    INTEGER     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name  VARCHAR(20) NOT NULL UNIQUE
);

-- 상품 ↔ 알레르기 (N:M). 관리자 데이터의 allergens 문구("닭고기, 토마토")를 나눠 저장하고, 읽을 때 position 순서로 다시 합친다
CREATE TABLE product_allergens (
  product_id   VARCHAR(80) NOT NULL REFERENCES products (id)  ON DELETE CASCADE,
  allergen_id  INTEGER     NOT NULL REFERENCES allergens (id) ON DELETE RESTRICT,
  position     SMALLINT    NOT NULL,
  PRIMARY KEY (product_id, allergen_id)
);

-- 옵션 그룹: 드레싱 선택(필수 1개) · 음료 추가(여러 개) · 직접 만든 그룹
CREATE TABLE option_groups (
  id          VARCHAR(80) PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]+$'),
  name        VARCHAR(80) NOT NULL,
  required    BOOLEAN     NOT NULL,
  multiple    BOOLEAN     NOT NULL,
  source      VARCHAR(10) NOT NULL CHECK (source IN ('custom', 'drinks', 'dressings')),   -- drinks·dressings 는 products 에서 선택지를 가져온다
  deleted     BOOLEAN     NOT NULL DEFAULT FALSE,
  sort_order  INTEGER     NOT NULL
);

-- 직접 만든(custom) 그룹의 선택지. id 는 그룹 안에서만 겹치지 않으면 된다
CREATE TABLE option_choices (
  group_id    VARCHAR(80) NOT NULL REFERENCES option_groups (id) ON DELETE CASCADE,
  id          VARCHAR(80) NOT NULL CHECK (id ~ '^[a-zA-Z0-9_-]+$'),
  name        VARCHAR(80) NOT NULL,
  price       INTEGER     NOT NULL CHECK (price >= 0),
  sort_order  INTEGER     NOT NULL,
  PRIMARY KEY (group_id, id)
);

-- 상품 ↔ 옵션 그룹 (상품의 optionIds)
CREATE TABLE product_option_groups (
  product_id  VARCHAR(80) NOT NULL REFERENCES products (id)      ON DELETE CASCADE,
  group_id    VARCHAR(80) NOT NULL REFERENCES option_groups (id) ON DELETE RESTRICT,
  sort_order  INTEGER     NOT NULL,
  PRIMARY KEY (product_id, group_id)
);

-- 리뷰
CREATE TABLE reviews (
  id          VARCHAR(80)   PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]+$'),
  product_id  VARCHAR(80)   REFERENCES products (id) ON DELETE SET NULL,   -- 어떤 메뉴의 리뷰인지 (없을 수 있음)
  is_sample   BOOLEAN,                                                     -- 예시 리뷰 표시
  title       VARCHAR(200)  NOT NULL DEFAULT '',
  body        VARCHAR(10000) NOT NULL CHECK (length(body) >= 1),
  rating      SMALLINT      NOT NULL CHECK (rating BETWEEN 1 AND 5),
  menu        VARCHAR(120)  NOT NULL DEFAULT '',                           -- 화면 표시용 "메뉴 · 수령 방법"
  author      VARCHAR(80)   NOT NULL,
  date_label  VARCHAR(40)   NOT NULL,                                      -- 화면 표시용 날짜 (2026.10.05)
  created_at  TIMESTAMPTZ,
  deleted     BOOLEAN       NOT NULL DEFAULT FALSE,
  sort_order  INTEGER       NOT NULL
);

-- 리뷰 사진 (최대 10장)
CREATE TABLE review_images (
  review_id  VARCHAR(80)  NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
  position   SMALLINT     NOT NULL,
  image      VARCHAR(200) NOT NULL CHECK (image <> ''),
  PRIMARY KEY (review_id, position)
);

-- 리뷰에 적힌 함께 주문한 음료 이름
CREATE TABLE review_drinks (
  review_id  VARCHAR(80) NOT NULL REFERENCES reviews (id) ON DELETE CASCADE,
  position   SMALLINT    NOT NULL,
  name       VARCHAR(80) NOT NULL,
  PRIMARY KEY (review_id, position)
);

-- 메인 문구·시즌 스페셜 (1행)
CREATE TABLE site_content (
  id                  SMALLINT     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hero_title          VARCHAR(200) NOT NULL,
  hero_description    VARCHAR(600) NOT NULL DEFAULT '',
  season_title        VARCHAR(200) NOT NULL,
  season_description  VARCHAR(600) NOT NULL DEFAULT '',
  season_image        VARCHAR(200) NOT NULL DEFAULT '',
  season_product_id   VARCHAR(80)  REFERENCES products (id) ON DELETE SET NULL,   -- 관리자 데이터의 '' 는 NULL 로 저장
  season_visible      BOOLEAN      NOT NULL DEFAULT TRUE
);

-- 시즌 페이지 (여러 장, 최대 20)
CREATE TABLE season_pages (
  id          VARCHAR(80)  PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]+$'),
  title       VARCHAR(200) NOT NULL,
  description VARCHAR(600) NOT NULL DEFAULT '',
  image       VARCHAR(200) NOT NULL DEFAULT '',
  product_id  VARCHAR(80)  REFERENCES products (id) ON DELETE SET NULL,           -- 관리자 데이터의 '' 는 NULL 로 저장
  visible     BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order  INTEGER      NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- 재료와 재료 기준 자동 품절
-- ─────────────────────────────────────────────────────────────

-- (id, type) 로도 참조할 수 있게 한다. 아래 연결 테이블이 "이 id 는 샐러드/드레싱이어야 한다"를 DB 에서 막는 데 쓴다
ALTER TABLE products ADD CONSTRAINT uq_products_id_type UNIQUE (id, type);

-- 재료. 내 취향 찾기(bowl match)에서 고르는 재료와, 메뉴에만 쓰는 재료(파르메산 등)를 함께 둔다
CREATE TABLE ingredients (
  id             VARCHAR(80)   PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]+$'),
  name           VARCHAR(80)   NOT NULL,
  name_en        VARCHAR(100),
  price          INTEGER       CHECK (price >= 0),                 -- 내 취향 찾기에서 더하는 금액
  stage          VARCHAR(10)   CHECK (stage IN ('GREENS', 'PROTEIN', 'VEGGIES', 'TOPPINGS')),
  color          VARCHAR(40),
  description    VARCHAR(600)  NOT NULL DEFAULT '',
  image          VARCHAR(200)  NOT NULL DEFAULT '',
  category       VARCHAR(80)   NOT NULL,
  status         VARCHAR(10)   NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'soldout', 'hidden')),
  deleted        BOOLEAN       NOT NULL DEFAULT FALSE,
  in_bowl_match  BOOLEAN       NOT NULL DEFAULT TRUE,              -- false 면 메뉴에만 쓰고 내 취향 찾기 선택지에는 나오지 않는다
  sort_order     INTEGER       NOT NULL,
  -- 내 취향 찾기에서 고르려면 단계와 금액이 있어야 한다
  CONSTRAINT chk_bowl_match_fields CHECK (NOT in_bowl_match OR (stage IS NOT NULL AND price IS NOT NULL))
);

-- 재료 ↔ 알레르기 (N:M, 상품과 같은 방식)
CREATE TABLE ingredient_allergens (
  ingredient_id  VARCHAR(80) NOT NULL REFERENCES ingredients (id) ON DELETE CASCADE,
  allergen_id    INTEGER     NOT NULL REFERENCES allergens (id)   ON DELETE RESTRICT,
  position       SMALLINT    NOT NULL,
  PRIMARY KEY (ingredient_id, allergen_id)
);

-- 메뉴 ↔ 재료 (레시피). product_type 은 항상 'salad' 로 채워지는 열이라, 음료·드레싱 id 를 넣으면 외래키가 거부한다
CREATE TABLE product_ingredients (
  product_id     VARCHAR(80) NOT NULL,
  product_type   VARCHAR(10) GENERATED ALWAYS AS ('salad') STORED,
  ingredient_id  VARCHAR(80) NOT NULL REFERENCES ingredients (id) ON DELETE RESTRICT,
  is_required    BOOLEAN     NOT NULL DEFAULT TRUE,                 -- false 면 이 재료가 품절이어도 메뉴는 품절이 아니다 (선택 토핑)
  position       SMALLINT    NOT NULL,
  PRIMARY KEY (product_id, ingredient_id),
  FOREIGN KEY (product_id, product_type) REFERENCES products (id, type) ON DELETE CASCADE
);
CREATE INDEX idx_product_ingredients_ingredient ON product_ingredients (ingredient_id);

-- 메뉴 ↔ 어울리는 드레싱. 행이 있으면 그 드레싱만 보여준다. '드레싱 없이'는 모든 메뉴에 항상 둔다 (앱 규칙)
CREATE TABLE product_dressings (
  product_id     VARCHAR(80) NOT NULL,
  product_type   VARCHAR(10) GENERATED ALWAYS AS ('salad') STORED,
  dressing_id    VARCHAR(80) NOT NULL,
  dressing_type  VARCHAR(10) GENERATED ALWAYS AS ('dressing') STORED,
  is_default     BOOLEAN     NOT NULL DEFAULT FALSE,
  sort_order     INTEGER     NOT NULL,
  PRIMARY KEY (product_id, dressing_id),
  FOREIGN KEY (product_id, product_type)   REFERENCES products (id, type) ON DELETE CASCADE,
  FOREIGN KEY (dressing_id, dressing_type) REFERENCES products (id, type) ON DELETE CASCADE
);
-- 메뉴마다 기본 드레싱은 하나까지
CREATE UNIQUE INDEX uq_product_dressings_default ON product_dressings (product_id) WHERE is_default;

-- 메뉴의 실제 판매 상태. 저장하지 않고 재료 상태에서 계산한다 (저장하면 서로 어긋날 수 있다)
--   hidden  : 메뉴가 숨김·삭제
--   soldout : 메뉴가 품절이거나, 필수 재료 중 하나라도 품절·숨김·삭제
--   active  : 그 외
CREATE VIEW product_availability AS
SELECT
  p.id           AS product_id,
  p.customer_id,
  CASE
    WHEN p.deleted OR p.status = 'hidden'                 THEN 'hidden'
    WHEN p.status = 'soldout' OR cardinality(r.names) > 0 THEN 'soldout'
    ELSE 'active'
  END            AS effective_status,
  r.names        AS soldout_ingredients     -- 품절 이유로 화면에 보여줄 재료 이름
FROM products p
LEFT JOIN LATERAL (
  SELECT COALESCE(array_agg(i.name ORDER BY pi.position), ARRAY[]::text[]) AS names
  FROM product_ingredients pi
  JOIN ingredients i ON i.id = pi.ingredient_id
  WHERE pi.product_id = p.id AND pi.is_required AND (i.deleted OR i.status <> 'active')
) r ON TRUE
WHERE p.type = 'salad';

-- 내 취향 찾기 선택지. 품절 재료는 목록에 남기되 available = false (선택 불가)
CREATE VIEW bowl_match_ingredients AS
SELECT i.*, (i.status = 'active') AS available
FROM ingredients i
WHERE i.in_bowl_match AND NOT i.deleted AND i.status <> 'hidden';

-- ─────────────────────────────────────────────────────────────
-- 주문·인증 (정민님 백엔드 설계안 PR #45 의 Order·OrderItem·OrderStatusHistory·AdminUser·Session)
-- ─────────────────────────────────────────────────────────────

-- 관리자 계정. 비밀번호는 해시만 저장한다 (해시 계산은 앱에서)
CREATE TABLE admin_users (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  login_id       VARCHAR(50)  NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  disabled       BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 세션: 관리자 또는 비회원 방문자. 브라우저 쿠키에는 원본 토큰, DB 에는 토큰의 해시만 저장한다
CREATE TABLE sessions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash     VARCHAR(64) NOT NULL UNIQUE,
  kind           VARCHAR(10) NOT NULL CHECK (kind IN ('admin', 'guest')),
  admin_user_id  UUID        REFERENCES admin_users (id) ON DELETE CASCADE,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 관리자 세션에만 관리자 계정이 있다
  CONSTRAINT chk_session_admin CHECK ((kind = 'admin') = (admin_user_id IS NOT NULL))
);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- 주문. 금액은 원 단위 BIGINT. 접수 후 상품 가격이 바뀌어도 주문 금액은 그대로 (order_items 스냅샷)
CREATE TABLE orders (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_session_id UUID         NOT NULL,            -- 주문한 비회원 세션. 세션이 지워져도 주문은 남기므로 외래키는 걸지 않는다
  status              VARCHAR(10)  NOT NULL DEFAULT 'received'
                        CHECK (status IN ('received', 'confirmed', 'preparing', 'delivering', 'completed', 'canceled')),
  version             INTEGER      NOT NULL DEFAULT 1 CHECK (version >= 1),   -- 동시에 바꿀 때 덮어쓰기 방지
  orderer_name        VARCHAR(50)  NOT NULL,
  phone               VARCHAR(30)  NOT NULL,
  address             VARCHAR(300) NOT NULL,
  address_detail      VARCHAR(200) NOT NULL DEFAULT '',
  desired_start_at    TIMESTAMPTZ  NOT NULL,            -- UTC 배송 시작 시각. 화면은 KST로 표시
  desired_end_at      TIMESTAMPTZ  NOT NULL,            -- UTC 배송 종료 시각
  subtotal            BIGINT       NOT NULL CHECK (subtotal >= 0),
  delivery_fee        BIGINT       NOT NULL CHECK (delivery_fee >= 0),
  total               BIGINT       NOT NULL,
  request_key         VARCHAR(80)  NOT NULL,            -- 재전송 식별키 (Idempotency-Key)
  request_hash        VARCHAR(64)  NOT NULL,            -- 같은 키로 다른 내용을 보내면 충돌을 알리기 위한 요청 내용 해시
  cancel_reason       VARCHAR(200),
  canceled_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT chk_order_total   CHECK (total = subtotal + delivery_fee),
  CONSTRAINT chk_order_window  CHECK (desired_end_at = desired_start_at + INTERVAL '1 hour'),
  CONSTRAINT chk_order_cancel  CHECK ((status = 'canceled') = (canceled_at IS NOT NULL)),
  -- 같은 방문자가 같은 키로 다시 보내도 주문은 한 건
  CONSTRAINT uq_order_request  UNIQUE (customer_session_id, request_key)
);
-- 관리자 목록: 상태별 최신순 + 다음 쪽(마지막으로 본 주문 기준)
CREATE INDEX idx_orders_list ON orders (status, created_at DESC, id DESC);
CREATE INDEX idx_orders_session ON orders (customer_session_id, created_at DESC);

-- 주문 항목: 주문 당시의 상품명·옵션·단가를 복사해서 저장한다 (이후 상품이 바뀌거나 지워져도 주문 내역은 그대로)
CREATE TABLE order_items (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    UUID        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id  VARCHAR(80) REFERENCES products (id) ON DELETE SET NULL,   -- 참고용. 상품이 지워져도 항목은 남는다
  name        VARCHAR(80) NOT NULL,                  -- 주문 당시 상품명
  options     JSONB       NOT NULL DEFAULT '{}'::jsonb,   -- 드레싱·음료·재료 선택 내역
  unit_price  BIGINT      NOT NULL CHECK (unit_price >= 0),   -- 옵션을 포함한 1개 가격
  quantity    INTEGER     NOT NULL CHECK (quantity BETWEEN 1 AND 99)
);
CREATE INDEX idx_order_items_order ON order_items (order_id);

-- 상태 변경 이력: 누가 언제 무엇에서 무엇으로 바꿨는가
CREATE TABLE order_status_history (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id       UUID        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  from_status    VARCHAR(10),                          -- 처음 접수할 때는 NULL
  to_status      VARCHAR(10) NOT NULL CHECK (to_status IN ('received', 'confirmed', 'preparing', 'delivering', 'completed', 'canceled')),
  changed_by     VARCHAR(10) NOT NULL CHECK (changed_by IN ('customer', 'admin', 'system')),
  admin_user_id  UUID        REFERENCES admin_users (id) ON DELETE SET NULL,
  reason         VARCHAR(200),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_history_order ON order_status_history (order_id, created_at);

-- 허용된 상태 순서만 DB 에서도 한 번 더 막는다 (서비스 코드가 실수해도 잘못된 상태가 저장되지 않게)
--   접수 → 확인 → 준비 중 → 배달 중 → 완료, 취소는 접수·확인에서만, 완료·취소는 더 바꿀 수 없다
CREATE FUNCTION enforce_order_status_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF (OLD.status, NEW.status) IN (
       ('received', 'confirmed'), ('confirmed', 'preparing'), ('preparing', 'delivering'), ('delivering', 'completed'),
       ('received', 'canceled'),  ('confirmed', 'canceled')) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '허용되지 않은 주문 상태 변경: % → %', OLD.status, NEW.status USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_status_transition
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION enforce_order_status_transition();

-- 0002_catalog_persistence
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

-- 0003_allergen_text
-- The catalog accepts up to 400 characters of allergen text.
ALTER TABLE allergens ALTER COLUMN name TYPE VARCHAR(400);

-- Keep the ordered identifier after the catalog FK is set to NULL.
ALTER TABLE order_items ADD COLUMN original_product_id VARCHAR(80);
UPDATE order_items SET original_product_id = product_id;

-- 0004_app_settings
-- 기본 데이터 중 배너·운영시간·영양정보·가격 정책은 SQL로 초기화한다.
CREATE TABLE app_settings (
  key VARCHAR(80) PRIMARY KEY CHECK (key ~ '^[a-z_]+$'),
  value JSONB NOT NULL CHECK (jsonb_typeof(value) IN ('object', 'array')),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMIT;
