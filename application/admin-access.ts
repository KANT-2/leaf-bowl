import "server-only";
import { unstable_rethrow } from "next/navigation";
import { jsonError } from "@/infrastructure/http/request";
import { services } from "@/application/container";
import { AppError } from "@/modules/shared/errors";
import { requireAdmin } from "@/modules/identity/guard";

/**
 * 기존 관리자 API(`/api/admin/*`)용 권한 검사. 이 API 들은 오류를 `{ error }` 로 내려주므로
 * 같은 모양의 401 을 돌려준다. 통과하면 null, 막아야 하면 그 응답을 돌려준다.
 * 세션 저장소 같은 예상 밖 장애는 401(권한 없음)과 구분해 503 으로 응답한다. 접근을 허용하지는 않는다.
 */
export async function adminGate(request: Request): Promise<Response | null> {
  try {
    await requireAdmin(request, services().identity);
    return null;
  } catch (e) {
    if (e instanceof AppError) {
      return jsonError(e.message, e.status);
    }
    unstable_rethrow(e);
    console.error("Admin gate", e);
    return jsonError("잠시 후 다시 시도해주세요.", 503);
  }
}

/**
 * 브라우저 주소로 여는 관리자 페이지(미리보기)용: 로그인 화면으로 보내는 상대 경로 리다이렉트.
 * 절대 주소(`new URL(path, request.url)`)를 쓰면 프록시 뒤에서 서버가 알고 있는 내부 주소
 * (`https://0.0.0.0:3100/...`)로 보내져 접속할 수 없다. `Location` 은 상대 경로여도 유효하다(RFC 9110).
 */
export function adminLoginRedirect(): Response {
  return new Response(null, {
    status: 307,
    headers: { Location: "/admin/login", "Cache-Control": "no-store" },
  });
}
