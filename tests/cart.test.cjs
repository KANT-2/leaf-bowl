/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
// Load the project's TypeScript domain modules without a second test toolchain.
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(
    this,
    request.startsWith("@/")
      ? path.join(__dirname, "..", request.slice(2))
      : request,
    ...args,
  );
};

const { customerSeed } = require("../lib/admin/customer-seed.ts");
const { customerCatalog } = require("../lib/customer/catalog.ts");
const { loadCart, saveCart } = require("../lib/storage.ts");
const { itemKey, withChoice } = require("../lib/cart.ts");
const { checkoutIssue } = require("../lib/checkout-validation.ts");
const cat = (catalog) => customerCatalog({ catalog, revision: 1, updatedAt: "" });

test("legacy cart indices migrate to original IDs and permanent deletion never changes a product", () => {
  const old = global.localStorage;
  let value = JSON.stringify([{ kind: "drink", drink: 1, qty: 1 }, { kind: "custom", name: "나의 볼", ingredients: ["로메인"], allergens: [], dressing: 1, price: 7000, photo: 0, qty: 1 }]);
  global.localStorage = { getItem: () => value, setItem: (_key, next) => value = next };
  try {
    const items = loadCart();
    assert.equal(items[0].drinkKey, "drink-1");
    assert.equal(items[1].dressingKey, "dressing-1");
    saveCart(items);
    const seed = customerSeed();
    seed.products = seed.products.filter((p) => p.id !== "drink-0" && p.id !== "dressing-0");
    let latest = cat(seed);
    assert.equal(latest.itemName(loadCart()[0]), "오렌지 주스");
    assert.match(latest.itemOptions(loadCart()[1]), /발사믹/);
    seed.products.reverse();
    latest = cat(seed);
    assert.equal(latest.itemName(items[0]), "오렌지 주스");
    seed.products = seed.products.filter((p) => p.id !== "drink-1" && p.id !== "dressing-1");
    latest = cat(seed);
    assert.equal(latest.itemAvailable(items[0]), false);
    assert.equal(latest.itemName(items[0]), "판매 종료 음료");
    assert.equal(latest.itemAvailable(items[1]), false);
    const changed = withChoice(items[1], null, "dressing-2");
    assert.ok(latest.itemAvailable(changed));
    assert.match(latest.itemOptions(changed), /참깨/);
    assert.notEqual(itemKey(changed), itemKey(items[1]));
    value = JSON.stringify([{ kind: "drink", drink: 0, drinkKey: "new-uuid-drink", qty: 1 }]);
    assert.equal(loadCart()[0].drinkKey, "new-uuid-drink");
    value = JSON.stringify([{ kind: "drink", drink: 0, drinkKey: 1, qty: 1 }]);
    assert.deepEqual(loadCart(), []);
  } finally { if (old === undefined) delete global.localStorage; else global.localStorage = old; }
});

test("checkout rejects stale stock, low totals, missing address, invalid dates and expired slots", () => {
  const seed = customerSeed();
  const items = [{ ...cat(seed).defaultItem(0), qty: 2 }];
  const now = new Date("2026-10-10T09:00:00").getTime();
  const delivery = { address: "서울 중구", day: "2026-10-10", timeLabel: "10:00–11:00", hours: { days: "매일", open: 10, close: 21 } };
  assert.equal(checkoutIssue(items, cat(seed), delivery, now), "");
  seed.products.find((p) => p.customerId === 0).status = "soldout";
  assert.match(checkoutIssue(items, cat(seed), delivery, now), /품절/);
  seed.products.find((p) => p.customerId === 0).status = "active";
  assert.match(checkoutIssue([{ ...items[0], qty: 1 }], cat(seed), delivery, now), /최소 주문/);
  assert.match(checkoutIssue(items, cat(seed), { ...delivery, address: " " }, now), /배송지/);
  assert.match(checkoutIssue(items, cat(seed), { ...delivery, day: "2026-02-30" }, now), /날짜/);
  assert.match(checkoutIssue(items, cat(seed), { ...delivery, day: "2026-11-10" }, now), /날짜/);
  assert.match(checkoutIssue(items, cat(seed), { ...delivery, timeLabel: "25:00–26:00" }, now), /시간대/);
  assert.match(checkoutIssue(items, cat(seed), delivery, now + 31 * 60_000), /시간대/);
});

test("browser JSON failures fall back and recipes retain newly added dressing IDs", () => {
  const { readBrowserJSON, writeBrowserJSON } = require("../lib/browser-json.ts");
  const previous = global.localStorage;
  try {
    global.localStorage = { getItem: () => "{", setItem: () => { throw Error("quota"); } };
    assert.deepEqual(readBrowserJSON("broken", []), []);
    assert.doesNotThrow(() => writeBrowserJSON("blocked", []));
    global.localStorage.getItem = () => JSON.stringify({ name: "신규 조합", ingredients: ["romaine"], dressing: 8, dressingKey: "new-dressing", price: 8000, savedAt: "2026-10-10" });
    const { recipeStore } = require("../lib/match.ts");
    assert.equal(recipeStore.getSnapshot().dressingKey, "new-dressing");
  } finally { if (previous === undefined) delete global.localStorage; else global.localStorage = previous; }
});
