import type { Snapshot } from "@/lib/admin/catalog";
import type { Product } from "@/types/product";
import { NUTRITION, DRESSING_KCAL, DRINK_KCAL } from "@/lib/products";
import { HERO_SLIDES } from "@/lib/data/hero";
import type { Ingredient } from "@/lib/data/ingredients";
import type { Review } from "@/lib/reviews";
import { createCartSelectors } from "./cart-selectors";

const split = (s: string) =>
  s
    .split(/[,·]/)
    .map((x) => x.trim())
    .filter(Boolean);
const labels: Record<string, Product["category"]> = {
  "든든한 단백질": "protein",
  "플랜트 베이스": "vegan",
  "새로운 조합": "new",
};
export function customerCatalog(snapshot: Snapshot) {
  const catalog = snapshot.catalog;
  const salads = catalog.products.filter((p) => p.type === "salad");
  const PRODUCTS: Product[] = [];
  for (const p of salads) {
    const id = p.customerId!;
    PRODUCTS[id] = {
      id,
      name: p.name,
      en: p.en ?? "",
      description: p.description,
      ingredients: p.ingredients ?? p.description,
      price: p.price,
      category: labels[p.category] ?? "other",
      categoryLabel: p.category,
      imageUrl: p.image,
      allergens: split(p.allergens),
      tag: p.badge || undefined,
      status: p.deleted ? "hidden" : p.status,
    };
  }
  const visibleProducts = PRODUCTS.filter((p) => p && p.status !== "hidden");
  // 선택의 영속 식별자는 상품 ID이며 배열 번호는 화면 내부에서만 사용한다.
  const dressings = catalog.products.filter((p) => p.type === "dressing");
  const drinks = catalog.products.filter((p) => p.type === "drink");
  const DRESSINGS = dressings.map((p) => ({
    id: p.id,
    name: p.name,
    allergens: split(p.allergens),
    price: p.price,
    available: !p.deleted && p.status === "active",
    image: p.image,
  }));
  const DRINKS = drinks.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    available: !p.deleted && p.status === "active",
    image: p.image,
  }));
  const nutrition = PRODUCTS.map(
    (p, i) => NUTRITION[i] ?? { kcal: 0, protein: 0, weight: 0 },
  );
  const photoSrc = (id: number) =>
    PRODUCTS[id]?.imageUrl || "/images/hero-cutout.png";
  const allergensOf = (id: number, dressing: number) => [
    ...new Set([
      ...(PRODUCTS[id]?.allergens ?? []),
      ...(DRESSINGS[dressing]?.allergens ?? []),
    ]),
  ];
  const unitPrice = (id: number, selected: number[]) =>
    (PRODUCTS[id]?.price ?? 0) +
    selected.reduce((n, i) => n + (DRINKS[i]?.price ?? 0), 0);
  const ingredients: Ingredient[] = (catalog.ingredients ?? [])
    .filter((i) => !i.deleted && i.status === "active")
    .map((i) => ({
      id: i.id,
      name: i.name,
      en: i.en ?? "",
      desc: i.description,
      price: i.price ?? 0,
      stage: i.stage ?? "TOPPINGS",
      group: i.category,
      emoji: "",
      color: i.color ?? "#e9f2e8",
      allergens: split(i.allergens),
      image: i.image || "/images/hero-cutout.png",
    }));
  const reviews: Review[] = (catalog.reviews ?? [])
    .filter((r) => !r.deleted)
    .flatMap((r) => {
      const product = salads.find(
        (p) =>
          p.id === r.productId ||
          (!r.productId && p.name === r.menu.split(" · ")[0]),
      );
      return product && !product.deleted && product.status !== "hidden"
        ? [
            {
              id: r.id,
              pid: product.customerId!,
              author: r.author,
              stars: r.rating,
              title: r.title,
              text: r.body,
              images: r.images,
              date: r.date,
              via: r.via ?? "delivery",
              t: Date.parse(r.createdAt ?? r.date.replaceAll(".", "-")) || 0,
              sample: r.sample ?? r.id.startsWith("review-example"),
            },
          ]
        : [];
    });
  const heroSlides = HERO_SLIDES.map((s, i) =>
    i === 0
      ? {
          ...s,
          title: (() => {
            const lines = catalog.content.heroTitle.split(/\n|(?<=,)\s+/);
            return [lines[0], lines.slice(1).join(" ")] as [string, string];
          })(),
          body: [catalog.content.heroDescription, ""] as [string, string],
        }
      : s,
  ).filter(
    (s) =>
      !s.href.startsWith("/product/") ||
      visibleProducts.some((p) => s.href === `/product/${p.id}`),
  );
  const getProduct = (id: number) => visibleProducts.find((p) => p.id === id);
  const productFromParam = (param: string) =>
    /^\d+$/.test(param) ? getProduct(Number(param)) : undefined;
  const { itemAvailable, defaultItem, itemUnitPrice, itemName, itemOptions, itemAllergens } = createCartSelectors(catalog, { PRODUCTS, DRESSINGS, DRINKS, ingredients });
  return {
    catalog,
    revision: snapshot.revision,
    PRODUCTS,
    visibleProducts,
    DRESSINGS,
    DRINKS,
    NUTRITION: nutrition,
    heroSlides,
    ingredients,
    reviews,
    photoSrc,
    allergensOf,
    unitPrice,
    getProduct,
    productFromParam,
    itemUnitPrice,
    itemName,
    itemOptions,
    itemAllergens,
    OPTION_IMAGES: Object.fromEntries(
      [...dressings, ...drinks].map((p) => [p.name, p.image]),
    ),
    DRESSING_KCAL: DRESSINGS.map((_, i) => DRESSING_KCAL[i] ?? 0),
    DRINK_KCAL: DRINKS.map((_, i) => DRINK_KCAL[i] ?? 0),
    kcalOf: (id: number, d: number, ds: number[]) =>
      (nutrition[id]?.kcal ?? 0) +
      (DRESSING_KCAL[d] ?? 0) +
      ds.reduce((n, i) => n + (DRINK_KCAL[i] ?? 0), 0),
    itemAvailable,
    defaultItem,
    groupsFor: (id: number) =>
      catalog.groups.filter(
        (g) =>
          !g.deleted &&
          salads.find((p) => p.customerId === id)?.optionIds.includes(g.id),
      ),
  };
}
export type CustomerCatalog = ReturnType<typeof customerCatalog>;
export { optionChoices } from "./options";

/** Keep option slots stable while withholding hidden and deleted content. */
export function publicSnapshot(snapshot: Snapshot): Snapshot {
  const catalog = snapshot.catalog;
  return {
    ...snapshot,
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
