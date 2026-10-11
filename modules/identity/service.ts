import { AppError } from "../shared/errors";
import { hashPassword, hashToken, newSessionToken, verifyPassword } from "./crypto";
import type { IdentityRepository, SessionRecord } from "./repository";

export const GUEST_SESSION_MS = 30 * 24 * 3600_000;
export const ADMIN_SESSION_MS = 8 * 3600_000;

export const GUEST_COOKIE = "lb_guest";
export const ADMIN_COOKIE = "lb_admin";

const LOGIN_FAILED = "아이디 혹은 패스워드가 다릅니다";

/** 동시에 유효한 비회원 세션의 상한. 넘으면 새 세션을 만들지 않는다 (저장량 폭주 방지) */
export const MAX_GUEST_SESSIONS = 10_000;
/** 만료된 세션을 쓸어내는 간격 */
export const PURGE_INTERVAL_MS = 60_000;

export interface IdentityDeps {
  repository: IdentityRepository;
  now?: () => Date;
  maxGuestSessions?: number;
  purgeIntervalMs?: number;
}

export function createIdentityService({
  repository,
  now = () => new Date(),
  maxGuestSessions = MAX_GUEST_SESSIONS,
  purgeIntervalMs = PURGE_INTERVAL_MS,
}: IdentityDeps) {
  // 없는 아이디도 같은 시간이 걸리도록 비교용 해시를 하나 준비한다 (아이디 존재 여부 노출 방지)
  const dummyHash = hashPassword("not-a-real-password");

  // 만료된 세션은 해당 토큰으로 다시 접근할 때만 지워지므로, 발급할 때 간격마다 한 번씩 쓸어낸다
  let lastPurgeAt = -Infinity;
  async function purgeIfDue(force = false): Promise<void> {
    const at = now();
    if (!force && at.getTime() - lastPurgeAt < purgeIntervalMs) return;
    lastPurgeAt = at.getTime();
    await repository.purgeExpired(at);
  }

  /** maxActive 가 있으면 상한 확인과 저장을 한 번에 한다. 가득 차 저장하지 못하면 null */
  async function issue(kind: SessionRecord["kind"], adminUserId: string | null, ttlMs: number, maxActive?: number) {
    const token = newSessionToken();
    const at = now();
    const expiresAt = new Date(at.getTime() + ttlMs);
    const record = { tokenHash: hashToken(token), kind, adminUserId, expiresAt };
    const session =
      maxActive === undefined
        ? await repository.createSession(record)
        : await repository.createSessionWithinLimit(record, { max: maxActive, now: at });
    return session ? { token, expiresAt, session } : null;
  }

  return {
    async issueGuestSession() {
      await purgeIfDue();
      let issued = await issue("guest", null, GUEST_SESSION_MS, maxGuestSessions);
      if (!issued) {
        await purgeIfDue(true); // 가득 찼으면 만료된 세션을 바로 정리하고 한 번 더 시도한다
        issued = await issue("guest", null, GUEST_SESSION_MS, maxGuestSessions);
      }
      if (!issued) throw new AppError(503, "현재 접속이 많아 잠시 후 다시 시도해주세요.");
      return issued;
    },

    async login(loginId: string, password: string) {
      await purgeIfDue();
      const admin = await repository.findAdminByLoginId(loginId);
      const ok = await verifyPassword(password, admin?.passwordHash ?? (await dummyHash));
      if (!admin || !ok) throw new AppError(401, LOGIN_FAILED);
      return issue("admin", admin.id, ADMIN_SESSION_MS) as Promise<NonNullable<Awaited<ReturnType<typeof issue>>>>;
    },

    /** 쿠키의 원본 토큰으로 유효한 세션을 찾는다. 없거나 만료되었거나 종류가 다르면 null */
    async resolve(token: string | undefined, kind: SessionRecord["kind"]): Promise<SessionRecord | null> {
      if (!token) return null;
      const session = await repository.findSessionByTokenHash(hashToken(token));
      if (!session || session.kind !== kind) return null;
      if (session.expiresAt.getTime() <= now().getTime()) {
        await repository.deleteSessionByTokenHash(session.tokenHash);
        return null;
      }
      return session;
    },

    async logout(token: string | undefined) {
      if (token) await repository.deleteSessionByTokenHash(hashToken(token));
    },
  };
}

export type IdentityService = ReturnType<typeof createIdentityService>;
