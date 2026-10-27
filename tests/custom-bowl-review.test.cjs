/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./register-typescript.cjs");
const { addReview } = require("../modules/catalog/state.ts");
const { customerCatalog } = require("../modules/catalog/customer-view.ts");
const { customerSeed } = require("../seed/legacy/catalog.ts");
const { withDefaults } = require("./fixtures/settings.cjs");
const { CUSTOM_BOWL_PID, customBowlChoices, customBowlMenu } = require("../modules/reviews/model.ts");

const at = "2026-10-27T03:00:00.000Z";
const state = () => ({
  catalog: customerSeed(),
  revision: 1,
  updatedAt: at,
  nextCustomerId: 100,
  deletedReviewIds: [],
});

const review = (pid, id = "custom-review") => ({
  id,
  pid,
  author: "고**",
  stars: 4,
  title: "재료 조합 최고",
  text: "내가 고른 재료라 더 맛있었어요.",
  via: "delivery",
});

test("custom bowl menus keep the chosen ingredients within the 120-character menu column", () => {
  assert.equal(customBowlMenu([]), "내 취향 볼");
  assert.equal(customBowlMenu(["레몬 올리브", " 아삭한 로메인 "]), "내 취향 볼 (레몬 올리브, 아삭한 로메인)");
  assert.equal(customBowlChoices("내 취향 볼 (레몬 올리브, 아삭한 로메인)"), "레몬 올리브, 아삭한 로메인");
  assert.equal(customBowlChoices("내 취향 볼"), "");
  for (const menu of ["레몬 치킨 아보카도", "내 취향 볼 · 배달", "내 취향 볼 (닫히지 않음"]) {
    assert.equal(customBowlChoices(menu), null, menu);
  }
  const long = customBowlMenu(Array.from({ length: 40 }, (_, i) => "재료" + i));
  assert.equal([...long].length, 120);
  assert.match(long, /…\)$/);
  assert.ok(customBowlChoices(long).startsWith("재료0, 재료1"));
});

test("custom bowl reviews are stored without a product and shown apart from menu ratings", () => {
  const before = customerCatalog(withDefaults({ catalog: customerSeed(), revision: 1, updatedAt: at }));
  const menuReviews = before.reviews.filter((r) => r.pid === 0).length;

  assert.throws(
    () => addReview(state(), review(CUSTOM_BOWL_PID), at),
    (e) => e.status === 400,
  );
  assert.throws(
    () => addReview(state(), review(CUSTOM_BOWL_PID), at, "레몬 치킨 아보카도"),
    (e) => e.status === 400,
  );
  const next = addReview(state(), review(CUSTOM_BOWL_PID), at, "내 취향 볼 (아삭한 로메인, 탱글한 새우)");
  const stored = next.catalog.reviews[0];
  assert.equal(stored.productId, undefined);
  assert.equal(stored.menu, "내 취향 볼 (아삭한 로메인, 탱글한 새우)");

  const view = customerCatalog(withDefaults(next));
  const shown = view.reviews.find((r) => r.id === "custom-review");
  assert.equal(shown.pid, CUSTOM_BOWL_PID);
  assert.equal(shown.choices, "아삭한 로메인, 탱글한 새우");
  assert.equal(view.reviews.filter((r) => r.pid === 0).length, menuReviews);
  // 메뉴 리뷰는 그대로 상품에 연결되고 재료 문구가 없다
  const salad = customerCatalog(withDefaults(addReview(state(), review(0, "menu-review"), at)));
  const menuReview = salad.reviews.find((r) => r.id === "menu-review");
  assert.equal(menuReview.pid, 0);
  assert.equal(menuReview.choices, undefined);
});
