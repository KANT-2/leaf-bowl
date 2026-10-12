import "server-only";
import { prisma } from "@/infrastructure/database/prisma";
import { createPostgresIdentityRepository } from "@/infrastructure/identity/postgres";
import { createIdentityService, type IdentityService } from "@/modules/identity/service";
import { createPostgresOrdersRepository } from "@/infrastructure/orders/postgres";
import { createOrdersService, type OrdersService } from "@/modules/orders/service";
import { createRateLimiter, type RateLimiter } from "@/modules/shared/rate-limit";
import { createPaymentsService, type PaymentsService } from "@/modules/payments/service";
import { createPostgresPaymentsRepository } from "@/infrastructure/payments/postgres";
import { createTossGateway } from "@/infrastructure/payments/toss";

/**
 * 요청 제한 묶음 (분당).
 * - clientLogin·clientSession: 요청자별. TRUSTED_PROXY_HOPS 로 신뢰할 프록시를 알려 줬을 때만 적용된다 (clientKey).
 * - account: 로그인 시도의 아이디 단위(해시 칸). 접속자를 속여도 같은 아이디면 같은 칸이라 무차별 대입을 막는다.
 *   계정이 존재하는지와 무관하게 정해져서 응답으로 계정 존재 여부를 알 수 없다.
 * - globalLogin: 로그인 시도 전체 한도. 비밀번호 검사의 CPU 총량을 제한한다.
 * - globalSession: 비회원 세션 발급 전체 한도. 헤더를 매번 바꿔도 발급 속도가 이 값을 넘지 못한다.
 */
export interface Limits {
  clientLogin: RateLimiter;
  account: RateLimiter;
  globalLogin: RateLimiter;
  clientSession: RateLimiter;
  globalSession: RateLimiter;
  order: RateLimiter;
}

export function createLimits(
  perMinute: {
    clientLogin?: number;
    account?: number;
    globalLogin?: number;
    clientSession?: number;
    globalSession?: number;
    order?: number;
  } = {},
  now?: () => number,
): Limits {
  const make = (limit: number) => createRateLimiter(limit, 60_000, { now });
  return {
    clientLogin: make(perMinute.clientLogin ?? 10),
    account: make(perMinute.account ?? 10),
    globalLogin: make(perMinute.globalLogin ?? 120),
    clientSession: make(perMinute.clientSession ?? 30),
    globalSession: make(perMinute.globalSession ?? 120),
    order: make(perMinute.order ?? 20),
  };
}

export interface Services {
  orders: OrdersService;
  identity: IdentityService;
  limits: Limits;
  /** Omitted only by legacy isolated test doubles. The running app always has payments. */
  payments?: PaymentsService;
}

/**
 * PostgreSQL-backed services. Administrator provisioning happens explicitly in db:seed.
 */
export function createServices(): Services {
  const db = prisma();
  const identityRepository = createPostgresIdentityRepository(db);
  return {
    orders: createOrdersService({
      repository: createPostgresOrdersRepository(db),
    }),
    identity: createIdentityService({ repository: identityRepository }),
    payments: createPaymentsService({ repository: createPostgresPaymentsRepository(db), gateway: createTossGateway() }),
    limits: createLimits(),
  };
}

const globalForServices = globalThis as unknown as {
  __leafBowlServices?: Services;
};

/** 개발 중 코드가 다시 로드되어도 같은 저장소를 쓰도록 globalThis 에 둔다 */
export function services(): Services {
  return (globalForServices.__leafBowlServices ??= createServices());
}

/** 테스트에서 가짜 서비스로 바꿔 끼운다 */
export function setServicesForTests(value: Services | undefined): void {
  globalForServices.__leafBowlServices = value;
}
