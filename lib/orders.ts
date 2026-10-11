import { readBrowserJSON as readJSON, writeBrowserJSON as writeJSON } from "./browser-json";
/** 마이페이지 "주문 내역"용 mock 주문 기록. 실제 서버 주문 전까지 localStorage에만 저장한다. */
import { createLocalStore } from "./local-store";

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
  /** 받을 날짜 (YYYY-MM-DD) */
  day: string;
  /** 받을 시간대 표시 (예: "오전 10~12시") */
  timeLabel: string;
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
    typeof (v as OrderRecord).day === "string" &&
    typeof (v as OrderRecord).timeLabel === "string" &&
    typeof (v as OrderRecord).address === "string" &&
    typeof (v as OrderRecord).total === "number" &&
    Array.isArray((v as OrderRecord).items) &&
    (v as OrderRecord).items.every(isOrderItem)
  );
}

function loadOrders(): OrderRecord[] {
  const raw = readJSON(ORDER_KEY);
  return Array.isArray(raw) ? raw.filter(isOrder) : [];
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
export function recordOrder(input: Omit<OrderRecord, "id" | "createdAt">) {
  const order: OrderRecord = { ...input, id: "order-" + Date.now(), createdAt: Date.now() };
  ordersStore.set([order, ...ordersStore.getSnapshot()].slice(0, MAX_ORDERS));
}
