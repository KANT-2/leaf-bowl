import type { OrderRecord } from "./types";

/** 응답에는 필요한 필드만 고른다 (docs/api-design.md §3). 금액은 BigInt 라 toJson 이 문자열로 바꾼다. */
function optionsLabel(options: OrderRecord["items"][number]["options"]): string {
  return [options.dressing?.name, ...options.drinks.map((d) => d.name), ...options.ingredients.map((i) => i.name), ...(options.custom ?? []).map((c) => c.name)]
    .filter(Boolean)
    .join(" · ");
}

export function createdView(o: OrderRecord) {
  return {
    id: o.id,
    status: o.status,
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    total: o.total,
    createdAt: o.createdAt.toISOString(),
  };
}

export function detailView(o: OrderRecord) {
  return {
    id: o.id,
    status: o.status,
    ordererName: o.ordererName,
    address: o.address,
    addressDetail: o.addressDetail,
    desiredDate: o.desiredDate,
    desiredSlot: o.desiredSlot,
    items: o.items.map((i) => ({
      name: i.name,
      options: optionsLabel(i.options),
      unitPrice: i.unitPrice,
      quantity: i.quantity,
    })),
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    total: o.total,
    createdAt: o.createdAt.toISOString(),
  };
}

export function cancelView(o: OrderRecord) {
  return { id: o.id, status: o.status, canceledAt: o.canceledAt?.toISOString() ?? null };
}

export function statusView(o: OrderRecord) {
  return { id: o.id, status: o.status, version: o.version };
}

export function adminListItemView(o: OrderRecord) {
  return {
    id: o.id,
    status: o.status,
    version: o.version,
    ordererName: o.ordererName,
    total: o.total,
    createdAt: o.createdAt.toISOString(),
  };
}
