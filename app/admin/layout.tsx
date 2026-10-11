import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "leaf & bowl · 관리자" };
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
