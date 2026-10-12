import type { PricedLine } from "./pricing";
import type { OrderStatus } from "./status";

export type ChangedBy = "customer" | "admin" | "system";

export interface OrderItemRecord {
  productId: string | null;
  /** Preserve the quoted identity if its live catalog row was deleted before approval. */
  originalProductId?: string | null;
  productType?: "salad" | "drink" | "custom";
  name: string;
  options: PricedLine["options"];
  unitPrice: bigint;
  quantity: number;
}

/** 저장된 주문 품목. DB 행 id가 있어서 리뷰를 어떤 구매에 연결할지 가릴 수 있다. */
export interface StoredOrderItemRecord extends OrderItemRecord {
  id: string;
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
  /** UTC 예약 시각. 표시 날짜·시간대는 프론트에서 KST로 계산한다. */
  desiredStartAt: Date;
  desiredEndAt: Date;
  subtotal: bigint;
  deliveryFee: bigint;
  total: bigint;
  requestKey: string;
  requestHash: string;
  cancelReason: string | null;
  canceledAt: Date | null;
  createdAt: Date;
  items: StoredOrderItemRecord[];
  history: StatusHistoryRecord[];
}

export type NewOrder = Omit<
  Pick<
    OrderRecord,
    | "customerSessionId"
    | "ordererName"
    | "phone"
    | "address"
    | "addressDetail"
    | "desiredStartAt"
    | "desiredEndAt"
    | "subtotal"
    | "deliveryFee"
    | "total"
    | "requestKey"
    | "requestHash"
    | "items"
  >,
  "items"
> & { items: OrderItemRecord[] };

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
