import { sessionCookie } from "@/modules/identity/cookies";
import { loginRateKey } from "@/modules/identity/crypto";
import { loginSchema } from "@/modules/identity/guard";
import { ADMIN_COOKIE } from "@/modules/identity/service";
import { services } from "@/application/container";
import { assertSameOrigin, jsonResponse, parseOrThrow, readJsonBody, run } from "@/infrastructure/http/response";
import { clientKey } from "@/modules/shared/rate-limit";

export async function POST(request: Request) {
  return run(async () => {
    assertSameOrigin(request);
    const { identity, limits } = services();
    // 비밀번호 검사는 CPU 를 쓰므로 접속자·아이디와 무관한 전체 한도로 총량도 제한한다
    limits.globalLogin.hit("all");
    const client = clientKey(request);
    if (client) limits.clientLogin.hit(client);
    const { loginId, password } = parseOrThrow(loginSchema, await readJsonBody(request, 2_000), "아이디와 패스워드를 입력해주세요.");
    // 접속자 구분값은 속일 수 있으므로 계정 단위 제한을 함께 건다 (무차별 대입 방지). 키는 계정 존재 여부와 무관하다
    limits.account.hit(loginRateKey(loginId));
    const { token, expiresAt } = await identity.login(loginId, password);
    return jsonResponse({ ok: true }, 200, { "Set-Cookie": sessionCookie(ADMIN_COOKIE, token, expiresAt) });
  });
}
