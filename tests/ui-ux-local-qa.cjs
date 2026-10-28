/* eslint-disable @typescript-eslint/no-require-imports */
/** Read-only, local-browser evidence runner. Visual approval remains a human QA step. */
const fs = require("node:fs");
const path = require("node:path");

const base = "http://localhost:3000";
const widths = [390, 768, 1024, 1440];
const pending = [
  "UI-04",
  "UI-06",
  "UI-10",
  "C-01",
  "C-02",
  "C-14",
  "C-03",
  "C-04",
  "C-05",
  "C-06",
  "C-07",
  "C-08",
  "C-09",
  "C-10",
  "C-11",
  "C-12",
  "C-13",
  "UI-03",
  "UI-07",
  "UI-08",
  "UI-09",
  "UI-12",
  "UI-13",
  "UI-11",
  "A-01",
  "A-13",
  "A-14",
  "A-02",
  "A-03",
  "A-04",
  "A-05",
  "A-06",
  "A-07",
  "A-08",
  "A-10",
  "A-11",
  "A-12",
  "X-03",
  "X-04",
];
const routes = [
  { url: "/", name: "home", ids: ["C-09", "C-10", "C-12", "C-13", "X-04"] },
  { url: "/menu", name: "menu", ids: ["UI-04", "UI-10", "C-01", "C-11"] },
  { url: "/drinks", name: "drinks", ids: ["C-14"] },
  { url: "/match", name: "match", ids: ["C-03"] },
  { url: "/reviews", name: "reviews", ids: ["C-04", "C-11", "C-13"] },
  { url: "/event", name: "event", ids: ["C-08"] },
  { url: "/login", name: "login", ids: ["C-07"] },
  { url: "/admin/login", name: "admin-login", ids: ["UI-03"] },
];
const results = Object.fromEntries(pending.map((id) => [id, { checks: [], screenshots: [] }]));
const blockedRequests = new Set();
const output = path.join(process.cwd(), ".next", "ui-ux-local-qa", new Date().toISOString().replace(/[:.]/g, "-"));

function note(ids, check, status, detail = "") {
  for (const id of ids) {
    results[id].checks.push({ check, status, detail });
  }
}

function shot(ids, name) {
  for (const id of ids) {
    results[id].screenshots.push(name);
  }
}

async function screenshot(page, ids, name) {
  await page.screenshot({ path: path.join(output, name), animations: "disabled" });
  shot(ids, name);
}

function safeContext(browser, width) {
  return browser.newContext({
    viewport: { width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 },
    reducedMotion: "reduce",
  });
}

async function guardWrites(context) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      return route.continue();
    }
    blockedRequests.add(`${request.method()} ${new URL(request.url()).pathname}`);
    return route.abort("blockedbyclient");
  });
}

async function waitForMenu(page) {
  await page.waitForFunction(
    () => {
      const text = document.querySelector(".menu-count")?.textContent ?? "";
      return text !== "" && !text.includes("불러오는 중");
    },
    null,
    { timeout: 15000 },
  );
  const state = await page.locator(".menu-count").innerText();
  if (state.includes("실패")) {
    throw new Error(state);
  }
}

async function openSelect(page, trigger) {
  await page.waitForLoadState("load");
  await trigger.click();
  try {
    await page.waitForFunction(() => document.querySelector('[role="combobox"][data-state="open"]'), null, {
      timeout: 2500,
    });
  } catch {
    // A server-rendered control may receive the first click before hydration.
    await page.waitForTimeout(400);
    await trigger.click();
  }
  await page.getByRole("listbox").waitFor({ timeout: 5000 });
}

