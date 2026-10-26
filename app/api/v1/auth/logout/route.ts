import { services } from "@/application/container";
import { fastapiAdminEnabled, FASTAPI_ADMIN_COOKIE, logoutFromFastapi } from "@/application/fastapi-admin-bridge";
import { assertSameOrigin, jsonResponse, run } from "@/infrastructure/http/response";
import { clearedCookie, readCookie } from "@/modules/identity/cookies";
import { ADMIN_COOKIE } from "@/modules/identity/service";

export async function POST(request: Request) {
  return run(async () => {
    assertSameOrigin(request);
    const nextToken = readCookie(request, ADMIN_COOKIE);
    const fastapiToken = readCookie(request, FASTAPI_ADMIN_COOKIE);
    await services().identity.logout(nextToken);

    const backendRevoked = fastapiAdminEnabled() && fastapiToken
      ? await logoutFromFastapi(fastapiToken)
      : true;
    const cookies = [clearedCookie(ADMIN_COOKIE), clearedCookie(FASTAPI_ADMIN_COOKIE)];
    if (!backendRevoked) {
      // 로컬 쿠키는 제거하고 로그아웃 서버 토큰 폐기 실패 사실은 숨기지 않는다.
      return jsonResponse(
        { status: 503, message: "서버 토큰 폐기를 확인하지 못했습니다. 다시 로그인 전 관리자에게 문의해주세요." },
        503,
        { "Set-Cookie": cookies },
      );
    }
    return jsonResponse({ ok: true }, 200, { "Set-Cookie": cookies });
  });
}
