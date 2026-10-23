/**
 * FastAPI 회원 로그인 토큰(JWT) 저장소. 메모리와 sessionStorage 에 둔다.
 * 탭을 닫으면 사라지고 다른 탭과 나누지 않는다 (FastAPI 는 갱신 토큰이 없어 만료되면 다시 로그인한다).
 * useSyncExternalStore 와 함께 쓰며, 서버·하이드레이션 중에는 null 이다.
 */
export interface MemberToken {
  token: string;
  /** 만료 시각 (epoch ms) */
  expiresAt: number;
}

const KEY = "lb-member-token";
let value: MemberToken | null | undefined;
const listeners = new Set<() => void>();

function load(): MemberToken | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (typeof saved?.token === "string" && saved.token && Number.isFinite(saved.expiresAt)) {
      return { token: saved.token, expiresAt: saved.expiresAt };
    }
  } catch {
    /* 저장소를 쓸 수 없으면 이 탭의 메모리에만 둔다 */
  }
  return null;
}

export const memberTokenStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): MemberToken | null {
    if (value === undefined) {
      value = load();
    }
    return value;
  },
  getServerSnapshot: (): MemberToken | null => null,
  set(next: MemberToken | null) {
    value = next;
    try {
      if (next) {
        sessionStorage.setItem(KEY, JSON.stringify(next));
      } else {
        sessionStorage.removeItem(KEY);
      }
    } catch {
      /* optional browser cache */
    }
    listeners.forEach((listener) => listener());
  },
  /** 만료되지 않은 토큰. 만료됐으면 지우고 null */
  current(now = Date.now()): string | null {
    const saved = memberTokenStore.getSnapshot();
    if (!saved) {
      return null;
    }
    if (saved.expiresAt <= now) {
      memberTokenStore.set(null);
      return null;
    }
    return saved.token;
  },
};