async function publicPages(browser) {
  for (const width of widths) {
    const context = await safeContext(browser, width);
    await guardWrites(context);
    const page = await context.newPage();
    for (const route of routes) {
      try {
        const response = await page.goto(base + route.url, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.locator("body").waitFor();
        if (route.url === "/menu") {
          try {
            await waitForMenu(page);
            const cards = await page.locator(".product-grid .product").count();
            note(
              ["C-01", "C-11"],
              `/menu ${width}px 조회 완료·상품 표시`,
              cards > 0 ? "PASS" : "NOT RUN",
              `${cards}개 카드`,
            );
            if (width >= 1024) {
              const aligned = await page.evaluate(() => {
                const category = document.querySelector(".menu-filters")?.getBoundingClientRect();
                const price = document.querySelector(".menu-price-range")?.getBoundingClientRect();
                return !!category && !!price && Math.abs(category.top - price.top) < 12 && category.right < price.left;
              });
              note(["C-01"], `/menu ${width}px 카테고리·가격 같은 행`, aligned ? "PASS" : "FAIL");
            }
          } catch (error) {
            note(["C-01", "C-11"], `/menu ${width}px 조회 완료 대기`, "NOT RUN", error.message);
          }
        }
        const status = response?.status() ?? 0;
        const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2);
        const ok = status > 0 && status < 400 && noOverflow;
        note(
          route.ids,
          `${route.url} ${width}px 기본 렌더·가로 넘침`,
          ok ? "PASS" : "FAIL",
          `HTTP ${status}; overflow=${!noOverflow}`,
        );
        await screenshot(page, route.ids, `${route.name}-${width}.png`);
      } catch (error) {
        note(route.ids, `${route.url} ${width}px 기본 렌더`, "FAIL", error.message);
      }
    }
    await context.close();
  }
}

async function cart(browser) {
  for (const width of widths) {
    const context = await safeContext(browser, width);
    await guardWrites(context);
    const items = Array.from({ length: 12 }, (_, index) => ({
      kind: "custom",
      name: `QA 샐러드 ${index + 1}`,
      ingredients: ["양상추", "토마토"],
      allergens: [],
      dressing: -1,
      price: 12000,
      photo: 0,
      qty: 1,
    }));
    await context.addInitScript((fixture) => localStorage.setItem("bb-cart", JSON.stringify(fixture)), items);
    const page = await context.newPage();
    try {
      await page.goto(base, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForFunction(
          () => document.querySelector(".cart-button")?.getAttribute("aria-label")?.includes("12개 담김"),
          null,
          { timeout: 15000 },
        );
      } catch {
        note(["C-05"], `합성 장바구니 ${width}px`, "NOT RUN", "로컬 fixture의 하이드레이션 확인 실패");
        await screenshot(page, ["C-05"], `cart-${width}-fixture-not-ready.png`).catch(() => {});
        continue;
      }
      await page.getByRole("button", { name: /장바구니 열기/ }).click();
      const drawer = page.getByRole("dialog", { name: "장바구니" });
      await drawer.waitFor();
      const count = await drawer.locator(".cart-item").count();
      const scrollable = await drawer.evaluate((element) => element.scrollHeight > element.clientHeight);
      const locked = await page.locator("body").evaluate((element) => element.classList.contains("lock"));
      for (const [position, fraction] of [
        ["top", 0],
        ["middle", 0.5],
        ["end", 1],
      ]) {
        await drawer.evaluate((element, value) => {
          element.scrollTop = (element.scrollHeight - element.clientHeight) * value;
        }, fraction);
        await screenshot(page, ["C-05", "X-03"], `cart-${width}-${position}.png`);
      }
      const cta = drawer.getByRole("button", { name: /결제하러 가기/ });
      const box = await cta.boundingBox();
      const accessible = !!box && box.y >= 0 && box.y + box.height <= page.viewportSize().height + 2;
      const total = await drawer.getByText("합계", { exact: true }).count();
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.querySelector(".drawer")?.getAttribute("aria-hidden") === "true");
      const closed = (await drawer.getAttribute("aria-hidden")) === "true";
      note(
        ["C-05"],
        `합성 장바구니 ${width}px: 12줄·내부 스크롤·합계·하단 액션·Escape`,
        count >= 10 && scrollable && locked && accessible && total > 0 && closed ? "PASS" : "FAIL",
        `rows=${count}; scroll=${scrollable}; bodyLock=${locked}; CTAvisible=${accessible}; total=${total}; escape=${closed}; 결제 미실행`,
      );
    } catch (error) {
      note(["C-05"], `합성 장바구니 ${width}px`, "FAIL", error.message);
      await screenshot(page, ["C-05"], `cart-${width}-failure.png`).catch(() => {});
    } finally {
      await context.close();
    }
  }
}

