import type { Metadata } from "next";
import AdminAuthScreen from "@/components/admin/AdminAuthScreen";
export const metadata: Metadata = { title: "관리자 로그인 · leaf & bowl" };
export default function AdminLoginPage() {
  return <AdminAuthScreen mode="login" />;
}
