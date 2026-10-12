/* eslint-disable @typescript-eslint/no-require-imports */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const store = require("../application/catalog.ts");
const { customerSeed } = require("../seed/legacy/catalog.ts");
const api = require("../modules/catalog/customer-api.ts");
const routes = {
  list: require("../app/api/products/route.ts"),
  detail: require("../app/api/products/[id]/route.ts"),
  reviews: require("../app/api/products/[id]/reviews/route.ts"),
  home: require("../app/api/home/route.ts"),
};
const originalRead = store.readCatalog;
let catalog;
before(() => {
  store.readCatalog = async () => ({ catalog, revision: 1, updatedAt: new Date().toISOString() });
});
after(() => {
  store.readCatalog = originalRead;
});
const ctx = (id) => ({ params: Promise.resolve({ id }) });

const get = (url) => new Request("http://localhost" + url);

test("customer product APIs read the catalog and hide hidden or unknown menus", async () => {
  catalog = customerSeed();
  catalog.products[0].price = 18000;
  const list = await (await routes.list.GET(get("/api/products"))).json();
  assert.equal(list.items.find((p) => p.id === 0).price, 18000);
  assert.ok(list.categories.length > 0);
  const drinks = await (await routes.list.GET(get("/api/products?type=drink"))).json();
  assert.ok(drinks.items.every((p) => p.type === "drink" && p.id === null));
  assert.equal((await routes.list.GET(get("/api/products?type=soup"))).status, 400);
  assert.equal((await routes.list.GET(get("/api/products?category=등록되지 않은 분류"))).status, 400);

  const detail = await routes.detail.GET(get("/api/products/0"), ctx("0"));
  assert.equal(detail.status, 200);
  assert.equal(detail.headers.get("cache-control"), "no-store");
  assert.equal((await detail.json()).price, 18000);
  assert.equal((await routes.detail.GET(get("/api/products/abc"), ctx("abc"))).status, 404);

  catalog.products[0].status = "hidden";
  assert.equal((await routes.detail.GET(get("/api/products/0"), ctx("0"))).status, 404);
  assert.equal((await routes.reviews.GET(get("/api/products/0/reviews"), ctx("0"))).status, 404);
  const after = await (await routes.list.GET(get("/api/products"))).json();
  assert.equal(
    after.items.some((p) => p.id === 0),
    false,
  );
});

test("review and home APIs validate paging and return the page shape", async () => {
  catalog = customerSeed();
  assert.equal((await routes.reviews.GET(get("/api/products/0/reviews?size=51"), ctx("0"))).status, 400);
  const page = await (await routes.reviews.GET(get("/api/products/0/reviews?page=1&size=5"), ctx("0"))).json();
  assert.equal(page.page, 1);
  assert.equal(page.size, 5);
  assert.ok(page.items.length <= 5);
  const home = await (await routes.home.GET()).json();
  assert.ok(Array.isArray(home.best));
  assert.ok(home.latestReviews.length <= 3);
});

test("paging is bounded and review ordering compares actual times and filters hidden menu reviews", () => {
  const c = customerSeed();
  c.reviews = [
    {
      id: "later",
      productId: "salad-0",
      rating: 5,
      menu: "",
      author: "고객",
      title: "새 리뷰",
      body: "좋아요",
      date: "2026.10.10",
      createdAt: "2026-10-10T01:00:00Z",
      deleted: false,
    },
    {
      id: "earlier",
      productId: "salad-0",
      rating: 5,
      menu: "",
      author: "고객",
      title: "이전 리뷰",
      body: "좋아요",
      date: "2026.10.10",
      createdAt: "2026-10-10T09:00:00+09:00",
      deleted: false,
    },
  ];
  assert.equal(api.productReviews(c, c.products[0], 1, 10).items[0].id, "later");
  c.products[0].status = "hidden";
  assert.equal(api.home(c).latestReviews.length, 0);
  assert.equal(api.parsePaging(new URLSearchParams("page=" + "9".repeat(400))), null);
  assert.equal(api.parsePaging(new URLSearchParams("page=1.5")), null);
  assert.deepEqual(api.parsePaging(new URLSearchParams("page=2&size=5")), { page: 2, size: 5 });
});
