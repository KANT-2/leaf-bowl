import { connection } from "next/server";
import { adminGate, adminLoginRedirect } from "@/application/admin-access";

/** Older preview links now use the same DB-backed customer application. */
export async function GET(request: Request) {
  await connection();
  const denied = await adminGate(request);
  if (denied) {
    // 로그인이 필요할 때만 로그인 화면으로 보낸다. 세션 저장소 장애(503)를 로그인 이동으로 가리지 않는다.
    return denied.status === 401 ? adminLoginRedirect() : denied;
  }
  return new Response(null, {
    status: 307,
    headers: { Location: "/", "Cache-Control": "no-store" },
  });
}
