import { z } from "zod";
import { jsonRequest, orderItems, type OrderInput } from "@/features/orders/client";
import type { CartItem } from "@/modules/cart/types";

async function cartHash(items: CartItem[]) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(items)));
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function rememberPaymentCart(orderId: string, items: CartItem[]) {
  try {
    sessionStorage.setItem("lb-payment-cart", JSON.stringify({ orderId, hash: await cartHash(items) }));
  } catch {
    /* With unavailable storage, retain the cart instead of clearing unrelated items. */
  }
}

/** Never clear a new cart when a buyer reloads an old payment callback. */
export async function consumePaymentCart(orderId: string, items: CartItem[]) {
  try {
    const saved = JSON.parse(sessionStorage.getItem("lb-payment-cart") ?? "null");
    if (saved?.orderId !== orderId || saved.hash !== (await cartHash(items))) {
      return false;
    }
    sessionStorage.removeItem("lb-payment-cart");
    return true;
  } catch {
    return false;
  }
}

const checkoutSchema = z.object({
  orderId: z.string().uuid(),
  amount: z.number().int().positive().max(300_000_000),
  orderName: z.string().min(1).max(100),
  paymentKey: z.string().nullable(),
  confirmedOrderId: z.string().uuid().nullable(),
  expiresAt: z.string().datetime(),
});

export async function preparePayment(input: OrderInput, key: string) {
  await jsonRequest("/api/v1/session", { method: "POST" });
  return checkoutSchema.parse(
    await jsonRequest("/api/v1/payments/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ ...input, items: orderItems(input.items) }),
    }),
  );
}

export function paymentResultUrl(checkout: { orderId: string; amount: number; paymentKey: string }) {
  return (
    "/checkout/success?" +
    new URLSearchParams({
      orderId: checkout.orderId,
      amount: String(checkout.amount),
      paymentKey: checkout.paymentKey,
    })
  );
}

export async function confirmPayment(input: { orderId: string; amount: number; paymentKey: string }) {
  // Do not create a replacement guest session: a missing cookie cannot authorize this payment.
  const order = z.object({ id: z.string().uuid(), total: z.string().regex(/^\d+$/) }).parse(
    await jsonRequest("/api/v1/payments/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  if (!Number.isSafeInteger(Number(order.total))) {
    throw new Error("주문 금액을 확인하지 못했습니다.");
  }
  return { id: order.id, total: Number(order.total) };
}
