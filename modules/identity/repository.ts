import { randomUUID } from "node:crypto";

export interface AdminUserRecord {
  id: string;
  loginId: string;
  passwordHash: string;
}

export interface SessionRecord {
  id: string;
  tokenHash: string;
  kind: "admin" | "guest";
  adminUserId: string | null;
  expiresAt: Date;
}

/** db/schema.sql 의 admin_users·sessions 에 대응하는 저장소 계약 */
export interface IdentityRepository {
  findAdminByLoginId(loginId: string): Promise<AdminUserRecord | null>;
  createSession(session: Omit<SessionRecord, "id">): Promise<SessionRecord>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  deleteSessionByTokenHash(tokenHash: string): Promise<void>;
  /** 만료된 세션을 지우고 지운 개수를 돌려준다. DB: `DELETE FROM sessions WHERE expires_at <= $1` (idx_sessions_expires) */
  purgeExpired(now: Date): Promise<number>;
  /** 아직 만료되지 않은 세션 수. 발급 상한 검사용. DB: `SELECT count(*) FROM sessions WHERE kind = $1 AND expires_at > $2` */
  countSessions(kind: SessionRecord["kind"], now: Date): Promise<number>;
}

/** DB 가 준비되기 전까지 쓰는 임시 저장소 (서버를 다시 시작하면 세션이 사라진다) */
export function createMemoryIdentityRepository(admins: AdminUserRecord[] = []): IdentityRepository {
  const sessions = new Map<string, SessionRecord>();
  return {
    async findAdminByLoginId(loginId) {
      return admins.find((a) => a.loginId === loginId) ?? null;
    },
    async createSession(session) {
      const record = { ...session, id: randomUUID() };
      sessions.set(record.tokenHash, record);
      return { ...record };
    },
    async findSessionByTokenHash(tokenHash) {
      const s = sessions.get(tokenHash);
      return s ? { ...s } : null;
    },
    async deleteSessionByTokenHash(tokenHash) {
      sessions.delete(tokenHash);
    },
    async purgeExpired(now) {
      let removed = 0;
      for (const [key, s] of sessions) {
        if (s.expiresAt.getTime() <= now.getTime()) {
          sessions.delete(key);
          removed += 1;
        }
      }
      return removed;
    },
    async countSessions(kind, now) {
      let count = 0;
      for (const s of sessions.values()) if (s.kind === kind && s.expiresAt.getTime() > now.getTime()) count += 1;
      return count;
    },
  };
}
