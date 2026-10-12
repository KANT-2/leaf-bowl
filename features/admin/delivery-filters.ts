import { type OrderStatus } from "@/modules/orders/status";

export interface DeliveryOrder {
  id: string;
  status: OrderStatus;
  ordererName: string;
  phone: string;
  address: string;
  addressDetail: string;
  desiredDate: string;
  desiredSlot: string;
  createdAt: string;
  total: string;
  items: { name: string; options: string; quantity: number }[];
}

export type DeliveryGroupBy = "month" | "day";

export interface DeliveryFilter {
  status: OrderStatus | "all";
  query: string;
  month: string;
  day: string;
  hour: string;
}

/** 배달 시간대 문구("12:00–13:00")의 시작 시각 */
export function slotHour(slot: string): number {
  return Number.parseInt(slot, 10);
}

export function filterDeliveryOrders(orders: DeliveryOrder[], filter: DeliveryFilter): DeliveryOrder[] {
  const query = filter.query.trim().toLowerCase();
  return orders.filter(
    (order) =>
      (filter.status === "all" || order.status === filter.status) &&
      (!filter.month || order.desiredDate.startsWith(filter.month)) &&
      (!filter.day || order.desiredDate === filter.day) &&
      (filter.hour === "" || slotHour(order.desiredSlot) === Number(filter.hour)) &&
      (!query ||
        [
          order.ordererName,
          order.phone,
          order.address,
          order.addressDetail,
          order.id,
          ...order.items.map((item) => item.name),
        ].some((text) => text.toLowerCase().includes(query))),
  );
}

/** 배달 날짜(YYYY-MM-DD)를 묶음 단위(월 YYYY-MM 또는 일)로 자른 키 */
export function deliveryGroupKey(order: Pick<DeliveryOrder, "desiredDate">, groupBy: DeliveryGroupBy): string {
  return order.desiredDate.slice(0, groupBy === "month" ? 7 : 10);
}

/** 선택 가능한 월·날짜 목록 (최신순). 날짜는 선택한 월 안에서만 */
export function deliveryDateOptions(orders: Pick<DeliveryOrder, "desiredDate">[], month: string) {
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort().reverse();
  return {
    months: unique(orders.map((order) => order.desiredDate.slice(0, 7))),
    days: unique(orders.map((order) => order.desiredDate).filter((value) => !month || value.startsWith(month))),
  };
}

/** "2026-10-13" → "2026년 10월 13일", "2026-10" → "2026년 10월" */
export function deliveryGroupLabel(key: string): string {
  return key
    ? key
        .split("-")
        .map((part, index) => `${Number(part)}${["년", "월", "일"][index]}`)
        .join(" ")
    : "날짜 미확인";
}

/**
 * 같은 묶음끼리 모아 보여준다. 입력은 접수 최신순이며, 묶음의 순서는 배달 날짜 최신순,
 * 묶음 안에서는 입력(접수 최신순) 순서를 유지한다.
 */
export function groupDeliveryOrders(orders: DeliveryOrder[], groupBy: DeliveryGroupBy): [string, DeliveryOrder[]][] {
  const groups = new Map<string, DeliveryOrder[]>();
  for (const order of orders) {
    const key = deliveryGroupKey(order, groupBy);
    groups.set(key, [...(groups.get(key) ?? []), order]);
  }
  return [...groups].sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));
}

export const DELIVERY_PAGE_SIZE = 8;

/** 목록을 페이지로 나눈다. 범위를 벗어난 쪽 번호는 마지막·첫 쪽으로 맞춘다 */
export function paginateDeliveryOrders<T>(items: T[], page: number, size = DELIVERY_PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  return { items: items.slice((current - 1) * size, current * size), page: current, pageCount };
}
