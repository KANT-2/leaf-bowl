import type { Snapshot } from "./schema";
import type { PublicSnapshot } from "./public-schema";

/** Keep option slots stable while withholding hidden and deleted content. */
export function publicSnapshot(snapshot: Snapshot): PublicSnapshot {
  if (!snapshot.defaults) throw new Error("카탈로그 DB 설정이 없습니다.");
  const catalog = snapshot.catalog;
  return {
    ...snapshot,
    defaults: snapshot.defaults,
    catalog: {
      ...catalog,
      products: catalog.products.map((p) =>
        p.deleted || p.status === "hidden"
          ? {
              ...p,
              name: "",
              en: "",
              description: "",
              ingredients: "",
              image: "",
              allergens: "",
              price: 0,
              badge: "",
              optionIds: [],
            }
          : p,
      ),
      groups: catalog.groups.filter((g) => !g.deleted),
      ingredients: catalog.ingredients?.filter(
        (i) => !i.deleted && i.status === "active",
      ),
      reviews: catalog.reviews?.filter((r) => !r.deleted),
      content: {
        ...catalog.content,
        seasonPages: catalog.content.seasonPages?.filter((p) => p.visible),
      },
    },
  };
}
