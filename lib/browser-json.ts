/** 저장소 접근 실패·잘못된 JSON은 각 도메인이 지정한 초기값으로 복구한다. */
export function readBrowserJSON(key: string, fallback: unknown = null): unknown {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch { return fallback; }
}

export function writeBrowserJSON(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* 저장이 막혀 있으면 현재 세션의 메모리 상태를 유지한다. */ }
}
