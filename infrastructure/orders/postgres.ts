import "server-only";
import { readDeliveryHours, readPricingPolicy } from "@/infrastructure/settings/postgres";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { databaseTransaction, type DatabaseTransaction } from "@/infrastructure/database/prisma";
import { lockCatalog, readCatalogState } from "@/infrastructure/catalog/postgres";
import { DuplicateRequestError, type OrdersRepository } from "@/modules/orders/repository";
import type { ListQuery, NewOrder, OrderRecord, StatusUpdate } from "@/modules/orders/types";
import { AppError } from "@/modules/shared/errors";

const include = {
  items: { orderBy: [{ position: "asc" }, { id: "asc" }] },
  history: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
} satisfies Prisma.OrderInclude;
type StoredOrder = Prisma.OrderGetPayload<{ include: typeof include }>;

function record(row: StoredOrder): OrderRecord {
  return {
    ...row,
    status: row.status as OrderRecord["status"],
    items: row.items.map((item) => ({
      id: item.id.toString(),
      productId: item.originalProductId ?? item.productId,
      productType: item.productType as OrderRecord["items"][number]["productType"],
      name: item.name,
      options: item.options as unknown as OrderRecord["items"][number]["options"],
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    })),
    history: row.history.map((history) => ({
      ...history,
      fromStatus: history.fromStatus as OrderRecord["status"] | null,
      toStatus: history.toStatus as OrderRecord["status"],
      changedBy: history.changedBy as OrderRecord["history"][number]["changedBy"],
    })),
  };
}

type Reader = Pick<DatabaseTransaction, "order">;
async function findByRequest(db: Reader, customerSessionId: string, requestKey: string) {
  const row = await db.order.findUnique({
    where: { customerSessionId_requestKey: { customerSessionId, requestKey } },
    include,
  });
  return row ? record(row) : null;
}

export async function insertOrder(tx: DatabaseTransaction, input: NewOrder): Promise<OrderRecord> {
  const { items, ...order } = input;
  try {
    return record(
      await tx.order.create({
        data: {
          ...order,
          items: {
            create: items.map((item, position) => ({
              ...item,
              position,
              productType: item.productType ?? (item.productId ? "salad" : "custom"),
              originalProductId: item.originalProductId ?? item.productId,
              options: item.options as unknown as Prisma.InputJsonValue,
            })),
          },
          history: { create: { toStatus: "received", changedBy: "customer" } },
        },
        include,
      }),
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicateRequestError();
    }
    throw error;
  }
}

export function createPostgresOrdersRepository(db: PrismaClient): OrdersRepository {
  return {
    transaction: (work) =>
      databaseTransaction(db, async (tx) =>
        work({
          getPricingPolicy: () => readPricingPolicy(tx),
          getDeliveryHours: () => readDeliveryHours(tx),
          findByRequest: (session, key) => findByRequest(tx, session, key),
          getCatalog: async () => {
            await lockCatalog(tx, "read");
            return (await readCatalogState(tx)).catalog;
          },
          create: (input) => insertOrder(tx, input),
        }),
      ),
    findByRequest: (session, key) => findByRequest(db, session, key),
    async findById(id) {
      const row = await db.order.findUnique({ where: { id }, include });
      return row ? record(row) : null;
    },
    create: (input) => databaseTransaction(db, (tx) => insertOrder(tx, input)),
    updateStatus: (update: StatusUpdate) =>
      databaseTransaction(db, async (tx) => {
        if (update.to === "canceled" && (await tx.paymentCheckout.count({ where: { orderId: update.id } }))) {
          throw new AppError(409, "결제 주문의 취소·환불은 매장에 문의해주세요.");
        }
        const at = new Date();
        const changed = await tx.order.updateMany({
          where: {
            id: update.id,
            version: update.expectedVersion,
            status: update.expectedStatus,
          },
          data: {
            status: update.to,
            version: { increment: 1 },
            updatedAt: at,
            ...(update.to === "canceled" ? { canceledAt: at, cancelReason: update.reason } : {}),
          },
        });
        if (!changed.count) {
          return null;
        }
        await tx.orderStatusHistory.create({
          data: {
            orderId: update.id,
            fromStatus: update.expectedStatus,
            toStatus: update.to,
            changedBy: update.changedBy,
            adminUserId: update.adminUserId,
            reason: update.reason,
            createdAt: at,
          },
        });
        return record(
          await tx.order.findUniqueOrThrow({
            where: { id: update.id },
            include,
          }),
        );
      }),
    async list(query: ListQuery) {
      const where: Prisma.OrderWhereInput = {
        status: query.status,
        customerSessionId: query.customerSessionId,
        createdAt: { gte: query.from, lt: query.to },
        ...(query.after
          ? {
              OR: [
                { createdAt: { lt: new Date(query.after.createdAt) } },
                {
                  createdAt: new Date(query.after.createdAt),
                  id: { lt: query.after.id },
                },
              ],
            }
          : {}),
      };
      return (
        await db.order.findMany({
          where,
          include,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: query.limit,
        })
      ).map(record);
    },
  };
}
