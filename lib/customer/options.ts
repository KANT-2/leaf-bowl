import type { Catalog } from "@/lib/admin/catalog";

export function optionChoices(
  catalog: Catalog,
  source: "drinks" | "dressings",
) {
  return catalog.products.filter(
    (p) =>
      p.type === (source === "drinks" ? "drink" : "dressing") &&
      !p.deleted &&
      p.status === "active",
  );
}

