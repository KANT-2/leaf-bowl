import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import {
  BodyTooLarge,
  readLimited,
  sameOrigin,
} from "@/infrastructure/http/request";
import { AppError, errorBody } from "@/modules/shared/errors";
import { toJson } from "@/modules/shared/json";

const NO_STORE = { "Cache-Control": "no-store" };

export function jsonResponse(
  data: unknown,
  status = 200,
  headers: Record<string, string | string[]> = {},
): Response {
  const h = new Headers(NO_STORE);
  for (const [k, v] of Object.entries(headers))
    for (const value of [v].flat()) h.append(k, value);
  return Response.json(toJson(data), { status, headers: h });
}

export function errorResponse(error: unknown): Response {
  const body = errorBody(error);
  // 예상하지 못한 오류는 운영에서 원인을 찾을 수 있게 서버 로그에 남긴다 (요청 본문·연락처는 남기지 않는다)
  if (!(error instanceof AppError)) {
    console.error(
      "[api] unexpected error:",
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
  }
  return Response.json(body, { status: body.status, headers: NO_STORE });
}

/** 다른 사이트에서 보낸 쓰기 요청 거부 (CSRF 방어) */
export function assertSameOrigin(request: Request): void {
  if (!sameOrigin(request))
    throw new AppError(403, "허용되지 않은 요청입니다.");
}

/** 본문이 없으면 {} 로 본다 (취소·로그아웃처럼 본문이 선택인 요청) */
export async function readJsonBody(
  request: Request,
  maxBytes = 32_000,
): Promise<unknown> {
  let text: string;
  try {
    text = new TextDecoder().decode(await readLimited(request, maxBytes));
  } catch (e) {
    if (e instanceof BodyTooLarge)
      throw new AppError(413, "요청이 너무 큽니다.");
    throw e;
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, "요청 형식이 올바르지 않습니다.");
  }
}

/** zod 검사 실패는 첫 번째 안내 문구를 400 으로 돌려준다 */
export function parseOrThrow<T>(
  schema: {
    safeParse(
      v: unknown,
    ):
      | { success: true; data: T }
      | { success: false; error: { issues: { message: string }[] } };
  },
  value: unknown,
  fallback: string,
): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const custom = result.error.issues.find((i) =>
    /[가-힣]/.test(i.message),
  )?.message;
  throw new AppError(400, custom ?? fallback);
}

/** route.ts 의 공통 껍데기: AppError 와 예상 못 한 오류를 같은 에러 포맷으로 바꾼다 (Next.js 내부 오류 제외) */
export async function run(fn: () => Promise<Response>): Promise<Response> {
  try {
    // Service construction can open a DB connection before cookies/headers are read.
    // Exclude the whole API operation from prerendering before invoking it.
    await connection();
    return await fn();
  } catch (e) {
    // request.headers 접근 등 Next.js 가 빌드·렌더 중 제어용으로 던지는 오류는 가로채지 않고 그대로 넘긴다
    unstable_rethrow(e);
    return errorResponse(e);
  }
}
