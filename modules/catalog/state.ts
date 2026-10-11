import { type Catalog, type CatalogSnapshot } from "@/modules/catalog/schema";
import { normalizeReviewTime } from "@/modules/reviews/time";
import { kstDate } from "@/modules/shared/time";
import { AppError } from "@/modules/shared/errors";

export type CatalogState = CatalogSnapshot & {
  nextCustomerId: number;
  deletedReviewIds: string[];
};
export type ReviewInput = {
  id: string;
  pid: number;
  author: string;
  stars: number;
  title: string;
  text: string;
  via: "pickup" | "delivery";
  images?: string[];
};

export function snapshot(state: CatalogState): CatalogSnapshot {
  return {
    catalog: state.catalog,
    revision: state.revision,
    updatedAt: state.updatedAt,
  };
}

export function replaceCatalog(
  current: CatalogState,
  catalog: Catalog,
  updatedAt: string,
): CatalogState {
  let nextId = Math.max(
    current.nextCustomerId,
    0,
    ...current.catalog.products.map((p) => (p.customerId ?? -1) + 1),
  );
  const incoming = catalog.reviews ?? current.catalog.reviews ?? [];
  const incomingIds = new Set(incoming.map((r) => r.id));
  const removed = new Set(current.deletedReviewIds);
  for (const review of current.catalog.reviews ?? [])
    if (!incomingIds.has(review.id)) removed.add(review.id);
  const normalized: Catalog = {
    ...catalog,
    ingredients: catalog.ingredients ?? current.catalog.ingredients ?? [],
    categories: catalog.categories ?? current.catalog.categories,
    ...((catalog.location ?? current.catalog.location)
      ? { location: catalog.location ?? current.catalog.location }
      : {}),
    reviews: incoming
      .filter((r) => !removed.has(r.id))
      .map(normalizeReviewTime),
    products: catalog.products.map((p) => ({
      ...p,
      customerId:
        p.type === "salad"
          ? (current.catalog.products.find((old) => old.id === p.id)
              ?.customerId ?? nextId++)
          : undefined,
    })),
  };
  return {
    catalog: normalized,
    nextCustomerId: nextId,
    deletedReviewIds: [...removed],
    revision: current.revision + 1,
    updatedAt,
  };
}

export function addReview(
  current: CatalogState,
  input: ReviewInput,
  createdAt: string,
): CatalogState {
  if (
    current.deletedReviewIds.includes(input.id) ||
    current.catalog.reviews?.some((r) => r.id === input.id)
  )
    return current;
  const product = current.catalog.products.find(
    (p) =>
      p.customerId === input.pid &&
      p.type === "salad" &&
      !p.deleted &&
      p.status !== "hidden",
  );
  if (!product)
    throw new AppError(400, "해당 메뉴에 리뷰를 작성할 수 없습니다.");
  if ((current.catalog.reviews ?? []).length >= 500)
    throw new AppError(400, "리뷰 등록 한도에 도달했습니다.");
  return {
    ...current,
    revision: current.revision + 1,
    updatedAt: createdAt,
    catalog: {
      ...current.catalog,
      reviews: [
        {
          id: input.id,
          productId: product.id,
          author: input.author,
          rating: input.stars,
          title: input.title,
          body: input.text,
          via: input.via,
          menu: product.name,
          ...(input.images?.length ? { images: input.images } : {}),
          date: kstDate(Date.parse(createdAt)).replaceAll("-", "."),
          createdAt,
          deleted: false,
        },
        ...(current.catalog.reviews ?? []),
      ],
    },
  };
}
