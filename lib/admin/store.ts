import "server-only";
import path from "node:path";
import { databaseTransaction, prisma } from "@/lib/prisma";
import type { Catalog, Snapshot } from "./catalog";
import { addReview, replaceCatalog, snapshot, type ReviewInput } from "./catalog-state";
import { lockCatalog, readCatalogState, saveCatalogState, type CatalogMutation } from "./postgres-catalog";

/** Images continue to use the persistent application data directory. */
export const dataDirectory = () => process.env.ADMIN_DATA_DIR || path.resolve(process.cwd(), ".data/admin");

export function readCatalog(): Promise<Snapshot> {
  return databaseTransaction(prisma(), async tx => {
    await lockCatalog(tx, "read");
    return snapshot(await readCatalogState(tx));
  });
}

export function writeCatalog(catalog: Catalog, revision: number): Promise<Snapshot | null> {
  return databaseTransaction(prisma(), async tx => {
    await lockCatalog(tx, "write");
    const current = await readCatalogState(tx);
    if (current.revision !== revision) return null;
    const next = replaceCatalog(current, catalog);
    await saveCatalogState(tx, next);
    return snapshot(next);
  });
}

/** Legacy product PATCH applies partial changes without a read/write race. */
export function mutateCatalog(mutate: CatalogMutation): Promise<Snapshot | null> {
  return databaseTransaction(prisma(), async tx => {
    await lockCatalog(tx, "write");
    const current = await readCatalogState(tx);
    const catalog = mutate(current.catalog);
    if (!catalog) return null;
    const next = replaceCatalog(current, catalog);
    await saveCatalogState(tx, next);
    return snapshot(next);
  });
}

export function appendCustomerReview(input: ReviewInput): Promise<Snapshot> {
  return databaseTransaction(prisma(), async tx => {
    await lockCatalog(tx, "write");
    const current = await readCatalogState(tx);
    const next = addReview(current, input);
    if (next !== current) await saveCatalogState(tx, next);
    return snapshot(next);
  });
}
