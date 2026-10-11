import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { salesDataSchema, type SalesData } from "@/modules/reports/sales";
import type { OrderItemRecord } from "@/modules/orders/types";

type Item = OrderItemRecord & { originalProductId?: string | null };
export function salesItems(items: Item[]): SalesData["orders"][number]["items"] {
  return items.flatMap((item, index) => {
    const productType = item.productType ?? (item.productId ? "salad" : "custom");
    const dressing = item.options.dressing;
    const line = {
      productId: item.originalProductId ?? item.productId ?? `custom-${index}`,
      productType,
      productName: item.name,
      quantity: item.quantity,
      refundedQuantity: 0,
      ...(productType === "salad"
        ? {
            dressing:
              dressing && dressing.name !== "드레싱 없이"
                ? { productId: dressing.key, productName: dressing.name }
                : null,
          }
        : {}),
    };
    // Drink-only orders already have a drink line; don't count their option snapshot twice.
    const drinks =
      productType === "drink"
        ? []
        : item.options.drinks.map((drink) => ({
            productId: drink.key,
            productType: "drink" as const,
            productName: drink.name,
            quantity: item.quantity,
            refundedQuantity: 0,
          }));
    const dressings =
      dressing && dressing.name !== "드레싱 없이"
        ? [
            {
              productId: dressing.key,
              productType: "dressing" as const,
              productName: dressing.name,
              quantity: item.quantity,
              refundedQuantity: 0,
            },
          ]
        : [];
    return [line, ...drinks, ...dressings];
  });
}

/** Only completed orders are sales; this app does not claim to have payment confirmation. */
export async function readSalesData(db: PrismaClient = prisma()): Promise<SalesData> {
  const rows = await db.order.findMany({
    where: { status: "completed" },
    include: { items: { orderBy: { position: "asc" } } },
  });
  return salesDataSchema.parse({
    updatedAt: new Date().toISOString(),
    orders: rows.map((order) => ({
      id: order.id,
      status: "completed",
      paidAt: null,
      completedAt: order.updatedAt.toISOString(),
      items: salesItems(
        order.items.map((item) => ({
          ...item,
          productType: item.productType as Item["productType"],
          options: item.options as unknown as Item["options"],
        })),
      ),
    })),
  });
}
