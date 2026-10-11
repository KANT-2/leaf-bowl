/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("./playwright.cjs");
const { signInAdmin } = require("./browser-helpers.cjs");
const assert = require("node:assert/strict");
const base = process.env.FRONT5_BASE_URL || "http://localhost:3581";
const statusNames = { active: "판매 중", soldout: "품절", hidden: "숨김" };

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await signInAdmin(page.context(), base);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const seed = await (await page.request.get(base + "/api/catalog")).json();
    let snapshot;
    let failSave = false;
    await page.route("**/api/admin/catalog", async (route) => {
      if (route.request().method() === "PUT") {
        if (failSave) {
          failSave = false;
          await route.fulfill({
            status: 500,
            json: { error: "복원 저장 실패 검증" },
          });
          return;
        }
        const input = route.request().postDataJSON();
        assert.equal(input.revision, snapshot.revision);
        snapshot = {
          ...snapshot,
          catalog: input.catalog,
          revision: snapshot.revision + 1,
          updatedAt: new Date().toISOString(),
        };
      }
      await route.fulfill({ json: snapshot });
    });
    for (const type of ["salad", "drink", "dressing"]) {
      for (const status of Object.keys(statusNames)) {
        snapshot = structuredClone(seed);
        const product = snapshot.catalog.products.find((item) => item.type === type);
        product.deleted = true;
        product.status = status;
        product.name = `복원 검증 ${type} ${status}`;
        const activeGroup = snapshot.catalog.groups.find((group) => !group.deleted);
        snapshot.catalog.groups.push({
          ...structuredClone(activeGroup),
          id: "deleted-test-group",
          deleted: true,
        });
        product.optionIds = [activeGroup.id, "deleted-test-group", "missing-test-group"];
        await page.goto(base + "/admin#trash");
        const row = page.locator(".trash-row").filter({ hasText: product.name });
        await row.getByRole("button", { name: "복원", exact: true }).click();
        await page
          .getByText(`“${product.name}”을 ${statusNames[status]} 상태로 복원했습니다.`, { exact: true })
          .waitFor();
        const restored = snapshot.catalog.products.find((item) => item.id === product.id);
        assert.equal(restored.status, status);
        assert.equal(restored.deleted, false);
        assert.deepEqual(restored.optionIds, [activeGroup.id]);
        await page.reload();
        await page.getByRole("heading", { name: "휴지통", exact: true }).waitFor();
        assert.equal(await row.count(), 0);
      }
    }
    snapshot = structuredClone(seed);
    const target = snapshot.catalog.products.find((item) => item.type === "salad");
    target.deleted = true;
    target.status = "soldout";
    failSave = true;
    await page.goto(base + "/admin#trash");
    const row = page.locator(".trash-row").filter({ hasText: target.name });
    await row.getByRole("button", { name: "복원", exact: true }).click();
    await page.getByText("복원 저장 실패 검증", { exact: true }).waitFor();
    assert.equal(snapshot.catalog.products.find((item) => item.id === target.id).deleted, true);
    await page.reload();
    await row.waitFor();
    await row.getByRole("button", { name: "복원", exact: true }).click();
    await row.waitFor({ state: "hidden" });
    assert.equal(snapshot.catalog.products.find((item) => item.id === target.id).status, "soldout");

    snapshot = structuredClone(seed);
    const group = snapshot.catalog.groups.find((item) => !item.deleted);
    group.deleted = true;
    await page.goto(base + "/admin#trash");
    const groupRow = page.locator(".trash-row").filter({ hasText: group.name });
    await groupRow.getByRole("button", { name: "복원", exact: true }).click();
    await page.getByText("옵션 그룹을 복원했습니다.", { exact: true }).waitFor();
    assert.equal(snapshot.catalog.groups.find((item) => item.id === group.id).deleted, false);
    assert.deepEqual(errors, []);
    console.log(
      "Passed: 9 product status/type combinations, option cleanup, failed save/retry, reload and group restore; no page errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
