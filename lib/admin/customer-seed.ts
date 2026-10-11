import { normalizeReviewTime } from "@/lib/review-time";
import legacyCatalog from "./imported-catalog.json";
import { PRODUCTS, DRESSINGS, DRINKS } from "@/data/products";
import { INGREDIENTS } from "@/lib/data/ingredients";
import { HERO_SLIDES } from "@/lib/data/hero";
import { REVIEWS_SEED } from "@/lib/reviews";
import { initialCatalog, type Catalog, type Product } from "./catalog";

const labels = {
  protein: "든든한 단백질",
  vegan: "플랜트 베이스",
  new: "새로운 조합",
  other: "기타",
};
export function customerSeed(): Catalog {
  return {
    categories: Object.values(labels),
    products: [
      ...PRODUCTS.map((p) => ({
        id: `salad-${p.id}`,
        customerId: p.id,
        type: "salad" as const,
        name: p.name,
        en: p.en,
        price: p.price,
        description: p.description,
        ingredients: p.ingredients,
        category: labels[p.category],
        status: "active" as const,
        badge: (p.tag ?? "") as Product["badge"],
        image: p.imageUrl,
        allergens: p.allergens.join(", "),
        optionIds: ["dressing", "drinks"],
        deleted: false,
      })),
      ...DRINKS.map((p, i) => ({
        id: `drink-${i}`,
        type: "drink" as const,
        name: p.name,
        price: p.price,
        description: "",
        category: "음료",
        status: "active" as const,
        badge: "" as const,
        image:
          [
            "/images/options/drink-americano.png",
            "/images/options/drink-orange.png",
            "/images/options/drink-apple.png",
            "/images/options/drink-kale.png",
          ][i] ?? "",
        allergens: "",
        optionIds: [],
        deleted: false,
      })),
      ...DRESSINGS.map((p, i) => ({
        id: `dressing-${i}`,
        type: "dressing" as const,
        name: p.name,
        price: 0,
        description: "",
        category: "드레싱",
        status: "active" as const,
        badge: "" as const,
        image:
          [
            "/images/options/dressing-lemon-olive.png",
            "/images/options/dressing-balsamic.png",
            "/images/options/dressing-sesame.png",
            "/images/options/dressing-caesar.png",
            "/images/options/dressing-none.png",
          ][i] ?? "",
        allergens: p.allergens.join(", "),
        optionIds: [],
        deleted: false,
      })),
    ],
    groups: [
      {
        id: "dressing",
        name: "드레싱 선택",
        source: "dressings",
        required: true,
        multiple: false,
        choices: [],
        deleted: false,
      },
      {
        id: "drinks",
        name: "음료 추가",
        source: "drinks",
        required: false,
        multiple: true,
        choices: [],
        deleted: false,
      },
    ],
    ingredients: INGREDIENTS.map((i) => ({
      id: i.id,
      name: i.name,
      en: i.en,
      description: i.desc,
      price: i.price,
      stage: i.stage,
      color: i.color,
      image: `/images/ingredients/${i.id}.png`,
      category: i.group,
      allergens: i.allergens.join(", "),
      status: "active",
      deleted: false,
    })),
    reviews: Object.values(REVIEWS_SEED)
      .flat()
      .map((r) => ({
        id: r.id,
        sample: true,
        productId: `salad-${r.pid}`,
        title: r.title,
        body: r.text,
        rating: r.stars,
        menu: PRODUCTS[r.pid].name,
        author: r.author,
        date: r.date,
        createdAt: new Date(r.t).toISOString(),
        via: r.via,
        deleted: false,
      })),
    content: {
      ...initialCatalog.content,
      heroTitle: HERO_SLIDES[0].title.join(" "),
      heroDescription: HERO_SLIDES[0].body.join(" "),
      seasonImage: PRODUCTS[9].imageUrl,
    },
  };
}

/** Add customer-only fields without overwriting saved administrator edits. */
export function migrateCatalog(
  catalog: Catalog,
  upgradeLegacy = false,
): Catalog {
  const seed = customerSeed();
  let nextId =
    Math.max(
      11,
      ...catalog.products.map(
        (p) =>
          p.customerId ??
          (/^salad-\d+$/.test(p.id) ? Number(p.id.slice(6)) : -1),
      ),
    ) + 1;
  const products = catalog.products.map((p) => {
    const original = seed.products.find((s) => s.id === p.id);
    const legacy = legacyCatalog.products.find((s) => s.id === p.id);
    const updated = { ...original, ...p };
    if (upgradeLegacy && original && legacy) {
      for (const key of [
        "name",
        "price",
        "description",
        "category",
        "image",
        "allergens",
        "badge",
      ] as const) {
        if (JSON.stringify(p[key]) === JSON.stringify(legacy[key]))
          Object.assign(updated, { [key]: original[key] });
      }
    }
    return {
      ...updated,
      customerId:
        p.type === "salad"
          ? (p.customerId ?? original?.customerId ?? nextId++)
          : undefined,
    };
  });
  const reviews: NonNullable<Catalog["reviews"]> =
    catalog.reviews?.map((r) => ({
      ...r,
      via:
        r.via ??
        (r.menu.includes("매장 픽업")
          ? ("pickup" as const)
          : ("delivery" as const)),
      productId:
        r.productId ??
        catalog.products.find((p) => r.menu.split(" · ")[0] === p.name)?.id,
    })) ?? [];
  if (upgradeLegacy) {
    for (const review of seed.reviews ?? []) {
      if (
        !reviews.some(
          (r) =>
            r.id === review.id ||
            (r.productId === review.productId &&
              r.author === review.author &&
              r.title === review.title),
        )
      )
        if (reviews.length < 500) reviews.push(review);
    }
  }
  return {
    ...catalog,
    products,
    categories: [
      ...new Set([
        ...(catalog.categories ?? seed.categories ?? []),
        ...products
          .filter((p) => p.type === "salad" && !p.deleted)
          .map((p) => p.category),
      ]),
    ],
    ingredients:
      catalog.ingredients?.map((i) => ({
        ...seed.ingredients?.find((s) => s.id === i.id),
        ...i,
      })) ?? seed.ingredients,
    reviews: (catalog.reviews ? reviews : seed.reviews)?.map(normalizeReviewTime),
  };
}
