import { type CartItem } from "@/modules/cart/types";
import { hasCustomIngredientIds, isCustom, isDrink } from "@/modules/cart/identity";
import { dressingKeys, drinkKey, drinkKeys } from "@/modules/cart/identifiers";
import { deliveryWindowKST } from "@/modules/delivery/time";
import type { OrderRecord } from "@/modules/orders/customer-record";

export function orderItems(items: CartItem[]) {
  return items.map((item) => {
    if (isDrink(item)) {
      return { drinkKeys: [drinkKey(item)], quantity: item.qty };
    }
    if (isCustom(item)) {
      if (!hasCustomIngredientIds(item)) {
        throw new Error("저장한 조합의 재료를 다시 선택해주세요.");
      }
      return {
        ingredientKeys: item.ingredientIds,
        dressingKeys: dressingKeys(item),
        quantity: item.qty,
      };
    }
    return {
      productId: item.id,
      quantity: item.qty,
      ...(item.optionSelections
        ? { optionSelections: item.optionSelections }
        : { dressingKeys: dressingKeys(item), drinkKeys: drinkKeys(item) }),
    };
  });
}

export type OrderInput = {
  items: CartItem[];
  ordererName: string;
  phone: string;
  address: string;
  desiredStartAt: string;
  desiredEndAt: string;
};

/** Keep a retry key through refresh without storing the recipient or address. */
export async function orderRequestKey(input: OrderInput): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify({ ...input, items: orderItems(input.items) })),
  );
  const fingerprint = [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
  try {
    const saved = JSON.parse(sessionStorage.getItem("lb-pending-order") ?? "null");
    if (saved?.fingerprint === fingerprint && typeof saved.key === "string" && /^[0-9a-f-]{36}$/.test(saved.key)) {
      return saved.key;
    }
  } catch {
    /* Browser storage can be unavailable. The view still retains its in-memory key. */
  }
  const key = crypto.randomUUID();
  try {
    sessionStorage.setItem("lb-pending-order", JSON.stringify({ fingerprint, key }));
  } catch {
    /* optional browser cache */
  }
  return key;
}

export function clearOrderRequestKey() {
  try {
    sessionStorage.removeItem("lb-pending-order");
  } catch {
    /* optional browser cache */
  }
}

export async function jsonRequest(url: string, init: RequestInit = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("연결이 끊어졌습니다. 같은 주문으로 다시 시도하거나 주문 내역을 확인해주세요.");
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("주문 서버 응답을 확인하지 못했습니다. 다시 시도해주세요.");
  }
  if (!response.ok) {
    throw new Error(
      typeof body?.message === "string" ? body.message : "주문을 처리하지 못했습니다. 다시 시도해주세요.",
    );
  }
  return body;
}

export async function submitOrder(input: OrderInput, key: string): Promise<{ id: string; total: number }> {
  // The server keeps an existing guest session, including on retry.
  await jsonRequest("/api/v1/session", { method: "POST" });
  const body = await jsonRequest("/api/v1/orders", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({ ...input, items: orderItems(input.items) }),
  });
  if (typeof body.id !== "string" || !/^\d+$/.test(body.total) || !Number.isSafeInteger(Number(body.total))) {
    throw new Error("주문 접수 결과를 확인하지 못했습니다. 같은 주문으로 다시 시도해주세요.");
  }
  return { id: body.id, total: Number(body.total) };
}

export type ServerOrder = OrderRecord & { status: string };
export async function loadServerOrders(cursor?: string): Promise<{ items: ServerOrder[]; nextCursor: string | null }> {
  await jsonRequest("/api/v1/session", { method: "POST" });
  const query = new URLSearchParams({
    limit: "20",
    ...(cursor ? { cursor } : {}),
  });
  const page = await jsonRequest("/api/v1/orders?" + query);
  if (!Array.isArray(page.items) || (page.nextCursor !== null && typeof page.nextCursor !== "string")) {
    throw new Error("주문 내역을 확인하지 못했습니다.");
  }
  return {
    nextCursor: page.nextCursor,
    items: page.items.map(
      (order: {
        id: string;
        status: string;
        total: string;
        createdAt: string;
        address: string;
        addressDetail: string;
        desiredStartAt: string;
        desiredEndAt: string;
        items: {
          id: string;
          productId: string | null;
          productType?: "salad" | "drink" | "custom";
          name: string;
          options: string;
          quantity: number;
          unitPrice: string;
        }[];
      }) => {
        if (
          !deliveryWindowKST(order.desiredStartAt, order.desiredEndAt) ||
          !Number.isFinite(Date.parse(order.createdAt)) ||
          !/^\d+$/.test(order.total)
        ) {
          throw new Error("저장된 주문 내역을 확인하지 못했습니다.");
        }
        return {
          id: order.id,
          status: order.status,
          total: Number(order.total),
          createdAt: Date.parse(order.createdAt),
          address: [order.address, order.addressDetail].filter(Boolean).join(" "),
          desiredStartAt: order.desiredStartAt,
          desiredEndAt: order.desiredEndAt,
          items: order.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            productType: item.productType,
            name: item.name,
            options: item.options,
            qty: item.quantity,
            unitPrice: Number(item.unitPrice),
          })),
        };
      },
    ),
  };
}
