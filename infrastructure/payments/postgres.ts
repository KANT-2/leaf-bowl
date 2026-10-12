import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { databaseTransaction } from "@/infrastructure/database/prisma";
import { lockCatalog, readCatalogState } from "@/infrastructure/catalog/postgres";
import { readDeliveryHours, readPricingPolicy } from "@/infrastructure/settings/postgres";
import { insertOrder, createPostgresOrdersRepository } from "@/infrastructure/orders/postgres";
import { quoteOrder } from "@/modules/orders/quote";
import { assertApprovedPayment } from "@/modules/payments/service";
import { AppError } from "@/modules/shared/errors";
import {
  snapshotOrder,
  restoreOrder,
  type OrderSnapshot,
  type PaymentCheckout,
  type PaymentsRepository,
} from "@/modules/payments/types";

function record(row: Prisma.PaymentCheckoutGetPayload<object>): PaymentCheckout {
  return { ...row, orderSnapshot: row.orderSnapshot as unknown as OrderSnapshot };
}

export function createPostgresPaymentsRepository(db: PrismaClient): PaymentsRepository {
  const orders = createPostgresOrdersRepository(db);
  return {
    async prepare(sessionId, key, hash, input, now) {
      // Serializes simultaneous preparations of the same session/key before quoting.
      return databaseTransaction(db, async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId + ":" + key}, 100))::text`;
        await tx.$queryRaw`SELECT id FROM payment_checkouts WHERE customer_session_id = ${sessionId}::uuid AND request_key = ${key} FOR UPDATE`;
        const existing = await tx.paymentCheckout.findUnique({
          where: { customerSessionId_requestKey: { customerSessionId: sessionId, requestKey: key } },
        });
        if (existing && (existing.paymentKey || existing.expiresAt > now || existing.requestHash !== hash)) {
          return record(existing);
        }
        if (existing) {
          await tx.paymentCheckout.update({
            where: { id: existing.id },
            data: { requestKey: "retired-" + existing.id },
          });
        }
        const order = await quoteOrder(
          {
            getPricingPolicy: () => readPricingPolicy(tx),
            getDeliveryHours: () => readDeliveryHours(tx),
            getCatalog: async () => {
              await lockCatalog(tx, "read");
              return (await readCatalogState(tx)).catalog;
            },
          },
          sessionId,
          key,
          hash,
          input,
          now,
        );
        return record(
          await tx.paymentCheckout.create({
            data: {
              customerSessionId: sessionId,
              requestKey: key,
              requestHash: hash,
              amount: order.total,
              orderSnapshot: snapshotOrder(order) as unknown as Prisma.InputJsonValue,
              expiresAt: new Date(Math.min(now.getTime() + 30 * 60_000, order.desiredStartAt.getTime())),
            },
          }),
        );
      });
    },
    async findById(id) {
      const row = await db.paymentCheckout.findUnique({ where: { id } });
      return row ? record(row) : null;
    },
    async bindPaymentKey(id, key, now) {
      return databaseTransaction(db, async (tx) => {
        await tx.$queryRaw`SELECT id FROM payment_checkouts WHERE id = ${id}::uuid FOR UPDATE`;
        const row = await tx.paymentCheckout.findUniqueOrThrow({ where: { id } });
        if (row.requestKey === "retired-" + id) {
          throw new AppError(409, "이 결제 시도는 종료되었습니다. 장바구니에서 다시 결제해주세요.");
        }
        if (row.paymentKey && row.paymentKey !== key) {
          throw new AppError(409, "이미 다른 결제 정보로 확인 중인 주문입니다.");
        }
        if (row.paymentKey) {
          return record(row);
        }
        if (row.expiresAt <= now) {
          throw new AppError(409, "결제 대기 시간이 지났습니다. 배송 시간을 다시 선택해주세요.");
        }
        try {
          return record(await tx.paymentCheckout.update({ where: { id }, data: { paymentKey: key } }));
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new AppError(409, "이미 다른 주문에 사용한 결제 정보입니다.");
          }
          throw error;
        }
      });
    },
    async retire(id) {
      return databaseTransaction(db, async (tx) => {
        await tx.$queryRaw`SELECT id FROM payment_checkouts WHERE id = ${id}::uuid FOR UPDATE`;
        const row = await tx.paymentCheckout.findUniqueOrThrow({ where: { id } });
        if (row.orderId || row.requestKey === "retired-" + id) {
          return false;
        }
        await tx.paymentCheckout.update({ where: { id }, data: { requestKey: "retired-" + id } });
        return true;
      });
    },
    async complete(id, payment) {
      const orderId = await databaseTransaction(db, async (tx) => {
        await tx.$queryRaw`SELECT id FROM payment_checkouts WHERE id = ${id}::uuid FOR UPDATE`;
        const row = await tx.paymentCheckout.findUniqueOrThrow({ where: { id } });
        if (row.requestKey === "retired-" + id) {
          throw new AppError(409, "이 결제 시도는 종료되었습니다. 장바구니에서 다시 결제해주세요.");
        }
        assertApprovedPayment(record(row), payment);
        if (row.orderId) {
          return row.orderId;
        }
        const order = restoreOrder(record(row).orderSnapshot);
        // Items/prices are the authenticated quote. Removed product references remain valid snapshots.
        await lockCatalog(tx, "read");
        const ids = order.items.flatMap((item) => (item.productId ? [item.productId] : []));
        const present = new Set(
          (await tx.product.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((p) => p.id),
        );
        const created = await insertOrder(tx, {
          ...order,
          requestKey: "toss-" + id,
          items: order.items.map((item) => ({
            ...item,
            originalProductId: item.productId,
            productId: item.productId && present.has(item.productId) ? item.productId : null,
          })),
        });
        await tx.paymentCheckout.update({
          where: { id },
          data: {
            orderId: created.id,
            method: payment.method,
            approvedAt: new Date(payment.approvedAt!),
          },
        });
        return created.id;
      });
      const order = await orders.findById(orderId);
      if (!order) {
        throw new AppError(503, "접수한 주문을 확인하지 못했습니다. 다시 확인해주세요.");
      }
      return order;
    },
    findOrder: (id) => orders.findById(id),
  };
}
