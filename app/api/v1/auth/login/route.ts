import { sessionCookie } from "@/modules/identity/cookies";
import { loginSchema } from "@/modules/identity/guard";
import { ADMIN_COOKIE } from "@/modules/identity/service";
import { services } from "@/modules/container";
import { assertSameOrigin, jsonResponse, parseOrThrow, readJsonBody, run } from "@/modules/shared/http";
import { clientKey } from "@/modules/shared/rate-limit";

export async function POST(request: Request) {
  return run(async () => {
    assertSameOrigin(request);
    const { identity, limits } = services();
    const client = clientKey(request);
    if (client) limits.clientLogin.hit(client);
    const { loginId, password } = parseOrThrow(loginSchema, await readJsonBody(request, 2_000), "아이디와 패스워드를 입력해주세요.");
    // 접속자 구분값은 속일 수 있으므로 계정 단위 제한을 함께 건다 (무차별 대입 방지)
    limits.account.hit(await identity.loginRateKey(loginId));
    const { token, expiresAt } = await identity.login(loginId, password);
    return jsonResponse({ ok: true }, 200, { "Set-Cookie": sessionCookie(ADMIN_COOKIE, token, expiresAt) });
  });
}
