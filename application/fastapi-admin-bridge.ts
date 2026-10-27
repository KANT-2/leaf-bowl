// Server-side FastAPI admin adapter: application layer only.
// Import exclusively from Next.js route handlers (never client components).
// Deliberately avoids the server-only marker to preserve existing Node route tests.
import { requireAdmin } from "@/modules/identity/guard";
import { readCookie } from "@/modules/identity/cookies";
import { services } from "@/application/container";
import { AppError } from "@/modules/shared/errors";
import { jsonResponse } from "@/infrastructure/http/response";

/** 별도 opt-in을 켜지 않으면 기존 Next.js 관리자 API가 그대로 동작한다. */
export const fastapiAdminEnabled = () => process.env.ADMIN_FASTAPI_BRIDGE_ENABLED === "true";
export const FASTAPI_ADMIN_COOKIE = "lb_admin_fastapi";

type TokenIssue = { access_token?: unknown; token_type?: unknown; expires_in?: unknown };

type JwtPayload = { sub?: unknown; role?: unknown };

function apiOrigin(): string {
  const base = process.env.BACKEND_URL || "http://127.0.0.1:8000";
  const parsed = new URL(base);
  if (
    !["https:", "http:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw new AppError(503, "FastAPI 서버 주소 설정이 올바르지 않습니다.");
  }
  return parsed.origin;
}

function jwtPayload(jwt: string): JwtPayload | null {
  const parts = jwt.split(".");
  if (parts.length !== 3 || !parts.every(Boolean)) {
    return null;
  }
  try {
    const data: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return null;
    }
    return data as JwtPayload;
  } catch {
    return null;
  }
}

function hasCorrectSubject(jwt: string, expectedAdminId: string): boolean {
  const claims = jwtPayload(jwt);
  // JWT의 서명/만료 검증은 FastAPI가 반드시 수행한다.
  // 여기서는 양쪽 관리자 id가 다른 잘못된 연동을 조기에 탐지한다.
  return claims?.role === "admin" && claims.sub === expectedAdminId;
}

function serverUrl(path: string): string {
  if (!path.startsWith("/api/admin/") || path.startsWith("//")) {
    throw new AppError(503, "관리자 API 경로 설정이 올바르지 않습니다.");
  }
  return `${apiOrigin()}${path}`;
}

async function backendFetch(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(serverUrl(path), {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new AppError(502, "FastAPI 관리자 서버에 연결할 수 없습니다.");
  }
}

export async function loginToFastapi(
  loginId: string,
  password: string,
  adminUserId: string,
): Promise<{ token: string; expiresIn: number }> {
  const form = new URLSearchParams({ username: loginId, password });
  const response = await backendFetch("/api/admin/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form.toString(),
  });
  if (response.status === 401 || response.status === 403) {
    throw new AppError(401, "관리자 인증을 확인해주세요.");
  }
  if (!response.ok) {
    throw new AppError(502, "FastAPI 관리자 인증에 실패했습니다.");
  }
  let result: TokenIssue;
  try {
    result = (await response.json()) as TokenIssue;
  } catch {
    throw new AppError(502, "FastAPI 인증 응답이 올바르지 않습니다.");
  }
  const token = result?.access_token;
  const expiresIn = result?.expires_in;
  if (
    typeof token !== "string" ||
    !hasCorrectSubject(token, adminUserId) ||
    typeof expiresIn !== "number" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new AppError(502, "관리자 인증 연동 정보가 일치하지 않습니다.");
  }
  return { token, expiresIn };
}

export async function logoutFromFastapi(token: string): Promise<boolean> {
  try {
    const response = await backendFetch("/api/admin/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    // 이미 로그아웃했거나 만료된 JWT는 클라이언트 쿠키를 지우면 된다.
    return response.ok || response.status === 401;
  } catch {
    return false;
  }
}

function forwardedError(status: number): Response {
  const messages: Record<number, string> = {
    400: "요청 조건을 확인해주세요.",
    401: "관리자 로그인이 필요합니다. 다시 로그인해주세요.",
    403: "관리자 접근 권한이 없습니다.",
    404: "주문을 찾을 수 없습니다.",
    409: "다른 요청으로 주문 상태가 변경되었습니다. 다시 조회해주세요.",
    422: "요청값을 확인해주세요.",
  };
  const safeStatus = Object.prototype.hasOwnProperty.call(messages, status) ? status : 502;
  return Response.json(
    { status: safeStatus, message: messages[safeStatus] ?? "FastAPI 요청을 처리하지 못했습니다." },
    { status: safeStatus, headers: { "Cache-Control": "no-store" } },
  );
}

/** 브라우저에 Bearer 토큰을 노출하지 않는 Next.js 서버→FastAPI 프록시. */
export async function forwardAdminRequest(
  request: Request,
  path: string,
  options: { method?: "GET" | "PATCH"; body?: unknown } = {},
): Promise<Response> {
  const { identity } = services();
  const session = await requireAdmin(request, identity);
  const token = readCookie(request, FASTAPI_ADMIN_COOKIE);
  if (!token || !session.adminUserId || !hasCorrectSubject(token, session.adminUserId)) {
    throw new AppError(401, "FastAPI 관리자 인증이 만료되었습니다. 다시 로그인해주세요.");
  }
  const method = options.method ?? "GET";
  const response = await backendFetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(method === "PATCH" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "PATCH" ? { body: JSON.stringify(options.body ?? {}) } : {}),
  });
  if (!response.ok) {
    return forwardedError(response.status);
  }
  try {
    return jsonResponse(await response.json());
  } catch {
    throw new AppError(502, "FastAPI 응답 형식이 올바르지 않습니다.");
  }
}