async function matchSelections(browser) {
  for (const width of widths) {
    const context = await safeContext(browser, width);
    await guardWrites(context);
    const page = await context.newPage();
    try {
      await page.goto(base + "/match", { waitUntil: "domcontentloaded" });
      const like = page.getByRole("button", { name: "재료 추가하기" });
      await like.waitFor({ timeout: 10000 });
      await page.locator(".card-stack .swipe-card:not(.preview-card) .ingredient-info").waitFor({ timeout: 10000 });
      const cardFits = await page.evaluate(() => {
        const card = document.querySelector(".card-stack .swipe-card:not(.preview-card)")?.getBoundingClientRect();
        const info = document
          .querySelector(".card-stack .swipe-card:not(.preview-card) .ingredient-info")
          ?.getBoundingClientRect();
        return !!card && !!info && info.bottom <= card.bottom + 2;
      });
      note(["C-03"], `/match ${width}px 재료 정보 하단`, cardFits ? "PASS" : "FAIL");
      await screenshot(page.locator(".card-stack"), ["C-03"], `match-ingredient-card-${width}.png`);
      let current = 0;
      for (const target of [0, 1, 4, 8, 12, 18]) {
        while (current < target && (await like.isEnabled())) {
          await like.click();
          current += 1;
          await page.waitForFunction(
            (count) => document.querySelector(".my-bowl .bowl-top > span")?.textContent === String(count),
            current,
          );
        }
        if (current < target) {
          note(["C-03"], `/match ${width}px ${target}개`, "NOT RUN", "선택 가능한 재료가 부족합니다.");
          break;
        }
        const card = page.locator(".my-bowl");
        await card.scrollIntoViewIfNeeded();
        const contained = await page.evaluate(() => {
          const bowl = document.querySelector(".bowl-illustration")?.getBoundingClientRect();
          const bits = document.querySelector(".bowl-bits")?.getBoundingClientRect();
          const card = document.querySelector(".my-bowl");
          return (
            !!bowl && !!bits && !!card && bits.bottom <= bowl.bottom + 2 && card.scrollWidth <= card.clientWidth + 2
          );
        });
        note(["C-03"], `/match ${width}px ${target}개 선택·넘침`, contained ? "PASS" : "FAIL");
        await screenshot(card, ["C-03"], `match-bowl-${width}-${target}.png`);
      }
    } catch (error) {
      note(["C-03"], `/match ${width}px 선택 상태`, "NOT RUN", error.message);
    } finally {
      await context.close();
    }
  }
}

async function selects(browser) {
  const cases = [
    { url: "/menu", label: "정렬" },
    { url: "/reviews", label: "리뷰 메뉴" },
    { url: "/reviews", label: "리뷰 정렬" },
  ];
  for (const width of widths) {
    const context = await safeContext(browser, width);
    await guardWrites(context);
    const page = await context.newPage();
    for (const item of cases) {
      try {
        await page.goto(base + item.url, { waitUntil: "domcontentloaded" });
        if (item.url === "/menu") {
          try {
            await waitForMenu(page);
          } catch (error) {
            note(["C-11"], `${item.label} ${width}px`, "NOT RUN", error.message);
            continue;
          }
        }
        const trigger = page.getByRole("combobox", { name: item.label });
        await openSelect(page, trigger);
        const list = page.getByRole("listbox");
        const box = await list.boundingBox();
        const rotated = await trigger.locator(".customer-select-icon svg").evaluate((icon) => {
          const transform = getComputedStyle(icon).transform;
          return transform !== "none" && transform !== "matrix(1, 0, 0, 1, 0, 0)";
        });
        const hasLabel = (await trigger.innerText()).trim().length > 0;
        const scrollArrow = (await list.locator(".customer-select-scroll").count()) > 0;
        const listScroll = await list.locator(".customer-select-viewport").evaluate((viewport) => ({
          needed: viewport.scrollHeight > viewport.clientHeight + 1,
          count: viewport.querySelectorAll('[role="option"]').length,
        }));
        const scrollExpected =
          item.url === "/menu"
            ? !listScroll.needed
            : item.label !== "리뷰 메뉴" || listScroll.count <= 6 || listScroll.needed;
        const inside =
          !!box &&
          box.x >= -2 &&
          box.y >= -2 &&
          box.x + box.width <= width + 2 &&
          box.y + box.height <= page.viewportSize().height + 2;
        await screenshot(page, ["C-11"], `select-${item.label.replace(/ /g, "-")}-${width}.png`);
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Escape");
        await page.waitForFunction(
          (label) => document.querySelector(`[aria-label="${label}"]`)?.getAttribute("aria-expanded") === "false",
          item.label,
        );
        const closed = (await trigger.getAttribute("aria-expanded")) === "false";
        note(
          ["C-11"],
          `${item.label} ${width}px 열림·화면 안 위치·화살표·Escape`,
          inside && closed && rotated && hasLabel && !scrollArrow && scrollExpected ? "PASS" : "FAIL",
          `inside=${inside}; closed=${closed}; rotated=${rotated}; label=${hasLabel}; strayArrow=${scrollArrow}; scroll=${listScroll.needed}/${listScroll.count}`,
        );
      } catch (error) {
        note(["C-11"], `${item.label} ${width}px`, "FAIL", error.message);
        await screenshot(page, ["C-11"], `select-${item.label.replace(/ /g, "-")}-${width}-failure.png`).catch(
          () => {},
        );
      }
    }
    await context.close();
  }
}

