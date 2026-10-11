import "server-only";
import path from "node:path";
import { readAppDefaults } from "@/infrastructure/settings/postgres";
import { databaseTransaction, prisma } from "@/infrastructure/database/prisma";
import { type Catalog, type Snapshot } from "@/modules/catalog/schema";
import { addReview, replaceCatalog, snapshot, type ReviewInput } from "@/modules/catalog/state";
import { lockCatalog, readCatalogState } from "@/infrastructure/catalog/postgres";
import { saveCatalogChanges } from "@/infrastructure/catalog/changes";

export type CatalogMutation = (catalog: Catalog) => Catalog | null;

/** Images continue to use the persistent application data directory. */
export const dataDirectory = () => process.env.ADMIN_DATA_DIR || path.resolve(process.cwd(), ".data/admin");

export function readCatalog(): Promise<Snapshot> {
  return databaseTransaction(prisma(), async (tx) => {
    await lockCatalog(tx, "read");
    return {
      ...snapshot(await readCatalogState(tx)),
      defaults: await readAppDefaults(tx),
    };
  });
}

export function writeCatalog(catalog: Catalog, revision: number): Promise<Snapshot | null> {
  return databaseTransaction(prisma(), async (tx) => {
    await lockCatalog(tx, "write");
    const current = await readCatalogState(tx);
    if (current.revision !== revision) {
      return null;
    }
    const next = replaceCatalog(current, catalog, new Date().toISOString());
    await saveCatalogChanges(tx, current, next);
    return { ...snapshot(next), defaults: await readAppDefaults(tx) };
  });
}

/** Legacy product PATCH applies partial changes without a read/write race. */
export function mutateCatalog(mutate: CatalogMutation): Promise<Snapshot | null> {
  return databaseTransaction(prisma(), async (tx) => {
    await lockCatalog(tx, "write");
    const current = await readCatalogState(tx);
    // 기존 PATCH 콜백은 객체를 직접 수정하므로 비교 기준은 보존한다.
    const catalog = mutate(structuredClone(current.catalog));
    if (!catalog) {
      return null;
    }
    const next = replaceCatalog(current, catalog, new Date().toISOString());
    await saveCatalogChanges(tx, current, next);
    return { ...snapshot(next), defaults: await readAppDefaults(tx) };
  });
}

export function appendCustomerReview(input: ReviewInput): Promise<Snapshot> {
  return databaseTransaction(prisma(), async (tx) => {
    await lockCatalog(tx, "write");
    const current = await readCatalogState(tx);
    const next = addReview(current, input, new Date().toISOString());
    if (next !== current) {
      await saveCatalogChanges(tx, current, next);
    }
    return { ...snapshot(next), defaults: await readAppDefaults(tx) };
  });
}
