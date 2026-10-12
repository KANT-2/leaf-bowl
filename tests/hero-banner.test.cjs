/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { contentSchema } = require("../modules/catalog/schema.ts");
const existing = {
  heroTitle: "메인",
  heroDescription: "",
  seasonTitle: "시즌",
  seasonDescription: "",
  seasonImage: "",
  seasonProductId: "",
  seasonVisible: true,
};
test("existing content receives empty banner fields without replacing its text", () => {
  const content = contentSchema.parse(existing);
  assert.equal(content.heroImage, "");
  assert.equal(content.heroMobileImage, "");
  assert.equal(content.heroTitle, "메인");
});
test("banner fields survive validation and navigation accepts only internal paths", () => {
  const banner = {
    ...existing,
    heroImage: "/api/admin/images/banner.png",
    heroMobileImage: "/api/admin/images/mobile.webp",
    heroAlt: "여름 이벤트",
    heroHref: "/menu?category=salad",
  };
  assert.deepEqual(contentSchema.parse(banner), {
    ...banner,
    mainImage: "",
    mainMobileImage: "",
    bannerVisible: true,
    bannerIncludesOriginals: false,
  });
  for (const heroHref of ["javascript:alert(1)", "https://example.com", "//example.com", "/\\example.com"]) {
    assert.equal(contentSchema.safeParse({ ...banner, heroHref }).success, false);
  }
});

const { bannerPagesForEditor, visibleBannerPages, allBannerPages } = require("../modules/catalog/banner-pages.ts");
test("legacy uploaded banners become ordered pages and keep mobile artwork and links", () => {
  const content = contentSchema.parse({
    ...existing,
    mainImage: "/images/main.png",
    mainMobileImage: "/images/main-mobile.png",
    heroImage: "/images/ad.png",
    heroMobileImage: "/images/ad-mobile.png",
    heroHref: "/menu",
  });
  const pages = bannerPagesForEditor(content);
  assert.deepEqual(
    pages.map((p) => p.image),
    ["/images/main.png", "/images/ad.png"],
  );
  assert.equal(pages[1].mobileImage, "/images/ad-mobile.png");
  assert.equal(pages[1].href, "/menu");
});
test("configured pages preserve order, hide incomplete pages, and respect global visibility without legacy resurrection", () => {
  const page = (id, image, visible = true) => ({ id, image, mobileImage: "", alt: "", href: "", visible });
  const content = contentSchema.parse({
    ...existing,
    heroImage: "/images/old.png",
    bannerPages: [
      page("second", "/images/second.png"),
      page("hidden", "/images/hidden.png", false),
      page("empty", ""),
      page("first", "/images/first.png"),
    ],
  });
  assert.deepEqual(
    visibleBannerPages(content).map((p) => p.id),
    ["second", "first"],
  );
  assert.equal(visibleBannerPages({ ...content, bannerVisible: false }).length, 0);
  assert.equal(visibleBannerPages({ ...content, bannerPages: [] }).length, 0);
  assert.equal(bannerPagesForEditor({ ...content, bannerPages: [] }).length, 0);
  assert.equal(
    contentSchema.safeParse({ ...content, bannerPages: [page("same", ""), page("same", "")] }).success,
    false,
  );
  assert.equal(
    contentSchema.safeParse({
      ...content,
      bannerPages: [page("unsafe", "")].map((p) => ({ ...p, href: "//example.com" })),
    }).success,
    false,
  );
});

test("existing built-in banners are first-class admin pages and remain stable after save or deletion", () => {
  const originals = [0, 1, 2].map((n) => ({ alt: `원본 ${n}`, href: "/menu" }));
  const content = contentSchema.parse({ ...existing, heroImage: "/images/ad.png" });
  const pages = allBannerPages(content, originals);
  assert.deepEqual(
    pages.map((p) => p.originalIndex ?? "advertisement"),
    [0, "advertisement", 1, 2],
  );
  const saved = { ...content, bannerIncludesOriginals: true, bannerPages: pages };
  assert.deepEqual(allBannerPages(saved, originals), pages);
  assert.equal(visibleBannerPages(saved).length, 4);
  assert.equal(allBannerPages({ ...saved, bannerPages: [] }, originals).length, 0);
  const moved = [pages[3], pages[0], pages[1], { ...pages[2], visible: false }];
  assert.deepEqual(
    visibleBannerPages({ ...saved, bannerPages: moved }).map((p) => p.originalIndex ?? "advertisement"),
    [2, 0, "advertisement"],
  );
});
