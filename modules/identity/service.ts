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

  async function issue(kind: SessionRecord["kind"], adminUserId: string | null, ttlMs: number) {
    const token = newSessionToken();
    const expiresAt = new Date(now().getTime() + ttlMs);
    const session = await repository.createSession({
      tokenHash: hashToken(token),
      kind,
      adminUserId,
      expiresAt,
    });
    return { token, expiresAt, session };
  }

  return {
    async issueGuestSession() {
      await purgeIfDue();
      if ((await repository.countSessions("guest", now())) >= maxGuestSessions) {
        throw new AppError(503, "현재 접속이 많아 잠시 후 다시 시도해주세요.");
      }
      return issue("guest", null, GUEST_SESSION_MS);
    },

    /**
     * 로그인 시도 제한에 쓰는 계정 단위 키. 존재하는 계정은 계정별로, 없는 아이디는 모두 한 칸으로 묶는다.
     * 그래야 임의의 아이디를 무한히 보내도 제한기의 키가 늘지 않고, 실제 계정의 카운터를 밀어내지도 못한다.
     */
    async loginRateKey(loginId: string): Promise<string> {
      const admin = await repository.findAdminByLoginId(loginId);
      return admin ? `account:${admin.id}` : "account:unknown";
    },

    async login(loginId: string, password: string) {
      await purgeIfDue();
      const admin = await repository.findAdminByLoginId(loginId);
      const ok = await verifyPassword(password, admin?.passwordHash ?? (await dummyHash));
      if (!admin || !ok) throw new AppError(401, LOGIN_FAILED);
      return issue("admin", admin.id, ADMIN_SESSION_MS);
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
