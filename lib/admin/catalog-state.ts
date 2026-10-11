import { type Catalog, type Snapshot } from "./catalog";
import { migrateCatalog } from "./customer-seed";
import { normalizeReviewTime } from "@/lib/review-time";
import { kstDate } from "@/lib/time";

export type CatalogState = Snapshot & { nextCustomerId: number; deletedReviewIds: string[] };
export type ReviewInput = { id: string; pid: number; author: string; stars: number; title: string; text: string; via: "pickup" | "delivery"; images?: string[] };

export function snapshot(state: CatalogState): Snapshot {
  return { catalog: state.catalog, revision: state.revision, updatedAt: state.updatedAt };
}

export function replaceCatalog(current: CatalogState, catalog: Catalog): CatalogState {
  let nextId = Math.max(current.nextCustomerId, 12, ...current.catalog.products.map(p => (p.customerId ?? -1) + 1));
  const incoming = catalog.reviews ?? current.catalog.reviews ?? [];
  const incomingIds = new Set(incoming.map(r => r.id));
  const removed = new Set(current.deletedReviewIds);
  for (const review of current.catalog.reviews ?? []) if (!incomingIds.has(review.id)) removed.add(review.id);
  const normalized = migrateCatalog({
    ...catalog,
    reviews: incoming.filter(r => !removed.has(r.id)).map(normalizeReviewTime),
    products: catalog.products.map(p => ({
      ...p,
      customerId: p.type === "salad" ? (current.catalog.products.find(old => old.id === p.id)?.customerId ?? nextId++) : undefined,
    })),
  });
  return { catalog: normalized, nextCustomerId: nextId, deletedReviewIds: [...removed], revision: current.revision + 1, updatedAt: new Date().toISOString() };
}

export function addReview(current: CatalogState, input: ReviewInput): CatalogState {
  if (current.deletedReviewIds.includes(input.id) || current.catalog.reviews?.some(r => r.id === input.id)) return current;
  const product = current.catalog.products.find(p => p.customerId === input.pid && p.type === "salad" && !p.deleted && p.status !== "hidden");
  if (!product) throw new Error("해당 메뉴에 리뷰를 작성할 수 없습니다.");
  if ((current.catalog.reviews ?? []).length >= 500) throw new Error("리뷰 등록 한도에 도달했습니다.");
  const createdAt = new Date().toISOString();
  return { ...current, revision: current.revision + 1, updatedAt: createdAt, catalog: {
    ...current.catalog,
    reviews: [{ id: input.id, productId: product.id, author: input.author, rating: input.stars, title: input.title,
      body: input.text, via: input.via, menu: product.name, ...(input.images?.length ? { images: input.images } : {}),
      date: kstDate(Date.parse(createdAt)).replaceAll("-", "."), createdAt, deleted: false,
    }, ...(current.catalog.reviews ?? [])],
  } };
}
