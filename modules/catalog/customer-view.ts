import { ownValue } from "@/modules/shared/validation";
import { reviewTimestamp } from "@/modules/reviews/time";
import type { PublicSnapshot } from "@/modules/catalog/public-schema";
import type { Product } from "@/modules/catalog/customer-product";
import { deliveryFee } from "@/modules/settings/pricing";
import { type Ingredient } from "@/modules/bowl/ingredient";
import { ingredientOrigins } from "@/modules/catalog/allergens";
import { reviewDisplayDate, type Review } from "@/modules/reviews/model";
import { createCartSelectors } from "@/modules/cart/selectors";

function totalKcal(values: (number | undefined)[]): number | undefined {
  return values.some((value) => value === undefined)
    ? undefined
    : (values as number[]).reduce((sum, value) => sum + value, 0);
}

const split = (s: string) =>
  s
    .split(/[,·]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function customerCatalog(snapshot: PublicSnapshot) {
  const catalog = snapshot.catalog;
  const defaults = snapshot.defaults;
  const pricingPolicy = defaults.pricingPolicy;
  const salads = catalog.products.filter((p) => p.type === "salad");
  const registeredIngredients = (catalog.ingredients ?? []).filter((i) => !i.deleted);
  const PRODUCTS: Product[] = [];
  for (const p of salads) {
    const id = p.customerId!;
    PRODUCTS[id] = {
      id,
      name: p.name,
      en: p.en ?? "",
      description: p.description,
      ingredients: p.ingredients ?? p.description,
      ingredientOrigins: ingredientOrigins(p.ingredients ?? p.description, registeredIngredients),
      price: p.price,
      isNew: p.isNew,
      isOnSale: !p.deleted && p.status === "active",
      category: ownValue(defaults.catalogConfig.categoryAliases, p.category) ?? "other",
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
    description: p.description,
    ingredients: p.ingredients ?? p.description,
    origin: p.origin ?? "",
    allergens: split(p.allergens),
    price: p.price,
    available: !p.deleted && p.status === "active",
    image: p.image,
  }));
  const nutrition = PRODUCTS.map((_, id) => ownValue(defaults.nutrition, String(id)));
  const photoSrc = (id: number) => PRODUCTS[id]?.imageUrl || "/images/hero-cutout.png";

  const allergensOf = (id: number, dressing: number) => [
    ...new Set([...(PRODUCTS[id]?.allergens ?? []), ...(DRESSINGS[dressing]?.allergens ?? [])]),
  ];

  const unitPrice = (id: number, selected: number[]) =>
    (PRODUCTS[id]?.price ?? 0) + selected.reduce((n, i) => n + (DRINKS[i]?.price ?? 0), 0);
  const ingredients: Ingredient[] = (catalog.ingredients ?? [])
    .filter((i) => !i.deleted && i.status === "active" && i.price !== undefined && i.stage !== undefined)
    .map((i) => ({
      id: i.id,
      name: i.name,
      en: i.en ?? "",
      desc: i.description,
      price: i.price!,
      stage: i.stage!,
      group: i.category,
      emoji: ownValue(defaults.ingredientEmojis, i.id) ?? "",
      color: i.color ?? "#e9f2e8",
      allergens: split(i.allergens),
      image: i.image || "/images/hero-cutout.png",
    }));
  const reviews: Review[] = (catalog.reviews ?? [])
    .filter((r) => !r.deleted)
    .flatMap((r) => {
      const t = reviewTimestamp(r) ?? 0;
      const product = salads.find((p) => p.id === r.productId || (!r.productId && p.name === r.menu.split(" · ")[0]));
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
              date: reviewDisplayDate({ t, date: r.date }),
              via: r.via ?? "delivery",
              t,
              sample: r.sample ?? r.id.startsWith("review-example"),
            },
          ]
        : [];
    });
  const heroSlides = defaults.heroSlides
    .map((s, i) =>
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
    )
    .filter((s) => !s.href.startsWith("/product/") || visibleProducts.some((p) => s.href === `/product/${p.id}`));
  const getProduct = (id: number) => visibleProducts.find((p) => p.id === id);

  const productFromParam = (param: string) => (/^\d+$/.test(param) ? getProduct(Number(param)) : undefined);
  const { itemAvailable, defaultItem, itemUnitPrice, itemName, itemOptions, itemAllergens } = createCartSelectors(
    catalog,
    {
      PRODUCTS,
      DRESSINGS,
      DRINKS,
      ingredients,
      baseBowlPrice: pricingPolicy.baseBowlPrice,
    },
  );
  const dressingKcal = dressings.map((p) => ownValue(defaults.optionKcal, p.id));
  const drinkKcal = drinks.map((p) => ownValue(defaults.optionKcal, p.id));
  return {
    catalog,
    revision: snapshot.revision,
    PRODUCTS,
    visibleProducts,
    DRESSINGS,
    DRINKS,
    NUTRITION: nutrition,
    heroSlides,
    pricingPolicy,
    catalogConfig: defaults.catalogConfig,
    deliveryFee: (subtotal: number) => deliveryFee(subtotal, pricingPolicy),
    bowlPrice: (list: Ingredient[]) => pricingPolicy.baseBowlPrice + list.reduce((sum, item) => sum + item.price, 0),
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
    OPTION_IMAGES: Object.fromEntries([...dressings, ...drinks].map((p) => [p.name, p.image])),
    DRESSING_KCAL: dressingKcal,
    DRINK_KCAL: drinkKcal,
    kcalOf: (id: number, d: number, ds: number[]) =>
      totalKcal([nutrition[id]?.kcal, ...(d < 0 ? [] : [dressingKcal[d]]), ...ds.map((i) => drinkKcal[i])]),
    itemAvailable,
    defaultItem,
    groupsFor: (id: number) =>
      catalog.groups.filter((g) => !g.deleted && salads.find((p) => p.customerId === id)?.optionIds.includes(g.id)),
  };
}
export type CustomerCatalog = ReturnType<typeof customerCatalog>;
export { optionChoices } from "@/modules/catalog/options";
