import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminWorkspace from "@/components/admin/AdminWorkspace";
import { services } from "@/application/container";
import { ADMIN_COOKIE } from "@/modules/identity/service";
import "@/components/admin/auth.css";

async function AuthenticatedAdmin() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) {
    redirect("/admin/login");
  }
  const session = await services().identity.resolve(token, "admin");
  if (!session?.adminUserId) {
    redirect("/admin/login");
  }
  return <AdminWorkspace />;
}

export default function AdminPage() {
  return (
    <Suspense fallback={<p role="status">로그인 상태를 확인하고 있습니다…</p>}>
      <AuthenticatedAdmin />
    </Suspense>
  );
}