function writeReport() {
  const rows = pending.map((id) => {
    const entry = results[id];
    const automatic = entry.checks.some((check) => check.status === "FAIL")
      ? "FAIL"
      : entry.checks.length > 0 && entry.checks.every((check) => check.status === "PASS")
        ? "PASS"
        : "NOT RUN";
    return { id, automatic, visual: "NOT RUN", overall: automatic === "FAIL" ? "FAIL" : "NOT RUN", ...entry };
  });
  const report = [
    "# 로컬 UI/UX QA 증거",
    "",
    `- 실행 시각: ${new Date().toISOString()}`,
    "- 대상: localhost:3000, 390/768/1024/1440px, 새 브라우저 컨텍스트",
    "- 읽기 전용: GET/HEAD/OPTIONS 외 요청 차단; 장바구니 데이터는 브라우저 로컬 합성 fixture",
    "- 자동 기능 PASS는 전체 항목 완료가 아니다. 시각적 완성도는 스크린샷을 사람이 확인해야 한다.",
    "- 인증·백엔드·실데이터가 필요한 리뷰 작성 모달, 관리자 배달·Select·이벤트 달력은 NOT RUN.",
    "",
    "| ID | 자동 기능 | 시각 QA | 종합 | 캡처 |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${row.id} | ${row.automatic} | ${row.visual} | ${row.overall} | ${row.screenshots.join(", ") || "—"} |`,
    ),
    "",
    "## 자동 검사 상세",
    "",
    ...rows.flatMap((row) =>
      row.checks.map((check) => `- ${row.id}: ${check.status} — ${check.check}; ${check.detail}`),
    ),
    "",
    `차단한 쓰기 요청: ${[...blockedRequests].join(", ") || "없음"}`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(output, "report.md"), report);
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(rows, null, 2));
  console.log(`QA report: ${path.join(output, "report.md")}`);
  console.log(`Screenshots: ${output}`);
  console.log(`Automatic FAIL: ${rows.filter((row) => row.automatic === "FAIL").length}; visual approval: NOT RUN`);
  if (rows.some((row) => row.automatic === "FAIL")) {
    process.exitCode = 1;
  }
}

async function main() {
  let playwright;
  try {
    playwright = require("./playwright.cjs");
  } catch {
    throw new Error(
      "Playwright가 없습니다. 먼저 공식 패키지와 Chromium을 수동 설치하세요: npm install --no-save --package-lock=false playwright; npx playwright install chromium",
    );
  }
  let response;
  try {
    response = await fetch(base, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new Error("localhost:3000에 접속할 수 없습니다. 기존 Next 서버가 Ready인지 로컬 PowerShell에서 확인하세요.");
  }
  if (!response.ok) {
    throw new Error(`localhost:3000 응답 오류: HTTP ${response.status}`);
  }
  fs.mkdirSync(output, { recursive: true });
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    await publicPages(browser);
    await matchSelections(browser);
    await cart(browser);
    await selects(browser);
  } finally {
    await browser.close();
    writeReport();
  }
}

main().catch((error) => {
  if (!fs.existsSync(path.join(output, "report.md"))) {
    fs.mkdirSync(output, { recursive: true });
    writeReport();
  }
  console.error(`UI/UX QA 준비 실패: ${error.message}`);
  process.exitCode = 1;
});
