import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { databaseTransaction } from "@/infrastructure/database/prisma";
import type { IdentityRepository, SessionRecord } from "@/modules/identity/repository";

const record = (row: {
  id: string;
  tokenHash: string;
  kind: string;
  adminUserId: string | null;
  expiresAt: Date;
}): SessionRecord => ({
  id: row.id,
  tokenHash: row.tokenHash,
  kind: row.kind as SessionRecord["kind"],
  adminUserId: row.adminUserId,
  expiresAt: row.expiresAt,
});

export function createPostgresIdentityRepository(db: PrismaClient): IdentityRepository {
  return {
    findAdminByLoginId: (loginId) => db.adminUser.findFirst({ where: { loginId, disabled: false } }),
    async createSession(session) {
      return record(await db.session.create({ data: session }));
    },
    async findSessionByTokenHash(tokenHash) {
      const row = await db.session.findUnique({
        where: { tokenHash },
        include: { admin: { select: { disabled: true } } },
      });
      return row && !row.admin?.disabled ? record(row) : null;
    },
    async deleteSessionByTokenHash(tokenHash) {
      await db.session.deleteMany({ where: { tokenHash } });
    },
    async purgeExpired(now) {
      return (await db.session.deleteMany({ where: { expiresAt: { lte: now } } })).count;
    },
    countSessions: (kind, now) => db.session.count({ where: { kind, expiresAt: { gt: now } } }),
    createSessionWithinLimit: (session, { max, now }) =>
      databaseTransaction(db, async (tx) => {
        // Serialize the count and insertion across every application process.
        const key = session.kind === "guest" ? 910_001 : 910_002;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${key})::text`;
        const count = await tx.session.count({
          where: { kind: session.kind, expiresAt: { gt: now } },
        });
        return count >= max ? null : record(await tx.session.create({ data: session }));
      }),
  };
}
