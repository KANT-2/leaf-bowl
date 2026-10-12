import type { BannerPage, Content } from "./schema";

/** Preserve the previously registered images when adopting page management. */
export function bannerPagesForEditor(content: Content): BannerPage[] {
  if (content.bannerPages !== undefined) {
    return content.bannerPages;
  }
  const pages: BannerPage[] = [];
  if (content.mainImage) {
    pages.push({
      id: "legacy-main",
      image: content.mainImage,
      mobileImage: content.mainMobileImage,
      alt: "leaf & bowl 메인 배너",
      href: "/menu",
      visible: true,
    });
  }
  if (content.heroImage) {
    pages.push({
      id: "legacy-ad",
      image: content.heroImage,
      mobileImage: content.heroMobileImage,
      alt: content.heroAlt,
      href: content.heroHref,
      visible: true,
    });
  }
  return pages;
}

export function visibleBannerPages(content: Content): BannerPage[] {
  return content.bannerVisible
    ? bannerPagesForEditor(content).filter((page) => page.visible && (!!page.image || page.originalIndex !== undefined))
    : [];
}

/** Include built-in banners as managed pages, retaining their existing artwork and layout. */
export function allBannerPages(content: Content, originals: readonly { alt: string; href: string }[]): BannerPage[] {
  if (content.bannerIncludesOriginals) {
    return bannerPagesForEditor(content);
  }
  const pages: BannerPage[] = originals.map((slide, originalIndex) => ({
    id: `original-banner-${originalIndex}`,
    originalIndex,
    image: "",
    mobileImage: "",
    alt: slide.alt,
    href: slide.href,
    visible: true,
  }));
  pages.splice(Math.min(1, pages.length), 0, ...bannerPagesForEditor(content));
  return pages;
}
