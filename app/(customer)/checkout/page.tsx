import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getDeliveryHours } from "@/infrastructure/settings/postgres";
import CheckoutView from "@/components/CheckoutView";
import { tossClientKey } from "@/infrastructure/payments/toss";

export const metadata: Metadata = { title: "결제 — leaf & bowl" };

async function CheckoutContent() {
  await connection();
  const hours = await getDeliveryHours();
  return <CheckoutView hours={hours} clientKey={tossClientKey()} />;
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<main className="wrap pv-wrap" />}>
      <CheckoutContent />
    </Suspense>
  );
}
