import type { OrdersTransaction } from "./repository";
import type { CreateOrderInput } from "./schema";
import type { NewOrder } from "./types";
import { assertDeliverySlot } from "./delivery";
import { priceOrder } from "./pricing";
import { AppError } from "@/modules/shared/errors";

/** Freeze server prices and product names before a buyer leaves for authentication. */
export async function quoteOrder(
  tx: Pick<OrdersTransaction, "getCatalog" | "getPricingPolicy" | "getDeliveryHours">,
  customerSessionId: string,
  requestKey: string,
  requestHash: string,
  input: CreateOrderInput,
  now: Date,
): Promise<NewOrder> {
  const catalog = await tx.getCatalog();
  assertDeliverySlot(input, await tx.getDeliveryHours(), now);
  const priced = priceOrder(catalog, input.items, await tx.getPricingPolicy());
  if (priced.total > BigInt(300_000_000)) {
    throw new AppError(400, "주문 금액이 결제 한도를 넘었습니다.");
  }
  return {
    customerSessionId,
    ordererName: input.ordererName,
    phone: input.phone,
    address: input.address,
    addressDetail: input.addressDetail,
    desiredStartAt: new Date(input.desiredStartAt),
    desiredEndAt: new Date(input.desiredEndAt),
    subtotal: priced.subtotal,
    deliveryFee: priced.deliveryFee,
    total: priced.total,
    requestKey,
    requestHash,
    items: priced.lines.map((line) => ({
      productId: line.productId,
      productType: line.productType,
      name: line.name,
      options: line.options,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
    })),
  };
}
