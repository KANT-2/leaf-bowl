import type { OrderRecord } from "./types";
import { deliveryWindowKST } from "@/lib/delivery-time";

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
  const delivery = deliveryWindowKST(o.desiredStartAt.toISOString(), o.desiredEndAt.toISOString())!;
  return {
    id: o.id,
    status: o.status,
    ordererName: o.ordererName,
    address: o.address,
    addressDetail: o.addressDetail,
    desiredStartAt: o.desiredStartAt.toISOString(),
    desiredEndAt: o.desiredEndAt.toISOString(),
    // 기존 클라이언트 호환용 표시 필드. 저장소에는 UTC 시각만 보관한다.
    desiredDate: delivery.day,
    desiredSlot: delivery.timeLabel,
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
