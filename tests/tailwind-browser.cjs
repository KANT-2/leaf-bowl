/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require("./playwright.cjs");
const { signInAdmin } = require("./browser-helpers.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = process.env.FRONT5_BASE_URL || "http://localhost:3397";
const baselineFile = process.env.TAILWIND_BASELINE_FILE;
const captureBaseline = process.env.TAILWIND_CAPTURE_BASELINE === "1";
const shots = process.env.FRONT5_SCREENSHOT_DIR || path.join(__dirname, "../docs/screenshots/issue-97");

async function measure(page, selectors) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(
    (names) =>
      Object.fromEntries(
        names.flatMap((selector) => {
          const element = document.querySelector(selector);
          if (!element) {
            return [];
          }
          const rectangle = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return [
            [
              selector,
              {
                x: Math.round(rectangle.x),
                y: Math.round(rectangle.y),
                width: Math.round(rectangle.width),
                height: Math.round(rectangle.height),
                color: style.color,
                background: style.backgroundColor,
                fontSize: style.fontSize,
                padding: style.padding,
                borderRadius: style.borderRadius,
              },
            ],
          ];
        }),
      ),
    selectors,
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const measurements = {};
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 1050 }, reducedMotion: "reduce" });
      await signInAdmin(context, base);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const route of ["/", "/menu", "/product/0", "/match", "/admin/login", "/admin"]) {
        await page.goto(base + route);
        await page.locator("main").first().waitFor();
        if (route === "/") {
          await page.locator(".hero-pause").waitFor({ state: "hidden" });
        }
        if (route === "/admin") {
          await page.locator(".workspace table tbody tr").first().waitFor();
        }
        const selectors = [
          "body",
          "h1",
          ".wrap",
          ".product",
          ".primary",
          ".pv-meta",
          ".bm-deck",
          ".admin-auth-card",
          ".workspace",
          ".topbar",
          ".hero-ctrl",
          ".menu-type-tabs",
          '[data-slot="tabs-list"]',
          '[data-slot="tabs-trigger"][data-state="active"]',
          '[data-slot="table-head"]',
          '[data-slot="table-cell"]',
          "#admin-login-id",
          "#admin-password",
          ".admin-auth-submit",
          '[data-slot="sidebar-header"]',
          '[data-slot="sidebar-content"]',
          '[data-slot="sidebar-menu-button"]',
        ];
        measurements[width + route] = await measure(page, selectors);
        if (!captureBaseline && width === 1440 && route === "/admin") {
          const variants = await page.evaluate(() => {
            const existing = document.querySelector('[data-slot="sidebar-menu-button"]');
            const values = {};
            for (const size of ["h-7", "h-8", "h-12"]) {
              const element = existing.cloneNode(true);
              element.className = "flex " + size;
              document.body.append(element);
              values[size] = getComputedStyle(element).height;
              element.remove();
            }
            return values;
          });
          assert.deepEqual(variants, { "h-7": "28px", "h-8": "32px", "h-12": "48px" });
        }
        if (!captureBaseline && ["/menu", "/admin"].includes(route)) {
          if (width === 390 && route === "/admin") {
            await page.locator('[data-slot="sidebar-trigger"]').click();
            const dialog = page.getByRole("dialog");
            await dialog.locator('[data-slot="sidebar-menu-button"]').first().waitFor();
            await page.waitForFunction(() => {
              const sidebar = document.querySelector('[role="dialog"]');
              return sidebar && Math.abs(sidebar.getBoundingClientRect().left) < 1;
            });
          }
          fs.mkdirSync(shots, { recursive: true });
          await page.screenshot({ path: path.join(shots, `tailwind-${route.slice(1)}-${width}.png`) });
        }
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    if (captureBaseline) {
      assert.ok(baselineFile, "TAILWIND_BASELINE_FILE is required to capture a baseline");
      fs.writeFileSync(baselineFile, JSON.stringify(measurements, null, 2));
    } else if (baselineFile) {
      assert.deepEqual(
        measurements,
        JSON.parse(fs.readFileSync(baselineFile, "utf8")),
        "Page geometry and colors must match the previous layout",
      );
    }
    console.log(
      captureBaseline
        ? "Tailwind baseline captured: six pages at desktop/mobile widths; no page errors."
        : "Tailwind browser passed: six pages at desktop/mobile widths, page geometry/colors, sidebar size variants; no page errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
