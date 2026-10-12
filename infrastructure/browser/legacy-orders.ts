import { readBrowserJSON as readJSON, writeBrowserJSON as writeJSON } from "@/infrastructure/browser/json";
/** 과거 브라우저 체험 주문의 호환 저장소. 새 주문은 order-client.ts를 통해 DB에 접수한다. */
import { createLocalStore } from "@/infrastructure/browser/local-store";
import { deliveryWindowUTC, deliveryWindowKST, type DeliveryWindow } from "@/modules/delivery/time";

import type { OrderItemRecord, OrderRecord } from "@/modules/orders/customer-record";
const ORDER_KEY = "bb-orders";
const MAX_ORDERS = 50;

function isOrderItem(v: unknown): v is OrderItemRecord {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as OrderItemRecord).name === "string" &&
    typeof (v as OrderItemRecord).options === "string" &&
    typeof (v as OrderItemRecord).qty === "number" &&
    typeof (v as OrderItemRecord).unitPrice === "number"
  );
}

function isOrder(v: unknown): v is OrderRecord {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as OrderRecord).id === "string" &&
    typeof (v as OrderRecord).createdAt === "number" &&
    ((typeof (v as OrderRecord).desiredStartAt === "string" &&
      typeof (v as OrderRecord).desiredEndAt === "string" &&
      deliveryWindowKST((v as OrderRecord).desiredStartAt!, (v as OrderRecord).desiredEndAt!) !== null) ||
      ((v as OrderRecord).desiredStartAt === undefined &&
        (v as OrderRecord).desiredEndAt === undefined &&
        typeof (v as OrderRecord).day === "string" &&
        typeof (v as OrderRecord).timeLabel === "string")) &&
    typeof (v as OrderRecord).address === "string" &&
    typeof (v as OrderRecord).total === "number" &&
    Array.isArray((v as OrderRecord).items) &&
    (v as OrderRecord).items.every(isOrderItem)
  );
}

function loadOrders(): OrderRecord[] {
  const raw = readJSON(ORDER_KEY);
  return Array.isArray(raw)
    ? raw.filter(isOrder).map((order) => {
        if (order.desiredStartAt) {
          return order;
        }
        const window = deliveryWindowUTC(order.day!, order.timeLabel!);
        if (!window) {
          return order;
        }
        return {
          id: order.id,
          createdAt: order.createdAt,
          address: order.address,
          total: order.total,
          items: order.items,
          ...window,
        };
      })
    : [];
}

function saveOrders(list: OrderRecord[]) {
  writeJSON(ORDER_KEY, list.slice(0, MAX_ORDERS));
}

export const ordersStore = createLocalStore<OrderRecord[]>(ORDER_KEY, loadOrders, saveOrders, []);

/** 새 주문을 맨 앞에 추가한다 (체험 주문 완료 시 호출). id·시각은 여기서 직접 매긴다. */
export function recordOrder(input: Omit<OrderRecord, "id" | "createdAt" | "day" | "timeLabel"> & DeliveryWindow) {
  const order: OrderRecord = {
    ...input,
    id: "order-" + Date.now(),
    createdAt: Date.now(),
  };
  ordersStore.set([order, ...ordersStore.getSnapshot()].slice(0, MAX_ORDERS));
}
