import { publicSnapshot } from "@/modules/catalog/public-snapshot";
import { connection } from "next/server";
import { readCatalog } from "@/application/catalog";
export async function GET() {
  await connection();
  try {
    return Response.json(publicSnapshot(await readCatalog()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "고객 데이터를 불러오지 못했습니다." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
