import { AppError } from "../shared/errors";

/** 접수 → 확인 → 준비 중 → 배달 중 → 완료. 취소는 접수·확인에서만. db/schema.sql 의 트리거와 같은 규칙이다. */
export const ORDER_STATUSES = ["received", "confirmed", "preparing", "delivering", "completed", "canceled"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const NEXT: Record<OrderStatus, readonly OrderStatus[]> = {
  received: ["confirmed", "canceled"],
  confirmed: ["preparing", "canceled"],
  preparing: ["delivering"],
  delivering: ["completed"],
  completed: [],
  canceled: [],
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
  received: "접수",
  confirmed: "확인",
  preparing: "준비 중",
  delivering: "배달 중",
  completed: "완료",
  canceled: "취소",
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return NEXT[from].includes(to);
}

/** 관리자가 고를 수 있는 다음 상태 */
export function nextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return NEXT[from];
}

export function isCancelable(status: OrderStatus): boolean {
  return canTransition(status, "canceled");
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new AppError(409, `${STATUS_LABEL[from]} 상태의 주문은 ${STATUS_LABEL[to]}(으)로 바꿀 수 없습니다.`);
  }
}

export type CancelOutcome = "cancel" | "already-canceled";

/** 취소 요청 처리: 이미 취소된 주문은 현재 결과를 그대로 돌려주고, 취소할 수 없는 상태는 409. */
export function resolveCancel(status: OrderStatus): CancelOutcome {
  if (status === "canceled") {
    return "already-canceled";
  }
  if (!isCancelable(status)) {
    throw new AppError(409, "준비가 시작된 주문은 취소할 수 없습니다.");
  }
  return "cancel";
}
