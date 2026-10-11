import { readCatalog } from "@/lib/admin/store";
import { hashPassword } from "./identity/crypto";
import { createMemoryIdentityRepository, type AdminUserRecord } from "./identity/repository";
import { createIdentityService, type IdentityService } from "./identity/service";
import { createMemoryOrdersRepository } from "./orders/memory-repository";
import { createOrdersService, type OrdersService } from "./orders/service";
import { createRateLimiter, type RateLimiter } from "./shared/rate-limit";

/**
 * 요청 제한 묶음 (분당).
 * - clientLogin·clientSession: 요청자별. TRUSTED_PROXY_HOPS 로 신뢰할 프록시를 알려 줬을 때만 적용된다 (clientKey).
 * - account: 로그인 시도의 계정 단위. 접속자를 속여도 같은 계정이면 같은 칸이라 무차별 대입을 막는다.
 * - globalSession: 비회원 세션 발급 전체 한도. 헤더를 매번 바꿔도 발급 속도가 이 값을 넘지 못한다.
 */
export interface Limits {
  clientLogin: RateLimiter;
  account: RateLimiter;
  clientSession: RateLimiter;
  globalSession: RateLimiter;
  order: RateLimiter;
}

export function createLimits(
  perMinute: { clientLogin?: number; account?: number; clientSession?: number; globalSession?: number; order?: number } = {},
  now?: () => number,
): Limits {
  const make = (limit: number) => createRateLimiter(limit, 60_000, { now });
  return {
    clientLogin: make(perMinute.clientLogin ?? 10),
    account: make(perMinute.account ?? 10),
    clientSession: make(perMinute.clientSession ?? 30),
    globalSession: make(perMinute.globalSession ?? 120),
    order: make(perMinute.order ?? 20),
  };
}

export interface Services {
  orders: OrdersService;
  identity: IdentityService;
  limits: Limits;
}

/**
 * 서비스를 한곳에서 조립한다. DB 로 바꿀 때 route.ts 와 업무 규칙(service.ts)은 그대로 쓰지만,
 * 저장소 계약은 트랜잭션을 표현하도록 바꿔야 한다 (docs/db-design.md "저장소 트랜잭션 계약").
 *
 * 임시 관리자 계정: 환경변수 ADMIN_LOGIN_ID, ADMIN_PASSWORD 가 모두 있을 때만 만든다.
 * 기본 비밀번호는 없다 (설정하지 않으면 어떤 로그인도 실패한다).
 */
export function createServices(): Services {
  const admins: AdminUserRecord[] = [];
  const loginId = process.env.ADMIN_LOGIN_ID;
  const password = process.env.ADMIN_PASSWORD;
  const identityRepository = createMemoryIdentityRepository(admins);
  if (loginId && password) {
    // 해시 계산이 끝나기 전에 로그인 요청이 오지 않도록 목록에 넣는 시점을 첫 로그인 직전으로 미룬다
    const ready = hashPassword(password).then((passwordHash) => {
      admins.push({ id: "admin-1", loginId, passwordHash });
    });
    const original = identityRepository.findAdminByLoginId;
    identityRepository.findAdminByLoginId = async (id) => {
      await ready;
      return original(id);
    };
  }
  return {
    orders: createOrdersService({
      repository: createMemoryOrdersRepository(),
      getCatalog: async () => (await readCatalog()).catalog,
    }),
    identity: createIdentityService({ repository: identityRepository }),
    limits: createLimits(),
  };
}

const globalForServices = globalThis as unknown as { __leafBowlServices?: Services };

/** 개발 중 코드가 다시 로드되어도 같은 저장소를 쓰도록 globalThis 에 둔다 */
export function services(): Services {
  return (globalForServices.__leafBowlServices ??= createServices());
}

/** 테스트에서 가짜 서비스로 바꿔 끼운다 */
export function setServicesForTests(value: Services | undefined): void {
  globalForServices.__leafBowlServices = value;
}
