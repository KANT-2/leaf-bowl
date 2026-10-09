// GET /api/home → 메인 화면용: 배너 문구, 시즌 스페셜, BEST 메뉴, 최근 리뷰
import { connection } from "next/server";
import { readCatalog } from "@/lib/admin/store";
import { jsonError } from "@/lib/admin/server";
import { home } from "@/lib/customer/api";

export async function GET() {
  await connection();
  try {
    return Response.json(home((await readCatalog()).catalog), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError("메인 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.", 503);
  }
}
