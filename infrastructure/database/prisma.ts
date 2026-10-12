import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";

export type DatabaseTransaction = Prisma.TransactionClient;

export function createPrismaClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 20_000,
  });
  return new PrismaClient({ adapter });
}

const state = globalThis as unknown as { leafBowlPrisma?: PrismaClient };

export function prisma(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL을 설정하고 DB migration·seed를 실행해주세요.");
  }
  return (state.leafBowlPrisma ??= createPrismaClient(process.env.DATABASE_URL));
}

/** Retry only transactions whose callbacks contain database work. */
export async function databaseTransaction<T>(
  database: PrismaClient,
  work: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await database.$transaction(work, {
        maxWait: 5_000,
        timeout: 20_000,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt >= 2) {
        throw error;
      }
    }
  }
}
