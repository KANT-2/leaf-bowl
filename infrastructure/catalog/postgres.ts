import "server-only";
import type { DatabaseTransaction } from "@/infrastructure/database/prisma";
import { catalogSchema } from "@/modules/catalog/schema";
import type { CatalogState } from "@/modules/catalog/state";

/** Readers share this lock; catalog writers hold it exclusively until commit. */
export async function lockCatalog(tx: DatabaseTransaction, mode: "read" | "write") {
  if (mode === "write") {
    await tx.$queryRaw`SELECT id FROM catalog_meta WHERE id = 1 FOR UPDATE`;
  } else {
    await tx.$queryRaw`SELECT id FROM catalog_meta WHERE id = 1 FOR SHARE`;
  }
}

export async function readCatalogState(tx: DatabaseTransaction): Promise<CatalogState> {
  const meta = await tx.catalogMeta.findUnique({ where: { id: 1 } });
  if (!meta) {
    throw new Error("카탈로그가 초기화되지 않았습니다. npm run db:seed 또는 db:import를 실행해주세요.");
  }
  const [
    products,
    groups,
    ingredients,
    reviews,
    content,
    pages,
    location,
    categories,
    links,
    choices,
    images,
    drinks,
    removed,
  ] = [
    await tx.product.findMany({ orderBy: { sortOrder: "asc" } }),
    await tx.optionGroup.findMany({ orderBy: { sortOrder: "asc" } }),
    await tx.ingredient.findMany({ orderBy: { sortOrder: "asc" } }),
    await tx.review.findMany({ orderBy: { sortOrder: "asc" } }),
    await tx.siteContent.findUniqueOrThrow({ where: { id: 1 } }),
    await tx.seasonPage.findMany({ orderBy: { sortOrder: "asc" } }),
    await tx.storeLocation.findUnique({ where: { id: 1 } }),
    await tx.category.findMany({ orderBy: { sortOrder: "asc" } }),
    await tx.productOptionGroup.findMany({ orderBy: { sortOrder: "asc" } }),
    await tx.optionChoice.findMany({ orderBy: { sortOrder: "asc" } }),
    await tx.reviewImage.findMany({ orderBy: { position: "asc" } }),
    await tx.reviewDrink.findMany({ orderBy: { position: "asc" } }),
    await tx.deletedReviewId.findMany(),
  ];
  // Detect incompatible data instead of silently using seed data.
  const catalog = catalogSchema.parse({
    ...(location
      ? {
          location: {
            name: location.name,
            address: location.address,
            detailAddress: location.detailAddress,
          },
        }
      : {}),
    categories: categories.map((row) => row.name),
    products: products.map((row) => ({
      id: row.id,
      customerId: row.customerId ?? undefined,
      type: row.type,
      name: row.name,
      en: row.nameEn ?? undefined,
      price: row.price,
      description: row.description,
      ingredients: row.ingredients ?? undefined,
      category: row.category,
      status: row.status,
      badge: row.badge,
      image: row.image,
      allergens: row.allergensText,
      deleted: row.deleted,
      isNew: row.isNew ?? undefined,
      optionIds: links.filter((link) => link.productId === row.id).map((link) => link.groupId),
    })),
    groups: groups.map((row) => ({
      id: row.id,
      name: row.name,
      required: row.required,
      multiple: row.multiple,
      source: row.source,
      deleted: row.deleted,
      choices: choices
        .filter((choice) => choice.groupId === row.id)
        .map((choice) => ({
          id: choice.id,
          name: choice.name,
          price: choice.price,
        })),
    })),
    ingredients: ingredients.map((row) => ({
      id: row.id,
      name: row.name,
      en: row.nameEn ?? undefined,
      price: row.price ?? undefined,
      stage: row.stage ?? undefined,
      color: row.color ?? undefined,
      description: row.description,
      image: row.image,
      category: row.category,
      status: row.status,
      deleted: row.deleted,
      allergens: row.allergensText,
      origin: row.origin ?? undefined,
      originDetail: row.originDetail ?? undefined,
    })),
    reviews: reviews.map((row) => ({
      id: row.id,
      productId: row.originalProductId ?? row.productId ?? undefined,
      sample: row.isSample ?? undefined,
      title: row.title,
      body: row.body,
      rating: row.rating,
      menu: row.menu,
      author: row.author,
      date: row.dateLabel,
      via: row.via ?? undefined,
      createdAt: row.createdAt?.toISOString(),
      deleted: row.deleted,
      images: images.filter((image) => image.reviewId === row.id).map((image) => image.image),
      drinks: drinks.filter((drink) => drink.reviewId === row.id).map((drink) => drink.name),
    })),
    content: {
      bannerIncludesOriginals: content.bannerIncludesOriginals,
      bannerVisible: content.bannerVisible,
      ...(content.hasBannerPages ? { bannerPages: content.bannerPages } : {}),
      mainImage: content.mainImage ?? "",
      mainMobileImage: content.mainMobileImage ?? "",
      heroImage: content.heroImage ?? "",
      heroMobileImage: content.heroMobileImage ?? "",
      heroAlt: content.heroAlt ?? "",
      heroHref: content.heroHref ?? "",
      heroTitle: content.heroTitle,
      heroDescription: content.heroDescription,
      seasonTitle: content.seasonTitle,
      seasonDescription: content.seasonDescription,
      seasonImage: content.seasonImage,
      seasonProductId: content.seasonProductId ?? "",
      seasonVisible: content.seasonVisible,
      ...(meta.hasSeasonPages
        ? {
            seasonPages: pages.map((page) => ({
              id: page.id,
              title: page.title,
              description: page.description,
              image: page.image,
              productId: page.productId ?? "",
              visible: page.visible,
            })),
          }
        : {}),
    },
  });
  return {
    catalog,
    revision: meta.revision,
    updatedAt: meta.updatedAt.toISOString(),
    nextCustomerId: meta.nextCustomerId,
    deletedReviewIds: removed.map((row) => row.id),
  };
}

