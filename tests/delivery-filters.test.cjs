/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
require("./register-typescript.cjs");
const {
  deliveryDateOptions,
  deliveryGroupLabel,
  filterDeliveryOrders,
  groupDeliveryOrders,
} = require("../features/admin/delivery-filters.ts");

const order = (id, desiredDate, desiredSlot, status, extra = {}) => ({
  id,
  status,
  ordererName: "김철수",
  phone: "010-1111-2222",
  address: "서울 중구",
  addressDetail: "101호",
  desiredDate,
  desiredSlot,
  createdAt: "2026-10-01T00:00:00Z",
  total: "10000",
  items: [{ name: "레몬 치킨 아보카도", options: "", quantity: 1 }],
  ...extra,
});
const orders = [
  order("a", "2026-10-13", "12:00–13:00", "received"),
  order("b", "2026-10-13", "13:00–14:00", "completed", { ordererName: "이영희" }),
  order("c", "2026-11-02", "12:00–13:00", "received", { address: "부산 해운대" }),
];
const all = { status: "all", query: "", month: "", day: "", hour: "" };
const ids = (list) => list.map((o) => o.id);

test("delivery filters combine status, search, month, day and hour", () => {
  assert.deepEqual(ids(filterDeliveryOrders(orders, all)), ["a", "b", "c"]);
  assert.deepEqual(ids(filterDeliveryOrders(orders, { ...all, status: "received" })), ["a", "c"]);
  assert.deepEqual(ids(filterDeliveryOrders(orders, { ...all, month: "2026-10" })), ["a", "b"]);
  assert.deepEqual(ids(filterDeliveryOrders(orders, { ...all, day: "2026-10-13", hour: "13" })), ["b"]);
  assert.deepEqual(ids(filterDeliveryOrders(orders, { ...all, query: " 해운대 " })), ["c"]);
  assert.deepEqual(ids(filterDeliveryOrders(orders, { ...all, query: "이영희", status: "received" })), []);
  assert.deepEqual(ids(filterDeliveryOrders(orders, { ...all, query: "아보카도" })), ["a", "b", "c"]);
});

test("delivery orders group by month or day, newest delivery date first", () => {
  assert.deepEqual(
    groupDeliveryOrders(orders, "day").map(([key, rows]) => [key, ids(rows)]),
    [
      ["2026-11-02", ["c"]],
      ["2026-10-13", ["a", "b"]],
    ],
  );
  assert.deepEqual(
    groupDeliveryOrders(orders, "month").map(([key, rows]) => [key, ids(rows)]),
    [
      ["2026-11", ["c"]],
      ["2026-10", ["a", "b"]],
    ],
  );
});

test("delivery date options follow the selected month and labels are Korean", () => {
  assert.deepEqual(deliveryDateOptions(orders, ""), {
    months: ["2026-11", "2026-10"],
    days: ["2026-11-02", "2026-10-13"],
  });
  assert.deepEqual(deliveryDateOptions(orders, "2026-10").days, ["2026-10-13"]);
  assert.equal(deliveryGroupLabel("2026-10-03"), "2026년 10월 3일");
  assert.equal(deliveryGroupLabel("2026-10"), "2026년 10월");
});

test("delivery orders paginate eight per page and clamp the page number", () => {
  const { paginateDeliveryOrders } = require("../features/admin/delivery-filters.ts");
  const list = Array.from({ length: 19 }, (_, i) => i);
  assert.deepEqual(paginateDeliveryOrders(list, 1), { items: list.slice(0, 8), page: 1, pageCount: 3 });
  assert.deepEqual(paginateDeliveryOrders(list, 3).items, [16, 17, 18]);
  assert.equal(paginateDeliveryOrders(list, 9).page, 3);
  assert.equal(paginateDeliveryOrders(list, 0).page, 1);
  assert.deepEqual(paginateDeliveryOrders([], 1), { items: [], page: 1, pageCount: 1 });
});
