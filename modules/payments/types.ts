import type { CreateOrderInput } from "@/modules/orders/schema";
import type { NewOrder, OrderRecord } from "@/modules/orders/types";

export type OrderSnapshot = Omit<
  NewOrder,
  "subtotal" | "deliveryFee" | "total" | "desiredStartAt" | "desiredEndAt" | "items"
> & {
  subtotal: string;
  deliveryFee: string;
  total: string;
  desiredStartAt: string;
  desiredEndAt: string;
  items: (Omit<NewOrder["items"][number], "unitPrice"> & { unitPrice: string })[];
};

export function snapshotOrder(order: NewOrder): OrderSnapshot {
  return {
    ...order,
    subtotal: String(order.subtotal),
    deliveryFee: String(order.deliveryFee),
    total: String(order.total),
    desiredStartAt: order.desiredStartAt.toISOString(),
    desiredEndAt: order.desiredEndAt.toISOString(),
    items: order.items.map((item) => ({ ...item, unitPrice: String(item.unitPrice) })),
  };
}

export function restoreOrder(order: OrderSnapshot): NewOrder {
  return {
    ...order,
    subtotal: BigInt(order.subtotal),
    deliveryFee: BigInt(order.deliveryFee),
    total: BigInt(order.total),
    desiredStartAt: new Date(order.desiredStartAt),
    desiredEndAt: new Date(order.desiredEndAt),
    items: order.items.map((item) => ({ ...item, unitPrice: BigInt(item.unitPrice) })),
  };
}

export interface PaymentCheckout {
  id: string;
  customerSessionId: string;
  requestKey: string;
  requestHash: string;
  amount: bigint;
  orderSnapshot: OrderSnapshot;
  expiresAt: Date;
  paymentKey: string | null;
  orderId: string | null;
}

export interface ApprovedPayment {
  paymentKey: string;
  orderId: string;
  totalAmount: number;
  currency: string;
  status: string;
  method: string;
  approvedAt: string | null;
}

export interface PaymentGateway {
  assertConfigured(): void;
  /** Lookup before approval also recovers an earlier success whose response was lost. */
  lookup(orderId: string, paymentKey: string): Promise<ApprovedPayment | null>;
  confirm(paymentKey: string, orderId: string, amount: number): Promise<ApprovedPayment>;
}

export interface PaymentsRepository {
  prepare(sessionId: string, key: string, hash: string, input: CreateOrderInput, now: Date): Promise<PaymentCheckout>;
  findById(id: string): Promise<PaymentCheckout | null>;
  bindPaymentKey(id: string, key: string, now: Date): Promise<PaymentCheckout>;
  retire(id: string): Promise<boolean>;
  complete(id: string, payment: ApprovedPayment): Promise<OrderRecord>;
  findOrder(id: string): Promise<OrderRecord | null>;
}
