import "server-only";
import type { DatabaseTransaction } from "@/infrastructure/database/prisma";
import { catalogSchema, type Catalog } from "@/modules/catalog/schema";
import type { CatalogState } from "@/modules/catalog/state";

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const byId = (row: { id: string }) => row.id;

const allergens = (text: string) => [
  ...new Set(
    text
      .split(/[,·]/)
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];

/** Compare normalized database rows, including their order, before issuing writes. */
async function syncRows<T>(
  previous: T[],
  next: T[],
  key: (row: T) => string,
  operations: {
    remove?: (row: T) => Promise<unknown>;
    put: (row: T) => Promise<unknown>;
  },
) {
  const old = new Map(previous.map((row) => [key(row), row]));
  const retained = new Set(next.map(key));
  for (const row of previous) {
    if (!retained.has(key(row))) {
      await operations.remove?.(row);
    }
  }
  for (const row of next) {
    if (!equal(old.get(key(row)), row)) {
      await operations.put(row);
    }
  }
}

const productRows = (catalog: Catalog) =>
  catalog.products.map((p, sortOrder) => ({
    id: p.id,
    customerId: p.customerId ?? null,
    type: p.type,
    name: p.name,
    nameEn: p.en ?? null,
    price: p.price,
    description: p.description,
    ingredients: p.ingredients ?? null,
    category: p.category,
    status: p.status,
    badge: p.badge,
    image: p.image,
    deleted: p.deleted,
    sortOrder,
    allergensText: p.allergens,
    isNew: p.isNew ?? null,
  }));

const ingredientRows = (catalog: Catalog) =>
  (catalog.ingredients ?? []).map((i, sortOrder) => ({
    id: i.id,
    name: i.name,
    nameEn: i.en ?? null,
    price: i.price ?? null,
    stage: i.stage ?? null,
    color: i.color ?? null,
    description: i.description,
    image: i.image,
    category: i.category,
    status: i.status,
    deleted: i.deleted,
    inBowlMatch: i.stage !== undefined && i.price !== undefined,
    sortOrder,
    allergensText: i.allergens,
    origin: i.origin ?? null,
    originDetail: i.originDetail ?? null,
  }));

const groupRows = (catalog: Catalog) =>
  catalog.groups.map((g, sortOrder) => ({
    id: g.id,
    name: g.name,
    required: g.required,
    multiple: g.multiple,
    source: g.source,
    deleted: g.deleted,
    sortOrder,
  }));

const choiceRows = (catalog: Catalog) =>
  catalog.groups.flatMap((g) => g.choices.map((c, sortOrder) => ({ groupId: g.id, ...c, sortOrder })));

const linkRows = (catalog: Catalog) =>
  catalog.products.flatMap((p) =>
    p.optionIds.map((groupId, sortOrder) => ({
      productId: p.id,
      groupId,
      sortOrder,
    })),
  );

const pageRows = (catalog: Catalog) =>
  (catalog.content.seasonPages ?? []).map((p, sortOrder) => ({
    ...p,
    productId: p.productId || null,
    sortOrder,
  }));

const contentRow = ({ content: c }: Catalog) => ({
  bannerIncludesOriginals: c.bannerIncludesOriginals,
  bannerPages: c.bannerPages ?? [],
  hasBannerPages: c.bannerPages !== undefined,
  bannerVisible: c.bannerVisible,
  mainImage: c.mainImage ?? "",
  mainMobileImage: c.mainMobileImage ?? "",
  heroImage: c.heroImage ?? "",
  heroMobileImage: c.heroMobileImage ?? "",
  heroAlt: c.heroAlt ?? "",
  heroHref: c.heroHref ?? "",
  heroTitle: c.heroTitle,
  heroDescription: c.heroDescription,
  seasonTitle: c.seasonTitle,
  seasonDescription: c.seasonDescription,
  seasonImage: c.seasonImage,
  seasonProductId: c.seasonProductId || null,
  seasonVisible: c.seasonVisible,
});

/** Requires the exclusive catalog lock; initialization remains in saveCatalogState. */
export async function saveCatalogChanges(tx: DatabaseTransaction, previous: CatalogState, state: CatalogState) {
  const old = previous.catalog;
  const next = catalogSchema.parse(state.catalog);
  const at = new Date(state.updatedAt);

  // Insert/update parents first. Deletions wait until their references are synchronized.
  await syncRows(productRows(old), productRows(next), byId, {
    put: (row) =>
      tx.product.upsert({
        where: { id: row.id },
        create: { ...row, updatedAt: at },
        update: { ...row, updatedAt: at },
      }),
  });
  await syncRows(ingredientRows(old), ingredientRows(next), byId, {
    put: (row) => tx.ingredient.upsert({ where: { id: row.id }, create: row, update: row }),
  });
  await syncRows(groupRows(old), groupRows(next), byId, {
    put: (row) =>
      tx.optionGroup.upsert({
        where: { id: row.id },
        create: row,
        update: row,
      }),
  });
  await syncRows(choiceRows(old), choiceRows(next), (row) => JSON.stringify([row.groupId, row.id]), {
    remove: (row) =>
      tx.optionChoice.delete({
        where: { groupId_id: { groupId: row.groupId, id: row.id } },
      }),
    put: (row) =>
      tx.optionChoice.upsert({
        where: { groupId_id: { groupId: row.groupId, id: row.id } },
        create: row,
        update: row,
      }),
  });
  await syncRows(linkRows(old), linkRows(next), (row) => JSON.stringify([row.productId, row.groupId]), {
    remove: (row) =>
      tx.productOptionGroup.delete({
        where: {
          productId_groupId: {
            productId: row.productId,
            groupId: row.groupId,
          },
        },
      }),
    put: (row) =>
      tx.productOptionGroup.upsert({
        where: {
          productId_groupId: {
            productId: row.productId,
            groupId: row.groupId,
          },
        },
        create: row,
        update: row,
      }),
  });

  // Allergen links change only when their source text changes (or an entity is added).
  const changedProducts = next.products.filter(
    (p) => old.products.find((o) => o.id === p.id)?.allergens !== p.allergens,
  );
  const changedIngredients = (next.ingredients ?? []).filter(
    (i) => old.ingredients?.find((o) => o.id === i.id)?.allergens !== i.allergens,
  );
  const names = [...new Set([...changedProducts, ...changedIngredients].flatMap((row) => allergens(row.allergens)))];
  if (names.length) {
    await tx.allergen.createMany({
      data: names.map((name) => ({ name })),
      skipDuplicates: true,
    });
  }
  const ids = new Map(
    (names.length ? await tx.allergen.findMany({ where: { name: { in: names } } }) : []).map((row) => [
      row.name,
      row.id,
    ]),
  );
  for (const product of changedProducts) {
    await tx.productAllergen.deleteMany({ where: { productId: product.id } });
    const data = allergens(product.allergens).map((name, position) => ({
      productId: product.id,
      allergenId: ids.get(name)!,
      position,
    }));
    if (data.length) {
      await tx.productAllergen.createMany({ data });
    }
  }
  for (const ingredient of changedIngredients) {
    await tx.ingredientAllergen.deleteMany({
      where: { ingredientId: ingredient.id },
    });
    const data = allergens(ingredient.allergens).map((name, position) => ({
      ingredientId: ingredient.id,
      allergenId: ids.get(name)!,
      position,
    }));
    if (data.length) {
      await tx.ingredientAllergen.createMany({ data });
    }
  }

  await syncReviews(tx, old, next);
  await syncRows(pageRows(old), pageRows(next), byId, {
    remove: (row) => tx.seasonPage.delete({ where: { id: row.id } }),
    put: (row) => tx.seasonPage.upsert({ where: { id: row.id }, create: row, update: row }),
  });
  if (!equal(contentRow(old), contentRow(next))) {
    await tx.siteContent.update({ where: { id: 1 }, data: contentRow(next) });
  }
  const categories = (catalog: Catalog) => (catalog.categories ?? []).map((name, sortOrder) => ({ name, sortOrder }));
  await syncRows(categories(old), categories(next), (row) => row.name, {
    remove: (row) => tx.category.delete({ where: { name: row.name } }),
    put: (row) =>
      tx.category.upsert({
        where: { name: row.name },
        create: row,
        update: row,
      }),
  });
  if (!equal(old.location, next.location)) {
    if (next.location) {
      await tx.storeLocation.upsert({
        where: { id: 1 },
        create: { id: 1, ...next.location },
        update: next.location,
      });
    } else {
      await tx.storeLocation.deleteMany({ where: { id: 1 } });
    }
  }
  const removedProducts = old.products.filter((p) => !next.products.some((n) => n.id === p.id)).map((p) => p.id);
  const removedIngredients = (old.ingredients ?? [])
    .filter((i) => !next.ingredients?.some((n) => n.id === i.id))
    .map((i) => i.id);
  const removedGroups = old.groups.filter((g) => !next.groups.some((n) => n.id === g.id)).map((g) => g.id);
  if (removedProducts.length) {
    await tx.product.deleteMany({ where: { id: { in: removedProducts } } });
  }
  if (removedIngredients.length) {
    await tx.ingredient.deleteMany({
      where: { id: { in: removedIngredients } },
    });
  }
  if (removedGroups.length) {
    await tx.optionGroup.deleteMany({ where: { id: { in: removedGroups } } });
  }
  const removedReviews = state.deletedReviewIds.filter((id) => !previous.deletedReviewIds.includes(id));
  if (removedReviews.length) {
    await tx.deletedReviewId.createMany({
      data: removedReviews.map((id) => ({ id })),
      skipDuplicates: true,
    });
  }
  await tx.catalogMeta.update({
    where: { id: 1 },
    data: {
      revision: state.revision,
      updatedAt: at,
      nextCustomerId: state.nextCustomerId,
      hasSeasonPages: next.content.seasonPages !== undefined,
    },
  });
}

async function syncReviews(tx: DatabaseTransaction, old: Catalog, next: Catalog) {
  const previous = old.reviews ?? [];
  const incoming = next.reviews ?? [];
  const stored = new Map(
    (await tx.review.findMany({ select: { id: true, sortOrder: true } })).map((row) => [row.id, row.sortOrder]),
  );
  const added = incoming.length - previous.length;
  // Prepending customer reviews preserves every existing row's position and contents.
  const prepended = added >= 0 && previous.every((r, i) => incoming[i + added]?.id === r.id);
  const first = Math.min(0, ...stored.values());
  const rows = (catalog: Catalog, current: boolean) => {
    const products = new Set(catalog.products.map((p) => p.id));
    return (catalog.reviews ?? []).map((r, i) => ({
      id: r.id,
      productId: r.productId && products.has(r.productId) ? r.productId : null,
      originalProductId: r.productId ?? null,
      isSample: r.sample ?? null,
      title: r.title,
      body: r.body,
      rating: r.rating,
      menu: r.menu,
      author: r.author,
      dateLabel: r.date,
      createdAt: r.createdAt ? new Date(r.createdAt) : null,
      deleted: r.deleted,
      via: r.via ?? null,
      sortOrder: current ? stored.get(r.id)! : prepended ? (stored.get(r.id) ?? first - added + i) : i,
    }));
  };
  await syncRows(rows(old, true), rows(next, false), byId, {
    remove: (row) => tx.review.delete({ where: { id: row.id } }),
    put: (row) => tx.review.upsert({ where: { id: row.id }, create: row, update: row }),
  });
  // Cascades already removed the children of deleted reviews.
  const retained = new Set(incoming.map((r) => r.id));
  const images = (catalog: Catalog) =>
    (catalog.reviews ?? [])
      .filter((r) => retained.has(r.id))
      .flatMap((r) =>
        (r.images ?? []).map((image, position) => ({
          reviewId: r.id,
          position,
          image,
        })),
      );

  const drinks = (catalog: Catalog) =>
    (catalog.reviews ?? [])
      .filter((r) => retained.has(r.id))
      .flatMap((r) =>
        (r.drinks ?? []).map((name, position) => ({
          reviewId: r.id,
          position,
          name,
        })),
      );
  await syncRows(images(old), images(next), (row) => JSON.stringify([row.reviewId, row.position]), {
    remove: (row) =>
      tx.reviewImage.delete({
        where: {
          reviewId_position: {
            reviewId: row.reviewId,
            position: row.position,
          },
        },
      }),
    put: (row) =>
      tx.reviewImage.upsert({
        where: {
          reviewId_position: {
            reviewId: row.reviewId,
            position: row.position,
          },
        },
        create: row,
        update: row,
      }),
  });
  await syncRows(drinks(old), drinks(next), (row) => JSON.stringify([row.reviewId, row.position]), {
    remove: (row) =>
      tx.reviewDrink.delete({
        where: {
          reviewId_position: {
            reviewId: row.reviewId,
            position: row.position,
          },
        },
      }),
    put: (row) =>
      tx.reviewDrink.upsert({
        where: {
          reviewId_position: {
            reviewId: row.reviewId,
            position: row.position,
          },
        },
        create: row,
        update: row,
      }),
  });
}
