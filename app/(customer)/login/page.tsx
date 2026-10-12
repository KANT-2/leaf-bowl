import type { Metadata } from "next";
import { Suspense } from "react";
import LoginView from "@/components/LoginView";

export const metadata: Metadata = { title: "로그인 — leaf & bowl" };

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="wrap auth-wrap" />}>
      <LoginView />
    </Suspense>
  );
}