/** Called under the exclusive catalog lock, or the initialization advisory lock. */
export async function saveCatalogState(tx: DatabaseTransaction, state: CatalogState): Promise<void> {
  const catalog = catalogSchema.parse(state.catalog);
  const at = new Date(state.updatedAt);
  await tx.productOptionGroup.deleteMany();
  await tx.optionGroup.deleteMany();
  await tx.review.deleteMany();
  await tx.seasonPage.deleteMany();
  await tx.siteContent.deleteMany();
  await tx.productAllergen.deleteMany();
  await tx.ingredientAllergen.deleteMany();
  await tx.product.deleteMany({
    where: { id: { notIn: catalog.products.map((p) => p.id) } },
  });

  for (const [sortOrder, product] of catalog.products.entries()) {
    const data = {
      customerId: product.customerId ?? null,
      type: product.type,
      name: product.name,
      nameEn: product.en ?? null,
      price: product.price,
      description: product.description,
      ingredients: product.ingredients ?? null,
      category: product.category,
      status: product.status,
      badge: product.badge,
      image: product.image,
      deleted: product.deleted,
      sortOrder,
      allergensText: product.allergens,
      isNew: product.isNew ?? null,
      updatedAt: at,
    };
    await tx.product.upsert({
      where: { id: product.id },
      create: { id: product.id, ...data },
      update: data,
    });
  }
  await tx.optionGroup.createMany({
    data: catalog.groups.map((group, sortOrder) => ({
      id: group.id,
      name: group.name,
      required: group.required,
      multiple: group.multiple,
      source: group.source,
      deleted: group.deleted,
      sortOrder,
    })),
  });
  await tx.optionChoice.createMany({
    data: catalog.groups.flatMap((group) =>
      group.choices.map((choice, sortOrder) => ({
        groupId: group.id,
        ...choice,
        sortOrder,
      })),
    ),
  });
  await tx.productOptionGroup.createMany({
    data: catalog.products.flatMap((product) =>
      product.optionIds.map((groupId, sortOrder) => ({
        productId: product.id,
        groupId,
        sortOrder,
      })),
    ),
    skipDuplicates: true,
  });

  await tx.ingredient.deleteMany({
    where: { id: { notIn: (catalog.ingredients ?? []).map((i) => i.id) } },
  });
  for (const [sortOrder, ingredient] of (catalog.ingredients ?? []).entries()) {
    const data = {
      name: ingredient.name,
      nameEn: ingredient.en ?? null,
      price: ingredient.price ?? null,
      stage: ingredient.stage ?? null,
      color: ingredient.color ?? null,
      description: ingredient.description,
      image: ingredient.image,
      category: ingredient.category,
      status: ingredient.status,
      deleted: ingredient.deleted,
      inBowlMatch: ingredient.stage !== undefined && ingredient.price !== undefined,
      sortOrder,
      allergensText: ingredient.allergens,
      origin: ingredient.origin ?? null,
      originDetail: ingredient.originDetail ?? null,
    };
    await tx.ingredient.upsert({
      where: { id: ingredient.id },
      create: { id: ingredient.id, ...data },
      update: data,
    });
  }
  const splitAllergens = (text: string) => [
    ...new Set(
      text
        .split(/[,·]/)
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];
  const names = [
    ...new Set([...catalog.products, ...(catalog.ingredients ?? [])].flatMap((row) => splitAllergens(row.allergens))),
  ];
  await tx.allergen.createMany({
    data: names.map((name) => ({ name })),
    skipDuplicates: true,
  });
  const allergenIds = new Map(
    (await tx.allergen.findMany({ where: { name: { in: names } } })).map((row) => [row.name, row.id]),
  );
  await tx.productAllergen.createMany({
    data: catalog.products.flatMap((product) =>
      splitAllergens(product.allergens).map((name, position) => ({
        productId: product.id,
        allergenId: allergenIds.get(name)!,
        position,
      })),
    ),
  });
  await tx.ingredientAllergen.createMany({
    data: (catalog.ingredients ?? []).flatMap((ingredient) =>
      splitAllergens(ingredient.allergens).map((name, position) => ({
        ingredientId: ingredient.id,
        allergenId: allergenIds.get(name)!,
        position,
      })),
    ),
  });

  const productIds = new Set(catalog.products.map((product) => product.id));
  await tx.review.createMany({
    data: (catalog.reviews ?? []).map((review, sortOrder) => ({
      id: review.id,
      productId: review.productId && productIds.has(review.productId) ? review.productId : null,
      originalProductId: review.productId ?? null,
      isSample: review.sample ?? null,
      title: review.title,
      body: review.body,
      rating: review.rating,
      menu: review.menu,
      author: review.author,
      dateLabel: review.date,
      createdAt: review.createdAt ? new Date(review.createdAt) : null,
      deleted: review.deleted,
      via: review.via ?? null,
      sortOrder,
    })),
  });
  await tx.reviewImage.createMany({
    data: (catalog.reviews ?? []).flatMap((review) =>
      (review.images ?? []).map((image, position) => ({
        reviewId: review.id,
        image,
        position,
      })),
    ),
  });
  await tx.reviewDrink.createMany({
    data: (catalog.reviews ?? []).flatMap((review) =>
      (review.drinks ?? []).map((name, position) => ({
        reviewId: review.id,
        name,
        position,
      })),
    ),
  });
  const content = catalog.content;
  await tx.siteContent.create({
    data: {
      id: 1,
      bannerPages: content.bannerPages ?? [],
      hasBannerPages: content.bannerPages !== undefined,
      bannerIncludesOriginals: content.bannerIncludesOriginals,
      bannerVisible: content.bannerVisible,
      mainImage: content.mainImage ?? "",
      mainMobileImage: content.mainMobileImage ?? "",
      heroImage: content.heroImage ?? "",
      heroMobileImage: content.heroMobileImage ?? "",
      heroAlt: content.heroAlt ?? "",
      heroHref: content.heroHref ?? "",
      heroTitle: content.heroTitle,
      heroDescription: content.heroDescription,
      seasonTitle: content.seasonTitle,
      seasonDescription: content.seasonDescription,
      seasonImage: content.seasonImage,
      seasonProductId: content.seasonProductId || null,
      seasonVisible: content.seasonVisible,
    },
  });
  await tx.seasonPage.createMany({
    data: (content.seasonPages ?? []).map((page, sortOrder) => ({
      ...page,
      productId: page.productId || null,
      sortOrder,
    })),
  });
  await tx.category.deleteMany();
  await tx.category.createMany({
    data: (catalog.categories ?? []).map((name, sortOrder) => ({
      name,
      sortOrder,
    })),
  });
  await tx.storeLocation.deleteMany();
  if (catalog.location) {
    await tx.storeLocation.create({ data: { id: 1, ...catalog.location } });
  }
  await tx.deletedReviewId.createMany({
    data: state.deletedReviewIds.map((id) => ({ id })),
    skipDuplicates: true,
  });
  const meta = {
    revision: state.revision,
    updatedAt: at,
    nextCustomerId: state.nextCustomerId,
    hasSeasonPages: content.seasonPages !== undefined,
  };
  await tx.catalogMeta.upsert({
    where: { id: 1 },
    create: { id: 1, ...meta },
    update: meta,
  });
}
