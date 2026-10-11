import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getDeliveryHours } from "@/lib/data/server";
import CheckoutView from "@/components/CheckoutView";

export const metadata: Metadata = { title: "결제 — leaf & bowl" };

async function CheckoutContent() {
  await connection();
  const hours = await getDeliveryHours();
  return <CheckoutView hours={hours} />;
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<main className="wrap pv-wrap" />}>
      <CheckoutContent />
    </Suspense>
  );
}
