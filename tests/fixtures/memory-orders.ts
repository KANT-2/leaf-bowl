import { randomUUID } from "node:crypto";
import type { Catalog } from "@/modules/catalog/schema";
import type { PricingPolicy } from "@/modules/settings/schema";
import type { DeliveryHours } from "@/modules/delivery/hours";
import {
  DuplicateRequestError,
  type OrdersRepository,
} from "@/modules/orders/repository";
import type { OrderRecord } from "@/modules/orders/types";

/** 서비스 계약을 검증하는 테스트 전용 어댑터. 운영 조합에서는 사용하지 않는다. */
interface MemoryOrdersDependencies {
  getCatalog: () => Promise<Catalog>;
  getPricingPolicy: () => Promise<PricingPolicy>;
  getDeliveryHours: () => Promise<DeliveryHours>;
  now?: () => Date;
}
export function createMemoryOrdersRepository({
  getCatalog,
  getPricingPolicy,
  getDeliveryHours,
  now = () => new Date(),
}: MemoryOrdersDependencies): OrdersRepository {
  const orders = new Map<string, OrderRecord>();
  const requests = new Map<string, string>(); // `${세션}|${키}` → 주문 id
  const copy = (o: OrderRecord): OrderRecord => structuredClone(o);
  let queue: Promise<void> = Promise.resolve();

  return {
    async transaction(work) {
      const previous = queue;
      let unlock!: () => void;
      queue = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      await previous;
      const savedOrders = structuredClone(orders);
      const savedRequests = structuredClone(requests);
      try {
        return await work({
          findByRequest: this.findByRequest.bind(this),
          create: this.create.bind(this),
          getCatalog,
          getPricingPolicy,
          getDeliveryHours,
        });
      } catch (error) {
        orders.clear();
        requests.clear();
        for (const [id, order] of savedOrders) orders.set(id, order);
        for (const [key, id] of savedRequests) requests.set(key, id);
        throw error;
      } finally {
        unlock();
      }
    },
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
          {
            fromStatus: null,
            toStatus: "received",
            changedBy: "customer",
            adminUserId: null,
            reason: null,
            createdAt: at,
          },
        ],
      };
      orders.set(order.id, order);
      requests.set(mapKey, order.id);
      return copy(order);
    },
    async updateStatus(u) {
      const o = orders.get(u.id);
      if (
        !o ||
        o.version !== u.expectedVersion ||
        o.status !== u.expectedStatus
      )
        return null;
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
        .filter(
          (o) =>
            !customerSessionId || o.customerSessionId === customerSessionId,
        )
        .filter(
          (o) => (!from || o.createdAt >= from) && (!to || o.createdAt < to),
        )
        .sort(
          (a, b) =>
            b.createdAt.getTime() - a.createdAt.getTime() ||
            (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
        )
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
