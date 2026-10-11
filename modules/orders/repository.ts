import type { ListQuery, NewOrder, OrderRecord, StatusUpdate } from "./types";

/** 같은 (고객 세션, 재전송 식별키) 로 이미 주문이 있을 때. DB 에서는 유일 제약 위반(P2002) 에 해당한다. */
export class DuplicateRequestError extends Error {
  constructor() {
    super("duplicate request key");
    this.name = "DuplicateRequestError";
  }
}

/**
 * 저장소 계약. 지금은 memory-repository.ts 가 구현한다.
 *
 * 주의: 이 계약은 DB 트랜잭션을 표현하지 못한다. `create`·`updateStatus` 가 각자 원자적으로 저장할 뿐,
 * 설계안(docs/backend-design.md)이 요구하는 "기존 키 확인 → 카탈로그 검증·가격 계산 → 저장을 한 트랜잭션에"
 * 는 담을 수 없다. DB 를 붙일 때는 `transaction(fn)` 형태로 계약을 바꿔야 하며, 제안은
 * docs/db-design.md 의 "저장소 트랜잭션 계약" 에 있다 (정민님과 합의 후 적용).
 */
export interface OrdersRepository {
  findByRequest(customerSessionId: string, requestKey: string): Promise<OrderRecord | null>;
  findById(id: string): Promise<OrderRecord | null>;
  /** @throws DuplicateRequestError */
  create(order: NewOrder): Promise<OrderRecord>;
  /** 조건이 맞지 않아 바뀐 행이 없으면 null (서비스가 409 로 처리) */
  updateStatus(update: StatusUpdate): Promise<OrderRecord | null>;
  /** createdAt, id 내림차순 */
  list(query: ListQuery): Promise<OrderRecord[]>;
}
