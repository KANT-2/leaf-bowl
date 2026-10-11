import { connection } from "next/server";
import { adminGate, adminLoginRedirect } from "@/application/admin-access";

/** Older preview links now use the same DB-backed customer application. */
export async function GET(request: Request) {
  await connection();
  if (await adminGate(request)) return adminLoginRedirect();
  return new Response(null, {
    status: 307,
    headers: { Location: "/", "Cache-Control": "no-store" },
  });
}
