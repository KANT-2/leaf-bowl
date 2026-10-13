import type { Catalog } from "@/modules/catalog/schema";
import type { ManagedEvent } from "@/modules/events/schema";

export const imageKeyPattern = /^[a-zA-Z0-9_-]+\.(png|jpg|webp)$/;

export function uploadedImageKey(url: string): string | null {
  const prefix = "/api/admin/images/";
  const key = url.startsWith(prefix) ? url.slice(prefix.length) : "";
  return imageKeyPattern.test(key) ? key : null;
}

export function eventImageKeys(events: readonly ManagedEvent[]): Set<string> {
  return new Set(
    events
      .flatMap((event) => [event.image, event.mobileImage])
      .map(uploadedImageKey)
      .filter((key): key is string => key !== null),
  );
}

/** Includes hidden/trash references: those records can still be restored. */
export function catalogImageKeys(catalog: Catalog): Set<string> {
  const urls = [
    ...catalog.products.map((p) => p.image),
    ...(catalog.ingredients ?? []).map((i) => i.image),
    ...(catalog.reviews ?? []).flatMap((r) => r.images ?? []),
    catalog.content.seasonImage,
    catalog.content.mainImage,
    catalog.content.mainMobileImage,
    catalog.content.heroImage,
    catalog.content.heroMobileImage,
    ...(catalog.content.bannerPages ?? []).flatMap((p) => [p.image, p.mobileImage]),
    ...(catalog.content.seasonPages ?? []).map((p) => p.image),
    ...(catalog.content.deletedBannerPages ?? []).flatMap((p) => [p.image, p.mobileImage]),
    ...(catalog.content.deletedSeasonPages ?? []).map((p) => p.image),
  ];
  return new Set(urls.map(uploadedImageKey).filter((key): key is string => key !== null));
}
