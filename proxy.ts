import { NextResponse, type NextRequest } from "next/server";

/**
 * `/admin` 화면에 로그인 쿠키가 아예 없으면 로그인 화면으로 보낸다 (보조 장치).
 * 프록시는 서버의 세션 저장소를 공유하지 못하므로 쿠키가 유효한지는 확인하지 않는다.
 * 실제 권한 검사는 관리자 API(`/api/admin/*`, `/api/v1/admin/*`)와 `/admin/preview` 가 서버에서 한다.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname !== "/admin" && pathname !== "/admin/") return NextResponse.next();
  if (request.cookies.has("lb_admin")) return NextResponse.next();
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = { matcher: ["/admin", "/admin/"] };
