import type { ListQuery, NewOrder, OrderRecord, StatusUpdate } from "./types";
import { type Catalog } from "@/modules/catalog/schema";
import type { PricingPolicy } from "@/modules/settings/schema";
import type { DeliveryHours } from "@/modules/delivery/hours";

/** 같은 (고객 세션, 재전송 식별키) 로 이미 주문이 있을 때. DB 에서는 유일 제약 위반(P2002) 에 해당한다. */
export class DuplicateRequestError extends Error {
  constructor() {
    super("duplicate request key");
    this.name = "DuplicateRequestError";
  }
}

export interface OrdersTransaction {
  findByRequest(customerSessionId: string, requestKey: string): Promise<OrderRecord | null>;
  /** Catalog prices cannot change until this transaction commits. */
  getCatalog(): Promise<Catalog>;
  getPricingPolicy(): Promise<PricingPolicy>;
  getDeliveryHours(): Promise<DeliveryHours>;
  create(order: NewOrder): Promise<OrderRecord>;
}

/** PostgreSQL in the app; the memory adapter is retained for isolated unit tests. */
export interface OrdersRepository {
  transaction<T>(work: (tx: OrdersTransaction) => Promise<T>): Promise<T>;
  findByRequest(customerSessionId: string, requestKey: string): Promise<OrderRecord | null>;
  findById(id: string): Promise<OrderRecord | null>;
  /** @throws DuplicateRequestError */
  create(order: NewOrder): Promise<OrderRecord>;
  /** 조건이 맞지 않아 바뀐 행이 없으면 null (서비스가 409 로 처리) */
  updateStatus(update: StatusUpdate): Promise<OrderRecord | null>;
  /** createdAt, id 내림차순 */
  list(query: ListQuery): Promise<OrderRecord[]>;
}
