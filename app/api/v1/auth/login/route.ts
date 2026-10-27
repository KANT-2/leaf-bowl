import { services } from "@/application/container";
import { fastapiAdminEnabled, FASTAPI_ADMIN_COOKIE, loginToFastapi } from "@/application/fastapi-admin-bridge";
import { assertSameOrigin, jsonResponse, parseOrThrow, readJsonBody, run } from "@/infrastructure/http/response";
import { sessionCookie } from "@/modules/identity/cookies";
import { loginRateKey } from "@/modules/identity/crypto";
import { loginSchema } from "@/modules/identity/guard";
import { ADMIN_COOKIE } from "@/modules/identity/service";
import { clientKey } from "@/modules/shared/rate-limit";

export async function POST(request: Request) {
  return run(async () => {
    assertSameOrigin(request);
    const { identity, limits } = services();
    limits.globalLogin.hit("all");
    const client = clientKey(request);
    if (client) {
      limits.clientLogin.hit(client);
    }
    const { loginId, password } = parseOrThrow(
      loginSchema,
      await readJsonBody(request, 2_000),
      "아이디와 패스워드를 입력해주세요.",
    );
    limits.account.hit(loginRateKey(loginId));
    const { token, expiresAt, session } = await identity.login(loginId, password);

    // Feature flag 미설정이면 기존 lb_admin 로그인/관리 기능 그대로 유지.
    if (!fastapiAdminEnabled()) {
      return jsonResponse({ ok: true }, 200, {
        "Set-Cookie": sessionCookie(ADMIN_COOKIE, token, expiresAt),
      });
    }

    try {
      const fastapi = await loginToFastapi(loginId, password, session.adminUserId!);
      const backendExpiry = new Date(Date.now() + fastapi.expiresIn * 1000);
      const cookieExpiry = backendExpiry < expiresAt ? backendExpiry : expiresAt;
      return jsonResponse({ ok: true }, 200, {
        "Set-Cookie": [
          sessionCookie(ADMIN_COOKIE, token, expiresAt),
          sessionCookie(FASTAPI_ADMIN_COOKIE, fastapi.token, cookieExpiry),
        ],
      });
    } catch (error) {
      // 두 시스템 인증 중 하나라도 실패하면 Next 세션도 폐기(부분 로그인 방지).
      await identity.logout(token);
      throw error;
    }
  });
}
