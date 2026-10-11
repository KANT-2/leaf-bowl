import { AppError } from "./errors";

export interface RateLimiterOptions {
  now?: () => number;
  /** 동시에 기억하는 키의 최대 개수. 넘으면 가장 오래된 키부터 지운다 (만료된 키는 시간 구간마다 따로 정리한다) */
  maxKeys?: number;
}

/**
 * 고정 시간 구간 방식의 요청 제한 (서버 한 대 기준. 여러 대면 DB·Redis 로 옮겨야 한다).
 * 만료된 키는 시간 구간이 한 번 지날 때마다 한 번만 훑어서 지우고, 키 개수는 maxKeys 로 제한한다(가득 차면 가장 오래된 키 제거).
 * (예전에는 요청마다 전체 키를 순회해서 서로 다른 키 2만 개를 넣는 데 4초가 걸렸다.)
 */
export function createRateLimiter(limit: number, windowMs: number, options: RateLimiterOptions | (() => number) = {}) {
  const { now = Date.now, maxKeys = 10_000 } = typeof options === "function" ? { now: options } : options;
  const hits = new Map<string, { count: number; resetAt: number }>();
  let nextSweepAt = 0;

  function sweep(at: number): void {
    for (const [key, entry] of hits) if (entry.resetAt <= at) hits.delete(key);
    nextSweepAt = at + windowMs;
  }

  return {
    hit(key: string): void {
      const at = now();
      if (at >= nextSweepAt) sweep(at);
      const entry = hits.get(key);
      if (entry && entry.resetAt > at) {
        if (entry.count >= limit) throw new AppError(429, "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
        entry.count += 1;
        return;
      }
      // 가득 차면 가장 오래 전에 들어온 키를 버린다 (Map 은 넣은 순서를 기억한다). 만료된 키는 위의 구간별 정리가 맡으므로
      // 여기서 다시 훑지 않는다 — 새 키마다 전체를 훑으면 상한에 도달한 뒤 다시 O(n) 이 된다.
      if (!entry && hits.size >= maxKeys) hits.delete(hits.keys().next().value as string);
      hits.delete(key); // 만료된 키를 다시 넣을 때 순서를 맨 뒤로
      hits.set(key, { count: 1, resetAt: at + windowMs });
    },
    /** 지금 기억하는 키 개수 (시험·점검용) */
    size: () => hits.size,
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

/**
 * 요청자를 구분할 값. Route Handler 는 접속 IP 를 직접 알 수 없고 X-Forwarded-For 는 클라이언트가 채울 수
 * 있으므로, **신뢰할 수 있는 프록시가 앞에 있다고 설정했을 때만** 쓴다.
 *
 * - 환경변수 TRUSTED_PROXY_HOPS(앞단 프록시 개수, 기본 0)가 0 이면 헤더를 믿지 않고 null 을 돌려준다.
 *   이때 요청자별 제한은 걸 수 없으므로 호출하는 쪽이 전체 한도·계정 단위 한도로 막아야 한다.
 * - N 이 1 이상이면 오른쪽에서 N 번째 값을 쓴다. 프록시가 덧붙인 값이라 클라이언트가 바꿀 수 없다.
 *   (프록시가 원래 헤더를 덧붙이지 않고 덮어쓰는 구성이면 마지막 값이 곧 클라이언트이므로 N=1.)
 */
export function clientKey(request: Request): string | null {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);
  if (!Number.isInteger(hops) || hops < 1) return null;
  const parts = (request.headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - hops] ?? null;
}
