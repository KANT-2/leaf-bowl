import { z } from "zod";
import { AppError } from "../shared/errors";
import { readCookie } from "./cookies";
import type { SessionRecord } from "./repository";
import { ADMIN_COOKIE, GUEST_COOKIE, type IdentityService } from "./service";

export const loginSchema = z
  .object({
    loginId: z.string().trim().min(1).max(50),
    password: z.string().min(1).max(200),
  })
  .strict();

/** 비회원 세션이 필요한 API 의 진입점 검사 */
export async function requireGuest(
  request: Request,
  identity: IdentityService,
): Promise<SessionRecord> {
  const session = await identity.resolve(
    readCookie(request, GUEST_COOKIE),
    "guest",
  );
  if (!session)
    throw new AppError(
      401,
      "세션이 없거나 만료되었습니다. 페이지를 새로 고쳐주세요.",
    );
  return session;
}

/** 관리자 세션이 필요한 API 의 진입점 검사 */
export async function requireAdmin(
  request: Request,
  identity: IdentityService,
): Promise<SessionRecord> {
  const session = await identity.resolve(
    readCookie(request, ADMIN_COOKIE),
    "admin",
  );
  if (!session?.adminUserId) throw new AppError(401, "로그인이 필요합니다.");
  return session;
}
