/** 배달 운영 시간. open·close 는 0~24 정시(시)이고, 장바구니 시간대는 이 범위에서 한 시간 단위로 만든다. */
export interface DeliveryHours {
  days: string;
  open: number;
  close: number;
}

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** 예: "매일 10:00–21:00" */
export function formatDeliveryHours({
  days,
  open,
  close,
}: DeliveryHours): string {
  return `${days} ${hh(open)}–${hh(close)}`;
}
