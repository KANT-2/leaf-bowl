import { Suspense } from "react";
import type { Metadata } from "next";
import PaymentResult from "@/components/PaymentResult";

export const metadata: Metadata = {
  title: "결제 확인 — leaf & bowl",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Page() {
  return (
    <Suspense fallback={<main className="wrap pv-wrap" />}>
      <PaymentResult />
    </Suspense>
  );
}
