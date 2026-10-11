import type { Metadata } from "next";
import { Suspense } from "react";
import { getDeliveryHours } from "@/lib/data/delivery";
import CheckoutView from "@/components/CheckoutView";

export const metadata: Metadata = { title: "결제 — leaf & bowl" };

export default async function CheckoutPage() {
  const hours = await getDeliveryHours();
  return (
    <Suspense fallback={<main className="wrap pv-wrap" />}>
      <CheckoutView hours={hours} />
    </Suspense>
  );
}
