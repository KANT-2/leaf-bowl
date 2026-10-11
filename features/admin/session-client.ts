/** Used by administrator data requests, not login attempts (whose 401 means invalid credentials). */
export function redirectIfAdminUnauthorized(
  response: Pick<Response, "status">,
): void {
  if (response.status !== 401) return;
  if (
    typeof window !== "undefined" &&
    !["/admin/login", "/admin/login/"].includes(window.location.pathname)
  ) {
    window.location.replace("/admin/login");
  }
  throw new Error("로그인이 필요합니다.");
}
