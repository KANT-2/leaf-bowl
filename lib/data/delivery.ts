/** 배달 운영 시간. open·close 는 0~24 정시(시)이고, 장바구니 시간대는 이 범위에서 한 시간 단위로 만든다. */
export interface DeliveryHours {
  days: string;
  open: number;
  close: number;
}

/** 이전 형식·메모리 어댑터 테스트용 기준. 서버 실행은 lib/data/server의 DB 조회를 사용한다. */
export const REFERENCE_DELIVERY_HOURS: DeliveryHours = { days: "매일", open: 10, close: 21 };

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** 예: "매일 10:00–21:00" */
export function formatDeliveryHours({ days, open, close }: DeliveryHours): string {
  return `${days} ${hh(open)}–${hh(close)}`;
}
