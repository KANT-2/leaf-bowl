import "server-only";
import { prisma, type DatabaseTransaction } from "@/infrastructure/database/prisma";
import { lockCatalog, readCatalogState } from "@/infrastructure/catalog/postgres";
import { expiredImageFiles, imageExists, removeExpiredFile, removeImage } from "@/infrastructure/images/files";
import { catalogImageKeys, eventImageKeys } from "@/modules/images/references";
import { eventsSchema } from "@/modules/events/schema";
import { AppError } from "@/modules/shared/errors";
import type { Catalog } from "@/modules/catalog/schema";

/** New references cannot resurrect a file that a concurrent maintenance pass already removed. */
export async function validateNewImages(previous: Catalog, next: Catalog) {
  await validateNewImageKeys(catalogImageKeys(previous), catalogImageKeys(next));
}

export async function validateNewImageKeys(previous: ReadonlySet<string>, next: ReadonlySet<string>) {
  for (const key of next) {
    if (!previous.has(key) && !(await imageExists(key))) {
      throw new AppError(400, "이미지가 만료되었거나 삭제되었습니다. 다시 올린 뒤 저장해주세요.");
    }
  }
}

async function referenced(tx: DatabaseTransaction) {
  await lockCatalog(tx, "write");
  const catalog = catalogImageKeys((await readCatalogState(tx)).catalog);
  const events = await tx.adminEventSettings.findUniqueOrThrow({ where: { id: 1 } });
  return new Set([...catalog, ...eventImageKeys(eventsSchema.parse(events.events))]);
}

/** Filesystem changes are never retried inside databaseTransaction's retry callback. */
export async function cleanupCatalogImages(candidates: string[]) {
  if (!candidates.length) {
    return;
  }
  await prisma().$transaction(
    async (tx) => {
      const used = await referenced(tx);
      for (const key of candidates) {
        if (!used.has(key)) {
          await removeImage(key);
        }
      }
    },
    { timeout: 20_000 },
  );
}

/** Holds the catalog lock through the reference check and deletion; writers validate added references. */
export async function pruneExpiredImages(apply = false) {
  return prisma().$transaction(
    async (tx) => {
      const used = await referenced(tx);
      const candidates = await expiredImageFiles(Date.now(), 2000, used);
      if (apply) {
        for (const key of candidates) {
          await removeExpiredFile(key);
        }
      }
      return { candidates: candidates.length, applied: apply };
    },
    { timeout: 20_000 },
  );
}

let lastPruneAt = 0;

export async function maintainImages(removed: string[] = []) {
  try {
    await cleanupCatalogImages(removed);
    if (Date.now() - lastPruneAt >= 5 * 60_000) {
      lastPruneAt = Date.now();
      await pruneExpiredImages(true);
    }
  } catch (error) {
    // A committed catalog edit stays successful; the maintenance command can retry cleanup.
    console.error("[images] maintenance failed", (error as NodeJS.ErrnoException).code ?? "storage-error");
  }
}
