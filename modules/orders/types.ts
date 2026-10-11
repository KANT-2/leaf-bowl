import type { PricedLine } from "./pricing";
import type { OrderStatus } from "./status";

export type ChangedBy = "customer" | "admin" | "system";

export interface OrderItemRecord {
  productId: string | null;
  name: string;
  options: PricedLine["options"];
  unitPrice: bigint;
  quantity: number;
}

export interface StatusHistoryRecord {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy: ChangedBy;
  adminUserId: string | null;
  reason: string | null;
  createdAt: Date;
}

/** db/schema.sql 의 orders + order_items + order_status_history 를 합친 모양 */
export interface OrderRecord {
  id: string;
  customerSessionId: string;
  status: OrderStatus;
  version: number;
  ordererName: string;
  phone: string;
  address: string;
  addressDetail: string;
  desiredDate: string;
  desiredSlot: string;
  subtotal: bigint;
  deliveryFee: bigint;
  total: bigint;
  requestKey: string;
  requestHash: string;
  cancelReason: string | null;
  canceledAt: Date | null;
  createdAt: Date;
  items: OrderItemRecord[];
  history: StatusHistoryRecord[];
}

export type NewOrder = Pick<
  OrderRecord,
  | "customerSessionId"
  | "ordererName"
  | "phone"
  | "address"
  | "addressDetail"
  | "desiredDate"
  | "desiredSlot"
  | "subtotal"
  | "deliveryFee"
  | "total"
  | "requestKey"
  | "requestHash"
  | "items"
>;

export interface StatusUpdate {
  id: string;
  /** 읽었을 때의 version·상태와 지금 값이 같을 때만 바꾼다 (낙관적 잠금) */
  expectedVersion: number;
  expectedStatus: OrderStatus;
  to: OrderStatus;
  reason: string | null;
  changedBy: ChangedBy;
  adminUserId: string | null;
}

export interface ListQuery {
  status?: OrderStatus;
  /** 이 세션의 주문만 (고객 본인 목록). 없으면 전체 (관리자) */
  customerSessionId?: string;
  /** 접수 시각 범위: from 이상, to 미만 */
  from?: Date;
  to?: Date;
  /** 최대 개수. 다음 쪽이 있는지 보려고 서비스가 limit + 1 을 요청한다 */
  limit: number;
  after?: { createdAt: string; id: string };
}
