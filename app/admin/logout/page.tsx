import type { Metadata } from "next";
import AdminAuthScreen from "@/components/admin/AdminAuthScreen";
export const metadata: Metadata = { title: "로그아웃 · leaf & bowl 관리자" };
export default function AdminLogoutPage() {
  return <AdminAuthScreen mode="logout" />;
}
