import { randomUUID } from "node:crypto";
import { DuplicateRequestError, type OrdersRepository } from "./repository";
import type { OrderRecord } from "./types";

/**
 * DB 가 준비되기 전까지 쓰는 임시 저장소. 서버를 다시 시작하면 주문이 사라지고,
 * 서버가 여러 개면 서로 보이지 않는다. 읽기·검사·쓰기가 한 동기 구간에서 끝나므로
 * 낙관적 잠금(version) 의 논리는 DB 와 같게 동작한다.
 */
export function createMemoryOrdersRepository(now: () => Date = () => new Date()): OrdersRepository {
  const orders = new Map<string, OrderRecord>();
  const requests = new Map<string, string>(); // `${세션}|${키}` → 주문 id
  const copy = (o: OrderRecord): OrderRecord => structuredClone(o);

  return {
    async findByRequest(sessionId, key) {
      const id = requests.get(`${sessionId}|${key}`);
      return id ? copy(orders.get(id)!) : null;
    },
    async findById(id) {
      const o = orders.get(id);
      return o ? copy(o) : null;
    },
    async create(input) {
      const mapKey = `${input.customerSessionId}|${input.requestKey}`;
      if (requests.has(mapKey)) throw new DuplicateRequestError();
      const at = now();
      const order: OrderRecord = {
        ...structuredClone(input),
        id: randomUUID(),
        status: "received",
        version: 1,
        cancelReason: null,
        canceledAt: null,
        createdAt: at,
        history: [
          { fromStatus: null, toStatus: "received", changedBy: "customer", adminUserId: null, reason: null, createdAt: at },
        ],
      };
      orders.set(order.id, order);
      requests.set(mapKey, order.id);
      return copy(order);
    },
    async updateStatus(u) {
      const o = orders.get(u.id);
      if (!o || o.version !== u.expectedVersion || o.status !== u.expectedStatus) return null;
      const at = now();
      o.history.push({
        fromStatus: o.status,
        toStatus: u.to,
        changedBy: u.changedBy,
        adminUserId: u.adminUserId,
        reason: u.reason,
        createdAt: at,
      });
      o.status = u.to;
      o.version += 1;
      if (u.to === "canceled") {
        o.canceledAt = at;
        o.cancelReason = u.reason;
      }
      return copy(o);
    },
    async list({ status, customerSessionId, from, to, limit, after }) {
      const afterAt = after ? Date.parse(after.createdAt) : 0;
      return [...orders.values()]
        .filter((o) => !status || o.status === status)
        .filter((o) => !customerSessionId || o.customerSessionId === customerSessionId)
        .filter((o) => (!from || o.createdAt >= from) && (!to || o.createdAt < to))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
        .filter(
          (o) =>
            !after ||
            o.createdAt.getTime() < afterAt ||
            (o.createdAt.getTime() === afterAt && o.id < after.id),
        )
        .slice(0, limit)
        .map(copy);
    },
  };
}
