/** Keep login navigation on the app's origin, including URL-parser normalization. */
export function safeReturnPath(value: string | null): string {
  const fallback = "/mypage";
  if (
    !value ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  ) {
    return fallback;
  }
  const origin = "https://return-path.invalid";
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}
