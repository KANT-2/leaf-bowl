import { readBrowserJSON as readJSON, writeBrowserJSON as writeJSON } from "./browser-json";
/** 마이페이지 "주문 내역"용 mock 주문 기록. 실제 서버 주문 전까지 localStorage에만 저장한다. */
import { createLocalStore } from "./local-store";
import { deliveryWindowUTC, deliveryWindowKST, type DeliveryWindow } from "./delivery-time";

export interface OrderItemRecord {
  name: string;
  /** 드레싱·음료 등 선택 내역, " · " 로 구분 */
  options: string;
  qty: number;
  unitPrice: number;
}

export interface OrderRecord {
  id: string;
  /** 주문(체험 주문 완료) 시각 */
  createdAt: number;
  /** 새 기록은 UTC ISO 시각을 저장한다. */
  desiredStartAt?: string;
  desiredEndAt?: string;
  /** 변환할 수 없는 과거 기록의 표시 호환용. 새 주문에는 저장하지 않는다. */
  day?: string;
  timeLabel?: string;
  address: string;
  total: number;
  items: OrderItemRecord[];
}

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
     ((v as OrderRecord).desiredStartAt === undefined && (v as OrderRecord).desiredEndAt === undefined &&
      typeof (v as OrderRecord).day === "string" && typeof (v as OrderRecord).timeLabel === "string")) &&
    typeof (v as OrderRecord).address === "string" &&
    typeof (v as OrderRecord).total === "number" &&
    Array.isArray((v as OrderRecord).items) &&
    (v as OrderRecord).items.every(isOrderItem)
  );
}

function loadOrders(): OrderRecord[] {
  const raw = readJSON(ORDER_KEY);
  return Array.isArray(raw) ? raw.filter(isOrder).map((order) => {
    if (order.desiredStartAt) return order;
    const window = deliveryWindowUTC(order.day!, order.timeLabel!);
    if (!window) return order;
    return { id: order.id, createdAt: order.createdAt, address: order.address, total: order.total, items: order.items, ...window };
  }) : [];
}

function saveOrders(list: OrderRecord[]) {
  writeJSON(ORDER_KEY, list.slice(0, MAX_ORDERS));
}

export const ordersStore = createLocalStore<OrderRecord[]>(
  ORDER_KEY,
  loadOrders,
  saveOrders,
  [],
);

/** 새 주문을 맨 앞에 추가한다 (체험 주문 완료 시 호출). id·시각은 여기서 직접 매긴다. */
export function recordOrder(input: Omit<OrderRecord, "id" | "createdAt" | "day" | "timeLabel"> & DeliveryWindow) {
  const order: OrderRecord = { ...input, id: "order-" + Date.now(), createdAt: Date.now() };
  ordersStore.set([order, ...ordersStore.getSnapshot()].slice(0, MAX_ORDERS));
}
