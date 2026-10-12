export function money(value: number): string {
  return value.toLocaleString("ko-KR") + "원";
}
