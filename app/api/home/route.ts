// GET /api/home → 메인 화면용: 배너 문구, 시즌 스페셜, BEST 메뉴, 최근 리뷰
import { readCatalog } from "@/application/catalog";
import { jsonResponse, run } from "@/infrastructure/http/response";
import { home } from "@/modules/catalog/customer-api";

export async function GET() {
  return run(async () => jsonResponse(home((await readCatalog()).catalog)));
}
