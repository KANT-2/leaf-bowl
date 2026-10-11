import type { Catalog } from "@/lib/admin/catalog";
import { getDeliveryHours, type DeliveryHours } from "@/lib/data/delivery";
import { decodeCursor, encodeCursor } from "../shared/cursor";
import { AppError } from "../shared/errors";
import { assertDeliverySlot, seoulDayStart } from "./delivery";
import { priceOrder } from "./pricing";
import { requestHash } from "./request-hash";
import { DuplicateRequestError, type OrdersRepository } from "./repository";
import type { AdminOrderListQuery, ChangeStatusInput, CreateOrderInput, OwnOrderListQuery } from "./schema";
import { assertTransition, resolveCancel } from "./status";
import type { ListQuery, OrderRecord } from "./types";

export interface OrdersServiceDeps {
  repository: OrdersRepository;
  /** 가격 계산 기준이 되는 카탈로그. 지금은 관리자 JSON 저장소, DB 이후에는 DB 조회 */
  getCatalog: () => Promise<Catalog>;
  /** 배달 운영 시간. 지금은 고정 값, DB 이후에는 DB 조회 (lib/data/delivery.ts) */
  getHours?: () => Promise<DeliveryHours>;
  now?: () => Date;
}

const SAME_KEY_DIFFERENT_BODY = "같은 요청 번호로 다른 내용의 주문이 이미 있습니다.";
const NOT_FOUND = "주문을 찾을 수 없습니다.";
const CHANGED_BY_OTHER = "다른 관리자가 먼저 변경했습니다. 새로 고친 뒤 다시 시도해주세요.";

export function createOrdersService({
  repository,
  getCatalog,
  getHours = getDeliveryHours,
  now = () => new Date(),
}: OrdersServiceDeps) {
  async function ownOrder(customerSessionId: string, id: string): Promise<OrderRecord> {
    const order = await repository.findById(id);
    // 다른 사람의 주문은 존재 여부도 알려주지 않는다
    if (!order || order.customerSessionId !== customerSessionId) throw new AppError(404, NOT_FOUND);
    return order;
  }

  interface Page {
    items: OrderRecord[];
    nextCursor: string | null;
  }

  /** 다음 쪽이 있는지 보려고 limit + 1 개를 읽고, 있으면 마지막 항목으로 cursor 를 만든다 */
  async function page(limit: number, cursor: string | undefined, filter: Omit<ListQuery, "limit" | "after">): Promise<Page> {
    const after = cursor ? decodeCursor(cursor) : undefined;
    const rows = await repository.list({ ...filter, limit: limit + 1, after });
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor:
        rows.length > limit && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  function sameRequest(existing: OrderRecord, hash: string): { order: OrderRecord; created: false } {
    if (existing.requestHash !== hash) throw new AppError(409, SAME_KEY_DIFFERENT_BODY);
    return { order: existing, created: false };
  }

  return {
    /** 같은 키·같은 내용의 재전송이면 기존 주문을(created: false), 새로 접수하면 created: true */
    async createOrder(
      customerSessionId: string,
      idempotencyKey: string,
      input: CreateOrderInput,
    ): Promise<{ order: OrderRecord; created: boolean }> {
      const hash = requestHash(input);
      const existing = await repository.findByRequest(customerSessionId, idempotencyKey);
      if (existing) return sameRequest(existing, hash);

      assertDeliverySlot(input, await getHours(), now());
      const priced = priceOrder(await getCatalog(), input.items);
      try {
        const order = await repository.create({
          customerSessionId,
          ordererName: input.ordererName,
          phone: input.phone,
          address: input.address,
          addressDetail: input.addressDetail,
          desiredDate: input.desiredDate,
          desiredSlot: input.desiredSlot,
          subtotal: priced.subtotal,
          deliveryFee: priced.deliveryFee,
          total: priced.total,
          requestKey: idempotencyKey,
          requestHash: hash,
          items: priced.lines.map((l) => ({
            productId: l.productId,
            name: l.name,
            options: l.options,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
          })),
        });
        return { order, created: true };
      } catch (e) {
        if (!(e instanceof DuplicateRequestError)) throw e;
        // 동시에 같은 키가 먼저 저장됨: 저장된 주문을 다시 읽어 같은 규칙으로 처리
        const winner = await repository.findByRequest(customerSessionId, idempotencyKey);
        if (!winner) throw e;
        return sameRequest(winner, hash);
      }
    },

    getOrder: ownOrder,

    async cancelOrder(customerSessionId: string, id: string, reason?: string): Promise<OrderRecord> {
      // 그 사이 관리자가 상태를 바꿔 갱신이 비면 최신 상태를 다시 읽어 판단한다 (최대 3회).
      // 확인 상태는 아직 취소할 수 있으므로 재시도하고, 준비 시작 후라면 resolveCancel 이 409 를 낸다.
      for (let attempt = 0; attempt < 3; attempt++) {
        const order = await ownOrder(customerSessionId, id);
        if (resolveCancel(order.status) === "already-canceled") return order;
        const updated = await repository.updateStatus({
          id,
          expectedVersion: order.version,
          expectedStatus: order.status,
          to: "canceled",
          reason: reason ?? null,
          changedBy: "customer",
          adminUserId: null,
        });
        if (updated) return updated;
      }
      throw new AppError(409, "주문 상태가 계속 바뀌고 있어 취소하지 못했습니다. 다시 시도해주세요.");
    },

    async changeStatus(adminUserId: string, id: string, input: ChangeStatusInput): Promise<OrderRecord> {
      const order = await repository.findById(id);
      if (!order) throw new AppError(404, NOT_FOUND);
      if (order.version !== input.version) throw new AppError(409, CHANGED_BY_OTHER);
      assertTransition(order.status, input.status);
      const updated = await repository.updateStatus({
        id,
        expectedVersion: order.version,
        expectedStatus: order.status,
        to: input.status,
        reason: input.reason ?? null,
        changedBy: "admin",
        adminUserId,
      });
      if (!updated) throw new AppError(409, CHANGED_BY_OTHER);
      return updated;
    },

    /** 관리자: 상태·접수일 범위(한국 시간 날짜, 양 끝 포함)로 걸러 최신순 */
    listOrders(query: AdminOrderListQuery): Promise<Page> {
      return page(query.limit, query.cursor, {
        status: query.status,
        from: query.from ? seoulDayStart(query.from) : undefined,
        to: query.to ? new Date(seoulDayStart(query.to).getTime() + 24 * 3600_000) : undefined,
      });
    },

    /** 고객: 본인 세션의 주문만 최신순 */
    listOwnOrders(customerSessionId: string, query: OwnOrderListQuery): Promise<Page> {
      return page(query.limit, query.cursor, { customerSessionId });
    },

    /** 관리자: 주문 한 건의 전체 내용(연락처·이력 포함) */
    async getOrderForAdmin(id: string): Promise<OrderRecord> {
      const order = await repository.findById(id);
      if (!order) throw new AppError(404, NOT_FOUND);
      return order;
    },
  };
}

export type OrdersService = ReturnType<typeof createOrdersService>;
