import { jsonError } from "@/lib/admin/server";
import { services } from "../container";
import { AppError } from "../shared/errors";
import { requireAdmin } from "./guard";

/**
 * 기존 관리자 API(`/api/admin/*`)용 권한 검사. 이 API 들은 오류를 `{ error }` 로 내려주므로
 * 같은 모양의 401 을 돌려준다. 통과하면 null, 막아야 하면 그 응답을 돌려준다.
 */
export async function adminGate(request: Request): Promise<Response | null> {
  try {
    await requireAdmin(request, services().identity);
    return null;
  } catch (e) {
    if (e instanceof AppError) return jsonError(e.message, e.status);
    throw e;
  }
}
