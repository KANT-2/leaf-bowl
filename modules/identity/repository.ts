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
  /** 아직 만료되지 않은 세션 수 (점검·시험용). DB: `SELECT count(*) FROM sessions WHERE kind = $1 AND expires_at > $2` */
  countSessions(kind: SessionRecord["kind"], now: Date): Promise<number>;
  /**
   * 상한 확인과 저장을 **한 번에(원자적으로)** 한다. 유효한 같은 종류의 세션이 이미 max 개 이상이면 저장하지 않고 null.
   * 개수를 먼저 세고 따로 저장하면 동시 요청이 모두 통과해 상한을 넘으므로 이 계약으로 묶는다.
   * DB: 한 문장 `INSERT ... SELECT ... WHERE (SELECT count(*) ...) < $max` 를 `pg_advisory_xact_lock` 아래에서 실행
   * (READ COMMITTED 에서는 잠금 없이는 동시 삽입이 서로의 행을 보지 못한다).
   */
  createSessionWithinLimit(
    session: Omit<SessionRecord, "id">,
    limit: { max: number; now: Date },
  ): Promise<SessionRecord | null>;
}

/** DB 가 준비되기 전까지 쓰는 임시 저장소 (서버를 다시 시작하면 세션이 사라진다) */
export function createMemoryIdentityRepository(
  admins: AdminUserRecord[] = [],
): IdentityRepository {
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
    async createSessionWithinLimit(session, { max, now }) {
      // 세기와 저장 사이에 await 가 없어 이 구간은 끼어들 수 없다 (DB 에서는 위 계약대로 잠금 아래에서)
      let active = 0;
      for (const s of sessions.values())
        if (s.kind === session.kind && s.expiresAt.getTime() > now.getTime())
          active += 1;
      if (active >= max) return null;
      const record = { ...session, id: randomUUID() };
      sessions.set(record.tokenHash, record);
      return { ...record };
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
      for (const s of sessions.values())
        if (s.kind === kind && s.expiresAt.getTime() > now.getTime())
          count += 1;
      return count;
    },
  };
}
