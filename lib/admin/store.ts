import "server-only";
import path from "node:path";
import { readAppDefaults } from "@/lib/data/server";
import { databaseTransaction, prisma } from "@/lib/prisma";
import type { Catalog, Snapshot } from "./catalog";
import { addReview, replaceCatalog, snapshot, type ReviewInput } from "./catalog-state";
import { lockCatalog, readCatalogState, type CatalogMutation } from "./postgres-catalog";
import { saveCatalogChanges } from "./catalog-changes";

/** Images continue to use the persistent application data directory. */
export const dataDirectory = () => process.env.ADMIN_DATA_DIR || path.resolve(process.cwd(), ".data/admin");

export function readCatalog(): Promise<Snapshot> {
  return databaseTransaction(prisma(), async tx => {
    await lockCatalog(tx, "read");
    return { ...snapshot(await readCatalogState(tx)), defaults: await readAppDefaults(tx) };
  });
}

export function writeCatalog(catalog: Catalog, revision: number): Promise<Snapshot | null> {
  return databaseTransaction(prisma(), async tx => {
    await lockCatalog(tx, "write");
    const current = await readCatalogState(tx);
    if (current.revision !== revision) return null;
    const next = replaceCatalog(current, catalog);
    await saveCatalogChanges(tx, current, next);
    return snapshot(next);
  });
}

/** Legacy product PATCH applies partial changes without a read/write race. */
export function mutateCatalog(mutate: CatalogMutation): Promise<Snapshot | null> {
  return databaseTransaction(prisma(), async tx => {
    await lockCatalog(tx, "write");
    const current = await readCatalogState(tx);
    // 기존 PATCH 콜백은 객체를 직접 수정하므로 비교 기준은 보존한다.
    const catalog = mutate(structuredClone(current.catalog));
    if (!catalog) return null;
    const next = replaceCatalog(current, catalog);
    await saveCatalogChanges(tx, current, next);
    return snapshot(next);
  });
}

export function appendCustomerReview(input: ReviewInput): Promise<Snapshot> {
  return databaseTransaction(prisma(), async tx => {
    await lockCatalog(tx, "write");
    const current = await readCatalogState(tx);
    const next = addReview(current, input);
    if (next !== current) await saveCatalogChanges(tx, current, next);
    return snapshot(next);
  });
}
