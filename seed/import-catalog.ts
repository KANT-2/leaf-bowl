import "server-only";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import type { PrismaClient } from "@/generated/prisma/client";
import { databaseTransaction } from "@/infrastructure/database/prisma";
import { catalogSchema, type Catalog } from "@/modules/catalog/schema";
import { migrateCatalog } from "@/seed/legacy/catalog";
import { saveCatalogState } from "@/infrastructure/catalog/postgres";

export async function importCatalogFile(db: PrismaClient, filename: string) {
  const raw = await readFile(filename);
  const checksum = createHash("sha256").update(raw).digest("hex");
  const stored = JSON.parse(raw.toString("utf8")) as {
    catalog: Catalog;
    revision: number;
    updatedAt: string;
    schemaVersion?: number;
    nextCustomerId?: number;
    deletedReviewIds?: string[];
  };
  if (!Number.isSafeInteger(stored.revision) || stored.revision < 1 || !Number.isFinite(Date.parse(stored.updatedAt))) {
    throw new Error("카탈로그 버전·시각이 올바르지 않습니다.");
  }
  if (stored.schemaVersion !== undefined && ![1, 2, 3, 4].includes(stored.schemaVersion)) {
    throw new Error("지원하지 않는 카탈로그 형식입니다.");
  }
  const deletedReviewIds = stored.deletedReviewIds ?? [];
  if (
    !Array.isArray(deletedReviewIds) ||
    deletedReviewIds.some((id) => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(id))
  ) {
    throw new Error("리뷰 삭제 이력을 확인해주세요.");
  }
  const catalog = catalogSchema.parse(
    migrateCatalog(stored.catalog, stored.schemaVersion !== 3 && stored.schemaVersion !== 4),
  );
  const removed = new Set(deletedReviewIds);
  catalog.reviews = catalog.reviews?.filter((review) => !removed.has(review.id));
  const nextCustomerId = Math.max(
    12,
    stored.nextCustomerId ?? 12,
    ...catalog.products.map((p) => (p.customerId ?? -1) + 1),
  );
  if (!Number.isSafeInteger(nextCustomerId)) {
    throw new Error("다음 상품 번호를 확인해주세요.");
  }
  const backup = `${filename}.postgres-backup.${checksum}.json`;
  try {
    await writeFile(backup, raw, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
    if (!raw.equals(await readFile(backup))) {
      throw new Error("기존 백업 파일 내용이 일치하지 않습니다.");
    }
  }
  const imported = await databaseTransaction(db, async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(910000)::text`;
    if (await tx.catalogImport.findUnique({ where: { checksum } })) {
      return false;
    }
    if ((await tx.catalogMeta.count()) || (await tx.product.count()) || (await tx.order.count())) {
      throw new Error("DB에 데이터가 있습니다. 기존 DB를 덮어쓰지 않습니다.");
    }
    await saveCatalogState(tx, {
      catalog,
      revision: stored.revision,
      updatedAt: stored.updatedAt,
      nextCustomerId,
      deletedReviewIds,
    });
    await tx.catalogImport.create({ data: { checksum } });
    return true;
  });
  return {
    imported,
    backup,
    products: catalog.products.length,
    reviews: catalog.reviews?.length ?? 0,
    revision: stored.revision,
  };
}
