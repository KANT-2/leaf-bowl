/** BigInt 는 JSON 으로 직접 바꿀 수 없으므로 십진 문자열로 내려준다 (금액 규칙). */
export function toJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v)));
}
