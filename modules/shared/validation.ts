export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** JSON dictionaries can contain arbitrary IDs; inherited properties are not data. */
export function ownValue<T>(
  dictionary: Record<string, T>,
  key: string,
): T | undefined {
  return Object.prototype.hasOwnProperty.call(dictionary, key)
    ? dictionary[key]
    : undefined;
}

export function isProductId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 10000
  );
}
