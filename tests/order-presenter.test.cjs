/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { adminListItemView, detailView } = require("../modules/orders/presenter.ts");
const order = (options) => ({
  id: "order-example",
  desiredStartAt: new Date("2026-10-12T12:00:00Z"),
  desiredEndAt: new Date("2026-10-12T13:00:00Z"),
  createdAt: new Date("2026-10-12T09:00:00Z"),
  items: [{ name: "샐러드", quantity: 1, options }],
});
test("old order options do not break admin or customer order responses", () => {
  for (const view of [adminListItemView, detailView]) {
    assert.equal(view(order({})).items[0].options, "");
    assert.equal(view(order(null)).items[0].options, "");
    assert.equal(
      view(order({ dressing: { name: "레몬" }, drinks: [{ name: "주스" }] })).items[0].options,
      "레몬 · 주스",
    );
    assert.equal(
      view(
        order({
          dressings: [{ name: "참깨" }, { name: "시저" }],
          dressing: { name: "예전 값" },
          ingredients: [{ name: "치킨" }],
          custom: [{ name: "추가" }],
        }),
      ).items[0].options,
      "참깨 · 시저 · 치킨 · 추가",
    );
  }
});
