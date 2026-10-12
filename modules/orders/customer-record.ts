export interface OrderItemRecord {
  name: string;
  /** 드레싱·음료 등 선택 내역, " · " 로 구분 */
  options: string;
  qty: number;
  unitPrice: number;
}

export interface OrderRecord {
  id: string;
  /** 주문(체험 주문 완료) 시각 */
  createdAt: number;
  /** 새 기록은 UTC ISO 시각을 저장한다. */
  desiredStartAt?: string;
  desiredEndAt?: string;
  /** 변환할 수 없는 과거 기록의 표시 호환용. 새 주문에는 저장하지 않는다. */
  day?: string;
  timeLabel?: string;
  address: string;
  total: number;
  items: OrderItemRecord[];
}
