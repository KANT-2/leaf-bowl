import type { Catalog, Review } from "@/modules/catalog/schema";
export { money } from "@/modules/shared/format";
export { reviewDateTime } from "@/modules/shared/time";
export function saladCategories(catalog: Catalog): string[] {
  return (
    catalog.categories ?? [
      ...new Set(
        catalog.products
          .filter((p) => p.type === "salad" && !p.deleted)
          .map((p) => p.category),
      ),
    ]
  );
}

export function reviewMenuLabel(
  review: Pick<Review, "menu" | "drinks">,
): string {
  const parts = review.menu.split(" · "),
    fulfillment = parts.length > 1 ? parts.pop() : undefined;
  return (
    [...parts, ...(review.drinks ?? [])].join(" · ") +
    (fulfillment ? "   |   " + fulfillment : "")
  );
}
