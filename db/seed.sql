-- leaf & bowl 실제 기본 데이터. 이 파일이 db:seed의 실행 원본이다.
-- 먼저 npm run db:migrate로 모든 migration을 적용한다.
-- psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/seed.sql
-- 기존 카탈로그·설정·주문은 보존하며, 신규 DB에서는 전체를 한 트랜잭션으로 만든다.
BEGIN;
SET LOCAL search_path = public;
SET LOCAL lock_timeout = '5s';
DO $seed$
BEGIN
  PERFORM pg_advisory_xact_lock(910000);

  -- 앱 공통 설정. 기존 설정 값은 재실행으로 덮어쓰지 않는다.
  INSERT INTO app_settings (key, value) VALUES
    ('hero_slides', '[{"eyebrow":"FRESH BOWL, FRESH DAY","title":["좋은 하루는,","좋은 한 그릇에서."],"body":["신선한 재료와 기분 좋은 조합.","오늘의 나를 위한 샐러드를 만나보세요."],"cta":"오늘의 샐러드 고르기","href":"/menu","src":"/images/hero-cutout.png","alt":"레몬과 아보카도를 곁들인 구운 치킨 샐러드","noteEn":"LEMON CHICKEN BOWL","noteKo":"레몬 치킨 아보카도","sticker":["fresh","feels good."],"bowl":[50,50.5,44.4,39]},{"eyebrow":"PROTEIN BOWL, STRONG DAY","title":["든든한 한 끼도,","가볍게 한 그릇."],"body":["부드럽게 구운 연어와 잘 익은 아보카도.","단백질 29g으로 오후까지 든든하게."],"cta":"연어 아보카도 보기","href":"/product/1","src":"/images/salad-01-cutout.png","alt":"구운 연어와 아보카도, 오이를 담은 샐러드","noteEn":"SALMON AVOCADO BOWL","noteKo":"연어 아보카도","sticker":["strong","stays light."],"bowl":[50,50,43.7,43.7]},{"eyebrow":"PLANT BOWL, GREEN DAY","title":["초록으로 채운,","가벼운 하루."],"body":["고소한 구운 두부와 알알이 퀴노아.","식물성 재료만으로도 충분히 맛있게."],"cta":"두부 퀴노아 보기","href":"/product/3","src":"/images/salad-03-cutout.png","alt":"구운 두부와 퀴노아, 에다마메를 담은 샐러드","noteEn":"TOFU QUINOA BOWL","noteKo":"두부 퀴노아","sticker":["green","tastes good."],"bowl":[50,49.5,41.7,41.7]}]'::jsonb),
    ('delivery_hours', '{"days":"매일","open":10,"close":21}'::jsonb),
    ('pricing_policy', '{"deliveryFee":3000,"minDeliveryOrder":15000,"freeDeliveryFrom":30000,"baseBowlPrice":6500}'::jsonb),
    ('nutrition', '{"0":{"kcal":430,"protein":32,"weight":330},"1":{"kcal":480,"protein":29,"weight":320},"2":{"kcal":290,"protein":22,"weight":310},"3":{"kcal":360,"protein":21,"weight":320},"4":{"kcal":280,"protein":10,"weight":280},"5":{"kcal":450,"protein":34,"weight":320},"6":{"kcal":300,"protein":24,"weight":300},"7":{"kcal":410,"protein":31,"weight":300},"8":{"kcal":340,"protein":11,"weight":310},"9":{"kcal":330,"protein":14,"weight":280},"10":{"kcal":350,"protein":13,"weight":300},"11":{"kcal":470,"protein":31,"weight":340}}'::jsonb),
    ('option_kcal', '{"dressing-0":120,"dressing-1":60,"dressing-2":140,"dressing-3":150,"dressing-4":0,"drink-0":10,"drink-1":110,"drink-2":100,"drink-3":70}'::jsonb),
    ('catalog_config', '{"categoryAliases":{"든든한 단백질":"protein","플랜트 베이스":"vegan","새로운 조합":"new","기타":"other"},"allergenOrder":["닭고기","연어","새우","대두","우유","쇠고기","참치","밀","계란","생선","토마토"],"allergenOptions":["알류","우유","메밀","땅콩","대두","밀","고등어","게","새우","돼지고기","복숭아","토마토","아황산류","호두","닭고기","쇠고기","오징어","조개류","잣"],"ingredientCategories":["채소 베이스","단백질","채소 & 과일","토핑"],"originCountries":["국내산","미국산","중국산","호주산","브라질산","베트남산","노르웨이산","페루산","멕시코산","혼합"],"bowlRecommendations":{"burrata":9,"salmon":1,"shrimp":2,"tofu":3,"chicken":0,"chickpea":10,"mushroom":8},"deliveryRequestPresets":["문 앞에 놔주세요","경비실에 맡겨주세요","배송 전 연락해주세요","직접 받을게요"]}'::jsonb),
    ('ingredient_emojis', '{"romaine":"🥬","kale":"🥬","chicken":"🍗","salmon":"🐟","shrimp":"🍤","tofu":"🧊","chickpea":"🫘","avocado":"🥑","tomato":"🍅","cucumber":"🥒","mango":"🥭","corn":"🌽","mushroom":"🍄","burrata":"🧀","quinoa":"🌾","crouton":"🥖","nuts":"🥜","olive":"🫒"}'::jsonb)
  ON CONFLICT (key) DO NOTHING;

  IF EXISTS (SELECT 1 FROM catalog_meta WHERE id = 1) THEN
    RAISE NOTICE '기존 카탈로그를 보존했습니다.';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM products) OR EXISTS (SELECT 1 FROM ingredients)
     OR EXISTS (SELECT 1 FROM option_groups) OR EXISTS (SELECT 1 FROM reviews)
     OR EXISTS (SELECT 1 FROM orders) OR EXISTS (SELECT 1 FROM categories)
     OR EXISTS (SELECT 1 FROM site_content) OR EXISTS (SELECT 1 FROM store_location)
     OR EXISTS (SELECT 1 FROM season_pages) OR EXISTS (SELECT 1 FROM deleted_review_ids)
     OR EXISTS (SELECT 1 FROM catalog_imports) THEN
    RAISE EXCEPTION '메타데이터 없는 기존 앱 데이터가 있습니다. 초기화를 중단합니다.';
  END IF;

  -- 분류 4개
  INSERT INTO categories (name, sort_order) VALUES
    ('든든한 단백질', 0),
    ('플랜트 베이스', 1),
    ('새로운 조합', 2),
    ('기타', 3);

  -- 상품 21개: 샐러드 12, 음료 4, 드레싱 5
  INSERT INTO products (id, customer_id, type, name, name_en, price, description, ingredients, category, status, badge, image, allergens_text, is_new, deleted, sort_order) VALUES
    ('salad-0', 0, 'salad', '레몬 치킨 아보카도', 'Lemon chicken avocado', 10900, '그릴 치킨, 잘 익은 아보카도, 상큼한 레몬의 조합', '로메인 · 치킨 · 아보카도 · 퀴노아 · 토마토', '든든한 단백질', 'active', 'BEST', '/images/salad-00-cutout.png', '닭고기, 토마토', NULL, FALSE, 0),
    ('salad-1', 1, 'salad', '연어 아보카도', 'Salmon avocado', 13900, '부드러운 구운 연어와 아보카도의 든든한 한 끼', '로메인 · 연어 · 아보카도 · 오이', '든든한 단백질', 'active', 'BEST', '/images/salad-01-cutout.png', '연어', NULL, FALSE, 1),
    ('salad-2', 2, 'salad', '쉬림프 망고', 'Shrimp mango', 11900, '탱글한 새우와 달콤한 망고의 산뜻한 만남', '로메인 · 새우 · 망고 · 방울토마토', '든든한 단백질', 'active', 'BEST', '/images/salad-02-cutout.png', '새우, 토마토', NULL, FALSE, 2),
    ('salad-3', 3, 'salad', '두부 퀴노아', 'Tofu quinoa', 9900, '고소한 구운 두부에 알알이 채운 퀴노아', '두부 · 퀴노아 · 양배추 · 에다마메', '플랜트 베이스', 'active', 'PLANT', '/images/salad-03-cutout.png', '대두', NULL, FALSE, 3),
    ('salad-4', 4, 'salad', '그릭 페타', 'Greek feta', 10900, '페타 치즈와 올리브, 토마토로 담은 지중해', '페타 · 토마토 · 오이 · 올리브', '기타', 'active', '', '/images/salad-04-cutout.png', '우유, 토마토', NULL, FALSE, 4),
    ('salad-5', 5, 'salad', '스테이크 케일', 'Steak kale', 14900, '풍미 깊은 스테이크와 아삭한 케일', '스테이크 · 케일 · 파르메산 · 토마토', '든든한 단백질', 'active', '', '/images/salad-05-cutout.png', '쇠고기, 우유, 토마토', NULL, FALSE, 5),
    ('salad-6', 6, 'salad', '튜나 스위트콘', 'Tuna sweet corn', 9900, '담백한 참치와 달콤한 옥수수', '참치 · 옥수수 · 양파 · 오이', '든든한 단백질', 'active', '', '/images/salad-06-cutout.png', '참치', NULL, FALSE, 6),
    ('salad-7', 7, 'salad', '클래식 치킨 시저', 'Classic chicken Caesar', 10900, '바삭한 크루통과 치킨, 언제나 좋은 클래식', '치킨 · 로메인 · 크루통 · 파르메산', '든든한 단백질', 'active', '', '/images/salad-07-cutout.png', '닭고기, 우유, 밀, 계란, 생선', NULL, FALSE, 7),
    ('salad-8', 8, 'salad', '머쉬룸 그레인', 'Mushroom grain', 9900, '향긋한 구운 버섯과 고소한 통곡물', '버섯 · 현미 · 보리 · 루콜라', '플랜트 베이스', 'active', '', '/images/salad-08-cutout.png', '밀', NULL, FALSE, 8),
    ('salad-9', 9, 'salad', '부라타 가든', 'Burrata garden', 12900, '부드러운 부라타에 토마토와 루콜라를 더해', '부라타 · 토마토 · 루콜라 · 바질', '기타', 'active', 'PICK', '/images/salad-09-cutout.png', '우유, 토마토', NULL, FALSE, 9),
    ('salad-10', 10, 'salad', '지중해 칙피 크런치 세트', 'Chickpea crunch set', 13900, '유행하는 칙피 조합 + 오렌지 주스 1잔 포함', '병아리콩 · 오이 · 허브 · 토마토 · 오렌지 주스', '새로운 조합', 'active', 'NEW', '/images/salad-10-cutout.png', '토마토', TRUE, FALSE, 10),
    ('salad-11', 11, 'salad', '스파이시 멕시칸 세트', 'Spicy Mexican set', 14900, '매콤한 치킨 아보카도 조합 + 아메리카노 1잔 포함', '치킨 · 아보카도 · 블랙빈 · 옥수수 · 커피', '새로운 조합', 'active', 'NEW', '/images/salad-11-cutout.png', '닭고기', TRUE, FALSE, 11),
    ('drink-0', NULL, 'drink', '아이스 아메리카노', NULL, 3000, '', NULL, '음료', 'active', '', '/images/options/drink-americano.png', '', NULL, FALSE, 12),
    ('drink-1', NULL, 'drink', '오렌지 주스', NULL, 4000, '', NULL, '음료', 'active', '', '/images/options/drink-orange.png', '', NULL, FALSE, 13),
    ('drink-2', NULL, 'drink', '사과 주스', NULL, 4000, '', NULL, '음료', 'active', '', '/images/options/drink-apple.png', '', NULL, FALSE, 14),
    ('drink-3', NULL, 'drink', '케일 그린 주스', NULL, 4500, '', NULL, '음료', 'active', '', '/images/options/drink-kale.png', '', NULL, FALSE, 15),
    ('dressing-0', NULL, 'dressing', '레몬 올리브', NULL, 0, '', NULL, '드레싱', 'active', '', '/images/options/dressing-lemon-olive.png', '', NULL, FALSE, 16),
    ('dressing-1', NULL, 'dressing', '발사믹', NULL, 0, '', NULL, '드레싱', 'active', '', '/images/options/dressing-balsamic.png', '', NULL, FALSE, 17),
    ('dressing-2', NULL, 'dressing', '참깨', NULL, 0, '', NULL, '드레싱', 'active', '', '/images/options/dressing-sesame.png', '대두, 밀, 참깨', NULL, FALSE, 18),
    ('dressing-3', NULL, 'dressing', '시저', NULL, 0, '', NULL, '드레싱', 'active', '', '/images/options/dressing-caesar.png', '우유, 계란, 생선', NULL, FALSE, 19),
    ('dressing-4', NULL, 'dressing', '드레싱 없이', NULL, 0, '', NULL, '드레싱', 'active', '', '/images/options/dressing-none.png', '', NULL, FALSE, 20);

  -- 옵션 그룹과 상품별 선택 순서
  INSERT INTO option_groups (id, name, required, multiple, source, deleted, sort_order) VALUES
    ('dressing', '드레싱 선택', TRUE, FALSE, 'dressings', FALSE, 0),
    ('drinks', '음료 추가', FALSE, TRUE, 'drinks', FALSE, 1);
  INSERT INTO product_option_groups (product_id, group_id, sort_order) VALUES
    ('salad-0', 'dressing', 0),
    ('salad-0', 'drinks', 1),
    ('salad-1', 'dressing', 0),
    ('salad-1', 'drinks', 1),
    ('salad-2', 'dressing', 0),
    ('salad-2', 'drinks', 1),
    ('salad-3', 'dressing', 0),
    ('salad-3', 'drinks', 1),
    ('salad-4', 'dressing', 0),
    ('salad-4', 'drinks', 1),
    ('salad-5', 'dressing', 0),
    ('salad-5', 'drinks', 1),
    ('salad-6', 'dressing', 0),
    ('salad-6', 'drinks', 1),
    ('salad-7', 'dressing', 0),
    ('salad-7', 'drinks', 1),
    ('salad-8', 'dressing', 0),
    ('salad-8', 'drinks', 1),
    ('salad-9', 'dressing', 0),
    ('salad-9', 'drinks', 1),
    ('salad-10', 'dressing', 0),
    ('salad-10', 'drinks', 1),
    ('salad-11', 'dressing', 0),
    ('salad-11', 'drinks', 1);

  -- 내 취향 찾기 재료 18개
  INSERT INTO ingredients (id, name, name_en, price, stage, color, description, image, category, status, deleted, in_bowl_match, allergens_text, origin, origin_detail, sort_order) VALUES
    ('romaine', '아삭한 로메인', 'Crisp romaine', 0, 'GREENS', '#e9f2e8', '가볍고 산뜻한 시작, 초록의 기본.', '/images/ingredients/romaine.png', '채소 베이스', 'active', FALSE, TRUE, '', NULL, NULL, 0),
    ('kale', '싱그러운 케일', 'Fresh kale', 0, 'GREENS', '#e4efeb', '진한 초록빛, 씹을수록 풍성한 매력.', '/images/ingredients/kale.png', '채소 베이스', 'active', FALSE, TRUE, '', NULL, NULL, 1),
    ('chicken', '그릴 치킨', 'Grilled chicken', 2000, 'PROTEIN', '#f5ecdf', '노릇하게 구워낸 든든한 단백질.', '/images/ingredients/chicken.png', '단백질', 'active', FALSE, TRUE, '닭고기', NULL, NULL, 2),
    ('salmon', '구운 연어', 'Roasted salmon', 3500, 'PROTEIN', '#f8eae5', '입안에서 부드럽게, 풍미는 깊게.', '/images/ingredients/salmon.png', '단백질', 'active', FALSE, TRUE, '연어', NULL, NULL, 3),
    ('shrimp', '탱글한 새우', 'Juicy shrimp', 2500, 'PROTEIN', '#f5e9ea', '한 입마다 톡, 기분 좋은 식감.', '/images/ingredients/shrimp.png', '단백질', 'active', FALSE, TRUE, '새우', NULL, NULL, 4),
    ('tofu', '고소한 두부', 'Golden tofu', 1500, 'PROTEIN', '#f2f0e6', '플랜트 베이스도 충분히 든든하게.', '/images/ingredients/tofu.png', '단백질', 'active', FALSE, TRUE, '대두', NULL, NULL, 5),
    ('chickpea', '병아리콩', 'Lovely chickpeas', 1000, 'PROTEIN', '#f1ecdf', '작지만 알찬, 고소한 콩의 힘.', '/images/ingredients/chickpea.png', '단백질', 'active', FALSE, TRUE, '', NULL, NULL, 6),
    ('avocado', '크리미 아보카도', 'Creamy avocado', 1500, 'VEGGIES', '#eaf0d9', '부드러움 한 스푼, 초록빛으로.', '/images/ingredients/avocado.png', '채소 & 과일', 'active', FALSE, TRUE, '', NULL, NULL, 7),
    ('tomato', '방울토마토', 'Cherry tomatoes', 500, 'VEGGIES', '#f7e7e5', '톡 터지는 새콤달콤함이 필요할 때.', '/images/ingredients/tomato.png', '채소 & 과일', 'active', FALSE, TRUE, '토마토', NULL, NULL, 8),
    ('cucumber', '시원한 오이', 'Cool cucumber', 500, 'VEGGIES', '#e8f1e3', '아삭아삭, 한 그릇의 산뜻한 쉼표.', '/images/ingredients/cucumber.png', '채소 & 과일', 'active', FALSE, TRUE, '', NULL, NULL, 9),
    ('mango', '달콤한 망고', 'Sweet mango', 1000, 'VEGGIES', '#faf0d8', '평범한 한 끼에 작은 열대의 순간.', '/images/ingredients/mango.png', '채소 & 과일', 'active', FALSE, TRUE, '', NULL, NULL, 10),
    ('corn', '스위트콘', 'Sweet corn', 500, 'VEGGIES', '#f6f2d9', '알알이 달콤한 노란 포인트.', '/images/ingredients/corn.png', '채소 & 과일', 'active', FALSE, TRUE, '', NULL, NULL, 11),
    ('mushroom', '구운 버섯', 'Roasted mushroom', 1000, 'VEGGIES', '#eee8e2', '은은한 향으로 채우는 깊은 풍미.', '/images/ingredients/mushroom.png', '채소 & 과일', 'active', FALSE, TRUE, '', NULL, NULL, 12),
    ('burrata', '부드러운 부라타', 'Soft burrata', 2500, 'TOPPINGS', '#f3efdf', '하트 한 번에, 크리미한 행복.', '/images/ingredients/burrata.png', '토핑', 'active', FALSE, TRUE, '우유', NULL, NULL, 13),
    ('quinoa', '고소한 퀴노아', 'Nutty quinoa', 1000, 'TOPPINGS', '#f0eadc', '알알이 더하는 든든한 식감.', '/images/ingredients/quinoa.png', '토핑', 'active', FALSE, TRUE, '', NULL, NULL, 14),
    ('crouton', '바삭한 크루통', 'Crunchy croutons', 500, 'TOPPINGS', '#f4eadb', '마지막 한 입까지 경쾌하게.', '/images/ingredients/crouton.png', '토핑', 'active', FALSE, TRUE, '밀', NULL, NULL, 15),
    ('nuts', '믹스 넛츠', 'Mixed nuts', 1000, 'TOPPINGS', '#efe6dc', '고소함과 바삭함을 한 번에.', '/images/ingredients/nuts.png', '토핑', 'active', FALSE, TRUE, '땅콩, 호두, 아몬드', NULL, NULL, 16),
    ('olive', '블랙 올리브', 'Black olives', 500, 'TOPPINGS', '#e7ece0', '은근한 풍미로 완성하는 나의 취향.', '/images/ingredients/olive.png', '토핑', 'active', FALSE, TRUE, '', NULL, NULL, 17);

  -- 알레르기 문구와 관계를 함께 보존한다.
  INSERT INTO allergens (name) VALUES
    ('닭고기'),
    ('토마토'),
    ('연어'),
    ('새우'),
    ('대두'),
    ('우유'),
    ('쇠고기'),
    ('참치'),
    ('밀'),
    ('계란'),
    ('생선'),
    ('참깨'),
    ('땅콩'),
    ('호두'),
    ('아몬드')
  ON CONFLICT (name) DO NOTHING;
  INSERT INTO product_allergens (product_id, allergen_id, position)
  SELECT v.id, a.id, v.position FROM (VALUES
    ('salad-0', '닭고기', 0),
    ('salad-0', '토마토', 1),
    ('salad-1', '연어', 0),
    ('salad-2', '새우', 0),
    ('salad-2', '토마토', 1),
    ('salad-3', '대두', 0),
    ('salad-4', '우유', 0),
    ('salad-4', '토마토', 1),
    ('salad-5', '쇠고기', 0),
    ('salad-5', '우유', 1),
    ('salad-5', '토마토', 2),
    ('salad-6', '참치', 0),
    ('salad-7', '닭고기', 0),
    ('salad-7', '우유', 1),
    ('salad-7', '밀', 2),
    ('salad-7', '계란', 3),
    ('salad-7', '생선', 4),
    ('salad-8', '밀', 0),
    ('salad-9', '우유', 0),
    ('salad-9', '토마토', 1),
    ('salad-10', '토마토', 0),
    ('salad-11', '닭고기', 0),
    ('dressing-2', '대두', 0),
    ('dressing-2', '밀', 1),
    ('dressing-2', '참깨', 2),
    ('dressing-3', '우유', 0),
    ('dressing-3', '계란', 1),
    ('dressing-3', '생선', 2)) AS v(id, name, position) JOIN allergens a ON a.name = v.name;
  INSERT INTO ingredient_allergens (ingredient_id, allergen_id, position)
  SELECT v.id, a.id, v.position FROM (VALUES
    ('chicken', '닭고기', 0),
    ('salmon', '연어', 0),
    ('shrimp', '새우', 0),
    ('tofu', '대두', 0),
    ('tomato', '토마토', 0),
    ('burrata', '우유', 0),
    ('crouton', '밀', 0),
    ('nuts', '땅콩', 0),
    ('nuts', '호두', 1),
    ('nuts', '아몬드', 2)) AS v(id, name, position) JOIN allergens a ON a.name = v.name;

  -- 예시 리뷰 48개. UTC 시각·수령 방식·원래 상품 ID를 유지한다.
  INSERT INTO reviews (id, product_id, original_product_id, is_sample, title, body, rating, menu, author, date_label, created_at, deleted, via, sort_order) VALUES
    ('s0-0', 'salad-0', 'salad-0', TRUE, '점심이 기다려지는 조합이에요.', '치킨과 아보카도가 잘 어울려요. 드레싱을 따로 골라 제 입맛에 맞출 수 있어서 좋았어요.', 5, '레몬 치킨 아보카도', '김**', '2026.10.05', '2026-10-05T03:00:00.000Z', FALSE, 'pickup', 0),
    ('s0-1', 'salad-0', 'salad-0', TRUE, '레몬 향이 산뜻해요', '레몬이 들어가서 느끼하지 않고 끝맛이 깔끔해요. 치킨도 퍽퍽하지 않았어요.', 5, '레몬 치킨 아보카도', '정**', '2026.10.03', '2026-10-03T03:00:00.000Z', FALSE, 'delivery', 1),
    ('s0-2', 'salad-0', 'salad-0', TRUE, '양이 딱 좋아요', '점심으로 먹기에 부담 없는 양이에요. 퀴노아 덕분에 포만감도 괜찮아요.', 4, '레몬 치킨 아보카도', '한**', '2026.09.30', '2026-09-30T03:00:00.000Z', FALSE, 'pickup', 2),
    ('s0-3', 'salad-0', 'salad-0', TRUE, '재구매 의사 있어요', '아보카도가 잘 익어 있었어요. 다음엔 발사믹 드레싱으로 먹어보려고요.', 4, '레몬 치킨 아보카도', '오**', '2026.09.27', '2026-09-27T03:00:00.000Z', FALSE, 'pickup', 3),
    ('s1-0', 'salad-1', 'salad-1', TRUE, '연어가 부드러워요', '비린 맛 없이 깔끔하고 아보카도랑 잘 어울려요. 가격이 조금 있지만 만족해요.', 5, '연어 아보카도', '윤**', '2026.10.06', '2026-10-06T03:00:00.000Z', FALSE, 'pickup', 4),
    ('s1-1', 'salad-1', 'salad-1', TRUE, '든든한 한 끼', '오이가 아삭해서 연어의 부드러움이 더 살아나요.', 5, '연어 아보카도', '서**', '2026.10.02', '2026-10-02T03:00:00.000Z', FALSE, 'delivery', 5),
    ('s1-2', 'salad-1', 'salad-1', TRUE, '시저 드레싱과 의외로 잘 맞아요', '연어에 시저는 처음이었는데 의외로 잘 어울렸어요.', 4, '연어 아보카도', '임**', '2026.09.29', '2026-09-29T03:00:00.000Z', FALSE, 'pickup', 6),
    ('s1-3', 'salad-1', 'salad-1', TRUE, '단백질을 챙기고 싶을 때', '한 그릇만 먹어도 든든해서 자주 찾게 돼요.', 5, '연어 아보카도', '장**', '2026.09.26', '2026-09-26T03:00:00.000Z', FALSE, 'pickup', 7),
    ('s2-0', 'salad-2', 'salad-2', TRUE, '망고가 달콤해요', '새우는 탱글하고 망고는 달콤해서 여름 느낌이에요. 가볍게 먹기 좋아요.', 5, '쉬림프 망고', '강**', '2026.10.06', '2026-10-06T03:00:00.000Z', FALSE, 'pickup', 8),
    ('s2-1', 'salad-2', 'salad-2', TRUE, '새우가 통통해요', '새우 크기가 적당했고 방울토마토가 상큼했어요. 드레싱은 레몬 올리브가 잘 맞아요.', 4, '쉬림프 망고', '조**', '2026.10.03', '2026-10-03T03:00:00.000Z', FALSE, 'delivery', 9),
    ('s2-2', 'salad-2', 'salad-2', TRUE, '상큼한 조합', '달콤함과 새콤함의 균형이 좋아요.', 5, '쉬림프 망고', '신**', '2026.09.30', '2026-09-30T03:00:00.000Z', FALSE, 'pickup', 10),
    ('s2-3', 'salad-2', 'salad-2', TRUE, '호불호는 있을 듯해요', '과일이 들어간 샐러드를 좋아하면 만족하겠지만 저는 조금 달게 느껴졌어요.', 3, '쉬림프 망고', '문**', '2026.09.25', '2026-09-25T03:00:00.000Z', FALSE, 'delivery', 11),
    ('s3-0', 'salad-3', 'salad-3', TRUE, '가볍지만 든든한 한 끼.', '두부와 퀴노아가 고소하고 채소도 아삭해요. 바쁜 날에도 부담 없이 먹기 좋은 메뉴예요.', 5, '두부 퀴노아', '이**', '2026.10.04', '2026-10-04T03:00:00.000Z', FALSE, 'delivery', 12),
    ('s3-1', 'salad-3', 'salad-3', TRUE, '담백해서 좋아요', '에다마메가 톡톡 씹혀서 재미있어요. 참깨 드레싱과 잘 맞아요.', 5, '두부 퀴노아', '백**', '2026.10.01', '2026-10-01T03:00:00.000Z', FALSE, 'pickup', 13),
    ('s3-2', 'salad-3', 'salad-3', TRUE, '속이 편안한 샐러드', '부담 없이 먹기 좋아요. 간이 약한 편이라 드레싱을 꼭 고르는 걸 추천해요.', 4, '두부 퀴노아', '노**', '2026.09.28', '2026-09-28T03:00:00.000Z', FALSE, 'pickup', 14),
    ('s3-3', 'salad-3', 'salad-3', TRUE, '식물성 메뉴로 만족', '고기가 없어도 심심하지 않았어요.', 4, '두부 퀴노아', '하**', '2026.09.24', '2026-09-24T03:00:00.000Z', FALSE, 'delivery', 15),
    ('s4-0', 'salad-4', 'salad-4', TRUE, '올리브가 매력적이에요', '페타의 짭짤함과 올리브가 잘 어울려요.', 5, '그릭 페타', '유**', '2026.10.05', '2026-10-05T03:00:00.000Z', FALSE, 'pickup', 16),
    ('s4-1', 'salad-4', 'salad-4', TRUE, '지중해 느낌', '오이와 토마토가 신선했어요. 페타가 조금 더 많으면 좋겠어요.', 4, '그릭 페타', '전**', '2026.10.02', '2026-10-02T03:00:00.000Z', FALSE, 'delivery', 17),
    ('s4-2', 'salad-4', 'salad-4', TRUE, '가볍게 한 접시', '레몬 올리브 드레싱을 추천해요. 와인이 생각나는 맛이에요.', 5, '그릭 페타', '홍**', '2026.09.29', '2026-09-29T03:00:00.000Z', FALSE, 'pickup', 18),
    ('s4-3', 'salad-4', 'salad-4', TRUE, '깔끔한 맛', '담백하고 깔끔해서 다른 메뉴와 나눠 먹기도 좋았어요.', 4, '그릭 페타', '곽**', '2026.09.26', '2026-09-26T03:00:00.000Z', FALSE, 'pickup', 19),
    ('s5-0', 'salad-5', 'salad-5', TRUE, '스테이크가 부드러워요', '고기가 부드럽고 케일과 파르메산이 잘 어울려요. 가격만큼 만족했어요.', 5, '스테이크 케일', '배**', '2026.10.06', '2026-10-06T03:00:00.000Z', FALSE, 'pickup', 20),
    ('s5-1', 'salad-5', 'salad-5', TRUE, '케일이 질기지 않아요', '케일을 싫어하는 편인데 먹기 편했어요.', 4, '스테이크 케일', '권**', '2026.10.03', '2026-10-03T03:00:00.000Z', FALSE, 'delivery', 21),
    ('s5-2', 'salad-5', 'salad-5', TRUE, '식사가 되는 샐러드', '든든해서 샐러드만으로도 한 끼가 돼요.', 5, '스테이크 케일', '송**', '2026.09.30', '2026-09-30T03:00:00.000Z', FALSE, 'pickup', 22),
    ('s5-3', 'salad-5', 'salad-5', TRUE, '조금 짰어요', '파르메산과 드레싱 때문인지 간이 센 편이라 드레싱 없이 먹었어요.', 3, '스테이크 케일', '안**', '2026.09.27', '2026-09-27T03:00:00.000Z', FALSE, 'pickup', 23),
    ('s6-0', 'salad-6', 'salad-6', TRUE, '부담 없는 가격', '참치와 옥수수 조합은 역시 실패가 없어요.', 4, '튜나 스위트콘', '남**', '2026.10.04', '2026-10-04T03:00:00.000Z', FALSE, 'pickup', 24),
    ('s6-1', 'salad-6', 'salad-6', TRUE, '아이도 잘 먹어요', '옥수수가 달콤해서 채소를 잘 안 먹는 아이도 먹었어요.', 5, '튜나 스위트콘', '심**', '2026.10.01', '2026-10-01T03:00:00.000Z', FALSE, 'delivery', 25),
    ('s6-2', 'salad-6', 'salad-6', TRUE, '담백해요', '양파가 아삭하고 참치가 짜지 않았어요.', 4, '튜나 스위트콘', '구**', '2026.09.28', '2026-09-28T03:00:00.000Z', FALSE, 'pickup', 26),
    ('s6-3', 'salad-6', 'salad-6', TRUE, '간단하게 먹기 좋아요', '바쁜 점심에 가볍게 먹기 딱 좋았어요.', 4, '튜나 스위트콘', '민**', '2026.09.25', '2026-09-25T03:00:00.000Z', FALSE, 'pickup', 27),
    ('s7-0', 'salad-7', 'salad-7', TRUE, '클래식은 역시', '크루통이 바삭하고 시저 드레싱이 진해요.', 5, '클래식 치킨 시저', '석**', '2026.10.05', '2026-10-05T03:00:00.000Z', FALSE, 'pickup', 28),
    ('s7-1', 'salad-7', 'salad-7', TRUE, '익숙한 맛', '처음 샐러드를 시켜보는 친구에게 추천했어요.', 4, '클래식 치킨 시저', '맹**', '2026.10.02', '2026-10-02T03:00:00.000Z', FALSE, 'delivery', 29),
    ('s7-2', 'salad-7', 'salad-7', TRUE, '치킨이 촉촉해요', '로메인이 신선하고 치킨도 퍽퍽하지 않아요.', 5, '클래식 치킨 시저', '도**', '2026.09.29', '2026-09-29T03:00:00.000Z', FALSE, 'pickup', 30),
    ('s7-3', 'salad-7', 'salad-7', TRUE, '크루통이 특히 좋아요', '바삭한 식감이 끝까지 유지돼서 좋았어요.', 4, '클래식 치킨 시저', '변**', '2026.09.26', '2026-09-26T03:00:00.000Z', FALSE, 'pickup', 31),
    ('s8-0', 'salad-8', 'salad-8', TRUE, '구운 버섯 향이 좋아요', '현미와 보리가 씹는 맛을 더해줘요. 루콜라 향도 은은해요.', 5, '머쉬룸 그레인', '채**', '2026.10.06', '2026-10-06T03:00:00.000Z', FALSE, 'pickup', 32),
    ('s8-1', 'salad-8', 'salad-8', TRUE, '담백하고 든든해요', '고기 없는 날 선택했는데 만족스러웠어요.', 4, '머쉬룸 그레인', '천**', '2026.10.03', '2026-10-03T03:00:00.000Z', FALSE, 'delivery', 33),
    ('s8-2', 'salad-8', 'salad-8', TRUE, '씹는 재미가 있어요', '곡물이 고슬고슬해서 오래 씹게 돼요.', 4, '머쉬룸 그레인', '방**', '2026.09.30', '2026-09-30T03:00:00.000Z', FALSE, 'pickup', 34),
    ('s8-3', 'salad-8', 'salad-8', TRUE, '같이 먹기 좋아요', '고기를 안 먹는 친구와 함께 먹었는데 둘 다 만족했어요.', 5, '머쉬룸 그레인', '마**', '2026.09.27', '2026-09-27T03:00:00.000Z', FALSE, 'pickup', 35),
    ('s9-0', 'salad-9', 'salad-9', TRUE, '부라타가 더한 작은 행복.', '부드러운 치즈와 산뜻한 토마토의 조합이 마음에 들어요. 다음에는 주스도 함께 추가해보려고요.', 4, '부라타 가든', '박**', '2026.10.02', '2026-10-02T03:00:00.000Z', FALSE, 'pickup', 36),
    ('s9-1', 'salad-9', 'salad-9', TRUE, '치즈가 부드러워요', '바질 향이 올라와서 기분 좋은 한 접시였어요.', 5, '부라타 가든', '차**', '2026.10.06', '2026-10-06T03:00:00.000Z', FALSE, 'delivery', 37),
    ('s9-2', 'salad-9', 'salad-9', TRUE, '이달의 발견', '토마토가 정말 달았어요. 발사믹 드레싱과 잘 맞아요.', 5, '부라타 가든', '표**', '2026.10.03', '2026-10-03T03:00:00.000Z', FALSE, 'pickup', 38),
    ('s9-3', 'salad-9', 'salad-9', TRUE, '가볍고 산뜻해요', '루콜라의 쌉싸름함이 부라타와 잘 어울려요.', 4, '부라타 가든', '주**', '2026.09.29', '2026-09-29T03:00:00.000Z', FALSE, 'pickup', 39),
    ('s10-0', 'salad-10', 'salad-10', TRUE, '주스까지 한 번에', '세트라 고르기 편하고 오렌지 주스가 상큼해요.', 5, '지중해 칙피 크런치 세트', '탁**', '2026.10.05', '2026-10-05T03:00:00.000Z', FALSE, 'pickup', 40),
    ('s10-1', 'salad-10', 'salad-10', TRUE, '병아리콩이 고소해요', '허브 향이 은은해서 새로운 느낌이에요.', 4, '지중해 칙피 크런치 세트', '봉**', '2026.10.02', '2026-10-02T03:00:00.000Z', FALSE, 'delivery', 41),
    ('s10-2', 'salad-10', 'salad-10', TRUE, '세트라 편해요', '음료가 포함이라 따로 주문하는 것보다 편했어요.', 5, '지중해 칙피 크런치 세트', '추**', '2026.09.30', '2026-09-30T03:00:00.000Z', FALSE, 'pickup', 42),
    ('s10-3', 'salad-10', 'salad-10', TRUE, '크런치한 식감', '바삭한 식감이 재미있어요. 양은 보통이에요.', 4, '지중해 칙피 크런치 세트', '길**', '2026.09.27', '2026-09-27T03:00:00.000Z', FALSE, 'pickup', 43),
    ('s11-0', 'salad-11', 'salad-11', TRUE, '매콤함이 딱 좋아요', '블랙빈과 옥수수가 들어가서 멕시칸 느낌이 나요. 아메리카노와 같이 먹기 좋아요.', 5, '스파이시 멕시칸 세트', '어**', '2026.10.06', '2026-10-06T03:00:00.000Z', FALSE, 'pickup', 44),
    ('s11-1', 'salad-11', 'salad-11', TRUE, '살짝 맵지만 맛있어요', '매운 걸 잘 못 먹는 편인데 먹을 만했어요.', 4, '스파이시 멕시칸 세트', '은**', '2026.10.03', '2026-10-03T03:00:00.000Z', FALSE, 'delivery', 45),
    ('s11-2', 'salad-11', 'salad-11', TRUE, '아보카도와 잘 어울려요', '매콤한 치킨과 부드러운 아보카도가 좋은 조합이에요.', 5, '스파이시 멕시칸 세트', '피**', '2026.09.29', '2026-09-29T03:00:00.000Z', FALSE, 'pickup', 46),
    ('s11-3', 'salad-11', 'salad-11', TRUE, '커피 포함이라 좋아요', '점심 한 끼와 커피까지 한 번에 해결돼요.', 4, '스파이시 멕시칸 세트', '빈**', '2026.09.26', '2026-09-26T03:00:00.000Z', FALSE, 'pickup', 47);

  -- 홈·시즌 스페셜 문구
  INSERT INTO site_content (id, hero_title, hero_description, season_title, season_description, season_image, season_product_id, season_visible) VALUES
    (1, '좋은 하루는, 좋은 한 그릇에서.', '신선한 재료와 기분 좋은 조합. 오늘의 나를 위한 샐러드를 만나보세요.', '조금 새로운 조합, 꽤 괜찮은 발견.', '크리미한 부라타와 산뜻한 토마토. 이달엔 가볍게, 지중해로 떠나볼까요?', '/images/salad-09-cutout.png', 'salad-9', TRUE);

  -- 기본 시즌 페이지·매장 위치·리뷰 이미지·음료 연결은 아직 없다.
  -- 관리자 비밀번호·세션·주문은 이 공통 시드에 만들지 않는다.
  INSERT INTO catalog_meta (id, revision, next_customer_id, has_season_pages) VALUES
    (1, 1, 12, FALSE);
END;
$seed$;
COMMIT;
