import { clearedCookie, readCookie } from "@/modules/identity/cookies";
import { ADMIN_COOKIE } from "@/modules/identity/service";
import { services } from "@/application/container";
import { assertSameOrigin, jsonResponse, run } from "@/infrastructure/http/response";

export async function POST(request: Request) {
  return run(async () => {
    assertSameOrigin(request);
    await services().identity.logout(readCookie(request, ADMIN_COOKIE));
    return jsonResponse({ ok: true }, 200, { "Set-Cookie": clearedCookie(ADMIN_COOKIE) });
  });
}
