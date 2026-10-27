// Server-side FastAPI member check: application layer only.
// Import exclusively from Next.js route handlers (never client components).
// Deliberately avoids the server-only marker to preserve existing Node route tests.
import { apiOrigin } from "@/application/fastapi-admin-bridge";
import { AppError } from "@/modules/shared/errors";

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;
const RELOGIN = "로그인이 필요합니다. 다시 로그인해주세요.";
const UNAVAILABLE = "회원 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.";

/**
 * 회원 토큰(Authorization: Bearer)이 있으면 FastAPI GET /api/me 로 확인한 회원 id, 없으면 null.
 * 서명·만료·로그아웃 여부는 FastAPI 가 판단한다. 브라우저가 보낸 프로필·이메일은 권한 근거가 아니다.
 */
export async function resolveMemberId(request: Request): Promise<bigint | null> {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }
  const token = BEARER.exec(header)?.[1];
  if (!token) {
    throw new AppError(401, RELOGIN);
  }
  let response: Response;
  try {
    response = await fetch(`${apiOrigin()}/api/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (cause) {
    if (cause instanceof AppError) {
      throw cause;
    }
    throw new AppError(503, UNAVAILABLE);
  }
  if (response.status === 401) {
    throw new AppError(401, RELOGIN);
  }
  const body = response.ok ? await response.json().catch(() => null) : null;
  if (!Number.isSafeInteger(body?.id) || body.id <= 0) {
    throw new AppError(503, UNAVAILABLE);
  }
  return BigInt(body.id);
}
