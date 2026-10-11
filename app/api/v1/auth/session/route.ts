import { requireAdmin } from "@/modules/identity/guard";
import { services } from "@/modules/container";
import { jsonResponse, run } from "@/modules/shared/http";

/** 관리자 로그인 상태 확인. 화면이 로그인/로그아웃 버튼을 바꾸는 데 쓴다. 로그인하지 않았으면 401 */
export async function GET(request: Request) {
  return run(async () => {
    const session = await requireAdmin(request, services().identity);
    return jsonResponse({ authenticated: true, expiresAt: session.expiresAt.toISOString() });
  });
}
