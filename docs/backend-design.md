# leaf & bowl 백엔드 설계

[백엔드 요구사항](backend-requirements.md)은 **현재 leaf-bowl 레포 안에서 Next.js App Router + TypeScript + Prisma + PostgreSQL**로 구현한다. 고객·관리자 화면과 API를 하나의 Next.js 앱·접속 도메인·배포 단위로 운영한다. 주문 접수·조회·관리자 처리·취소가 핵심이며 매장 관리 기능은 제외한다.

## 단일 앱 구성과 요청 흐름

| 경로 | 역할 |
| --- | --- |
| `/`, `/menu`, `/product/[id]` | 고객 화면 |
| `/admin` | 관리자 화면과 주문 처리 UI |
| `/api/v1/*` | 같은 앱의 주문·인증 등 신규 Route Handlers |

브라우저는 상대 경로 `/api/v1/*`로 요청한다. 여기서 API는 화면이 서버에 주문 생성이나 조회를 요청하는 창구다. 같은 Next.js 앱이 화면도 만들고 이 요청도 처리한다. 브라우저에서 실행하는 화면 코드는 API를 호출하고, 서버에서 실행하는 화면 코드인 Server Component는 아래의 서비스를 직접 호출해 조회할 수 있다. 운영·검증은 기존 배포 환경을 사용하되 DB·이미지 저장 영역은 각각 분리한다.

## 디렉토리 구조와 예정 화면

현재 구현의 모듈 경계는 [아키텍처 가이드](architecture.md)를 따른다. 아래는 현재 서버 코드 구조와 앞으로 추가할 주문 상세·관리자 주문 화면을 함께 표시했다. 추가할 화면은 주석으로 구분하며 화면 파일이 이미 존재함을 의미하지 않는다.

```text
leaf-bowl/
├─ app/                              # 화면 주소와 API 주소
│  ├─ (customer)/                    # 기존 고객 화면 묶음
│  │  ├─ page.tsx                    # 기존 홈 화면 /
│  │  ├─ product/[id]/page.tsx        # 기존 상품 상세
│  │  └─ orders/[id]/page.tsx         # 추가할 고객 주문 상세
│  ├─ admin/
│  │  ├─ page.tsx                    # 기존 관리자 화면
│  │  └─ orders/
│  │     ├─ page.tsx                 # 추가할 주문 목록
│  │     └─ [id]/page.tsx             # 추가할 주문 상세·처리
│  └─ api/
│     ├─ catalog/route.ts            # 기존 고객 카탈로그 API
│     ├─ admin/catalog/route.ts      # 기존 관리자 카탈로그 API
│     └─ v1/                        # 현재 주문·인증 API 묶음
│        ├─ session/route.ts         # 비회원 방문자 세션 발급
│        ├─ auth/login/route.ts      # 관리자 로그인
│        ├─ auth/logout/route.ts     # 관리자 로그아웃
│        ├─ orders/
│        │  ├─ route.ts              # POST: 주문 생성
│        │  └─ [id]/
│        │     ├─ route.ts           # GET: 본인 주문 조회
│        │     └─ cancel/route.ts    # POST: 주문 취소
│        └─ admin/orders/
│           ├─ route.ts              # GET: 관리자 주문 목록
│           └─ [id]/status/route.ts  # PATCH: 주문 상태 변경
├─ components/                      # 기존 버튼·장바구니 등 화면 조각
├─ modules/                         # 저장소·화면과 독립적인 계약·업무 규칙
│  ├─ orders/                       # 주문 서비스·가격 계산·저장소 인터페이스
│  ├─ identity/                     # 관리자·비회원 세션과 권한 규칙
│  ├─ catalog/                      # 공통 스키마·상태 변경·고객 조회 모델
│  ├─ cart/                         # 항목 식별·변형·수량·가격 표시 계산
│  ├─ profile/                      # 데모 프로필·배송지 상태 변경
│  └─ settings/                     # DB 설정 계약
├─ application/                     # 저장소 조합·카탈로그 트랜잭션·서버 조회
├─ infrastructure/                  # PostgreSQL·HTTP·브라우저 어댑터
├─ features/                        # 화면별 표시·입력·요청
├─ seed/                            # SQL 초기화·명시적 레거시 이관
├─ prisma/
│  ├─ schema.prisma                 # DB 테이블·관계·제약 정의
│  ├─ migrations/                   # DB 구조 변경 이력
│  └─ seed.ts                       # 초기 데이터 입력
├─ generated/prisma/                # Prisma가 자동 생성하는 코드
├─ tests/postgres.integration.cjs   # 실제 DB 통합 검증
├─ prisma.config.ts                 # Prisma CLI의 경로·DB 설정
├─ package.json                     # 기존 의존성·실행 명령
└─ next.config.ts                   # 기존 Next.js 설정
```

`(customer)`의 괄호는 고객 화면끼리 묶는 표시이며 URL에는 포함되지 않는다. `[id]`는 상품이나 주문 번호가 들어갈 자리다. 예를 들어 `app/api/v1/orders/[id]/route.ts`는 `/api/v1/orders/주문번호` 요청을 받는다. `page.tsx`는 사람이 보는 화면, `route.ts`는 요청을 받고 데이터를 반환하는 파일이다. `v1`은 API 규격의 첫 번째 버전을 뜻하며 다른 서버나 도메인을 의미하지 않는다.

## 왜 이 구조인가

**app에는 요청을 받는 입구를 둔다.** Next.js가 파일 위치로 화면과 API 주소를 정하므로 page.tsx·route.ts를 app에 둔다. 이 위치는 Next.js 규칙이다. 반면 modules라는 이름은 우리가 기능을 찾기 쉽게 정한 이름이며 Next.js의 예약 폴더가 아니다.

**관련 기능은 한곳에 모은다.** 주문 규칙은 modules/orders, 상품 규칙은 modules/catalog에 모은다. 주문을 수정할 때 orders 폴더부터 찾아보면 된다. 고객 주문 상세와 관리자 주문 상세는 권한이 다르지만 같은 주문 데이터를 다루므로, 공통 조회·처리 코드를 함께 사용한다.

**요청 처리, 업무 규칙, DB 작업은 따로 둔다.** route.ts는 “입력이 올바른가, 이 사람이 요청할 권한이 있는가”를 확인한다. service.ts는 “품절 상품을 주문할 수 있는가, 준비 중인 주문을 취소할 수 있는가”를 판단한다. repository.ts는 저장소가 제공해야 하는 계약을 정의하고 infrastructure/orders/postgres.ts가 DB 조회·저장을 구현한다. 배달비 계산이 바뀌면 service.ts, DB 조회 방식이 바뀌면 repository.ts를 먼저 확인하면 된다. 파일 수는 늘지만 한 파일에서 이해해야 할 내용은 줄어든다.

**DB 연결과 DB 구조도 구분한다.** infrastructure/database/prisma.ts는 여러 기능이 사용하는 공통 연결이고, prisma/schema.prisma는 어떤 데이터를 저장할지 정하는 설계다. migrations는 그 설계가 바뀐 기록이다. generated/prisma는 이 설계에서 Prisma가 만들어주는 코드이므로 직접 수정하지 않는다.

orders 외의 기능도 필요에 따라 같은 파일 구성을 따른다. 단순 조회 기능은 적은 파일로 시작하고 별도 인터페이스·기반 클래스는 미리 만들지 않는다. 운영 카탈로그는 application/catalog.ts의 PostgreSQL 트랜잭션을 사용하고 주문은 application/container.ts가 PostgreSQL 어댑터를 주입한다. 파일·메모리 저장소는 tests/fixtures에 격리한다. 전체 의존성 규칙은 [아키텍처 가이드](architecture.md)를 따른다.

## 주문 버튼을 누르면 일어나는 일

1. 주문 화면이 상품·옵션·재료 ID, 수량, 배달 정보와 재전송 식별키를 `/api/v1/orders`에 보낸다.
2. orders/route.ts가 방문자 세션을 확인하고 schema.ts로 입력을 검사한다. TypeScript 타입은 개발 중 실수를 찾는 도구이고, Zod 검사는 실제로 들어온 요청을 검사하는 도구다.
3. orders/service.ts가 catalog의 DB 데이터를 조회해 판매 상태와 옵션을 확인하고 최신 가격을 계산한다. 화면이 보낸 가격을 신뢰하면 가격을 바꿔 전송할 수 있으므로 서버가 직접 계산한다.
4. service.ts가 저장 묶음을 시작하고 repository.ts에 전달한다. repository.ts는 Prisma를 통해 주문·주문 항목·접수 이력을 PostgreSQL에 기록한다.
5. 모든 기록이 성공하면 주문 번호·금액·접수 상태를 응답한다. 화면은 서버 응답을 받은 뒤 주문 완료를 표시한다. 중간 실패는 주문 완료로 처리하지 않는다.

서버 코드는 브라우저로 전달하지 않는다. Prisma 연결·Repository·서버 서비스에 `server-only`를 적용하고 DATABASE_URL을 NEXT_PUBLIC 환경변수에 넣지 않는다. API는 Node.js runtime에서 실행하고 주문·인증 응답에는 `Cache-Control: no-store`를 적용해 예전 응답이 재사용되지 않게 한다. params와 cookies API는 설치된 Next.js 가이드에 맞춰 await한다.

## Prisma 구성과 데이터 모델

PostgreSQL은 실제 데이터를 보관하는 DB이고, Prisma는 TypeScript 코드로 그 데이터를 조회·저장하도록 도와주는 도구다. 모델은 “상품에는 이름·가격·상태가 있다”처럼 저장할 데이터의 모양을 정의한다. 주문 모델을 정의한 뒤 Prisma Client의 order.create·order.findUnique 같은 함수로 DB를 사용할 수 있다.

Prisma ORM 7 계열을 기준으로 CLI·Client·adapter 버전을 맞춰 고정한다. `prisma-client` generator의 출력을 `generated/prisma`로 지정하고 `infrastructure/database/prisma.ts`에서 PostgreSQL 연결 도구인 PrismaPg adapter와 Client를 생성한다. 개발 중 코드가 다시 로드될 때 연결이 계속 늘어나지 않도록 globalThis로 재사용하고 운영에서는 연결 수·대기 시간을 제한한다. prisma.config.ts에 경로·DB URL을 설정하고 CLI 환경변수를 명시적으로 로드한다. [Prisma 7 구성](https://docs.prisma.io/docs/guides/upgrade-prisma-orm/v7)

| 주요 모델 | 필드와 제약 |
| --- | --- |
| `Product`, `OptionGroup`, `OptionChoice`, `Ingredient` | 기존 ID·customerId·금액·상태 및 연결 테이블 보존. 기존 테이블·컬럼은 @@map·@map으로 대응 |
| `AdminUser`, `Session` | 비밀번호 해시, 세션 토큰 해시·관리자 또는 비회원 구분·만료 시각 |
| `Order` | UUID, 고객 세션 ID, 상태·version, 주문자·연락처·주소·희망 시각, 상품 합계·배달비·총액, requestKey·requestHash. 고객 세션 ID와 requestKey에 복합 유일 제약 |
| `OrderItem`, `OrderStatusHistory` | 주문 FK, 상품명·옵션·재료·단가·수량 스냅샷 / 이전·다음 상태·변경자·사유·시각 |

주문 항목에는 **주문 당시 값의 복사본인 스냅샷**을 저장한다. 예를 들어 오늘 11,000원에 주문한 상품이 내일 12,000원이 되어도 오늘 주문 금액은 11,000원으로 남아야 하기 때문이다. 주문과 주문 항목은 주문 ID로 연결한다. 처리 이력도 같은 주문 ID로 연결해 누가 언제 상태를 바꿨는지 확인한다.

금액은 원 단위 정수로 저장한다. 주문 합계는 큰 정수를 다루는 BigInt로 계산·저장하고 JSON 응답에서는 십진 문자열로 변환한다. 시각은 UTC로 저장하고 화면은 한국 시간으로 표시한다. 주문 목록에 `(status, createdAt, id)` 검색용 인덱스를 두고 마지막으로 조회한 주문을 기준으로 다음 목록을 가져온다. 리뷰·콘텐츠는 기존 모델을 이관하고 이미지는 DB에 저장 위치·파일 정보, 영속 저장소에 원본을 보관한다.

## 주문 API와 트랜잭션 처리

POST는 생성·처리 요청, GET은 조회, PATCH는 일부 정보 변경에 사용한다. 앞의 디렉토리 구조에 있는 주문 API가 각각 생성·상세 조회·취소·관리자 목록·상태 변경을 담당한다. 요청·응답에 사용할 데이터 모양을 DTO라고 부르며, OpenAPI에 API별 입력·응답·권한을 기록한다. DB 모델에는 내부 정보가 포함될 수 있으므로 응답에 필요한 필드만 선택한다.

**트랜잭션은 여러 DB 작업을 전부 성공하거나 전부 취소하도록 묶는 기능이다.** 주문만 저장되고 주문 항목이 저장되지 않으면 불완전한 주문이 생긴다. 주문·항목·이력은 한 트랜잭션 안에서 저장한다. Service가 시작한 저장 묶음인 tx를 모든 Repository 호출에 전달해 같은 트랜잭션을 사용하게 한다.

**재전송 식별키는 같은 주문이 두 번 생성되는 것을 막는다.** 첫 주문 요청 때 화면이 Idempotency-Key를 만들고 통신 실패 후 재시도에도 같은 키를 보낸다. prisma.$transaction 안에서 기존 키·요청 내용 확인 → 상품 검증·가격 계산 → 주문·항목·초기 이력 저장을 수행한다. 같은 고객 세션과 같은 키로 같은 내용을 보내면 기존 주문, 다른 내용을 보내면 409 충돌을 반환한다. 키 중복 제약의 P2002 오류는 트랜잭션 취소 후 기존 주문을 재조회해 처리한다.

가격 계산 중 관리자가 상품을 바꾸면 계산 기준이 흔들릴 수 있다. 이를 막기 위해 주문은 카탈로그 버전 관리 행을 읽기 잠금하고, 관리자 저장은 같은 행을 쓰기 잠금한다. 읽기 잠금끼리는 함께 진행할 수 있지만 쓰기 잠금은 읽기 작업이 끝날 때까지 기다린다. Prisma의 파라미터화한 $queryRaw로 이 잠금만 직접 수행하고 일반 조회·저장은 Prisma 모델을 사용한다.

상태는 `접수 → 확인 → 준비 중 → 배달 중 → 완료`, 접수·확인에서만 취소한다. 두 관리자가 동시에 수정하면 늦은 요청이 앞의 변경을 덮어쓰지 않아야 한다. 주문에 version 번호를 두고 tx.order.updateMany의 조건을 `id + version + 현재 상태`로 제한한다. 성공 시 version을 증가시키고 이력을 함께 저장한다. 변경 건수가 0이면 이미 다른 변경이 있었다는 뜻이므로 409를 반환한다. 이미 취소된 주문의 취소 재요청은 현재 결과를 반환한다. DB의 일시적 충돌 P2034는 최대 3회 재시도하고 외부 API·파일 업로드는 트랜잭션 밖에서 처리한다. [Prisma 트랜잭션](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions)

## 인증과 접근 제어

세션은 서버가 “어느 관리자 또는 방문자의 요청인가”를 구분하는 기록이다. identity에서 관리자 로그인과 비회원 세션을 처리하고, 브라우저 쿠키의 식별값으로 DB의 세션·만료를 확인한다. 고객은 본인 주문, 관리자는 관리 권한이 있는 주문만 조회·처리한다. 관리자·고객 쿠키를 구분하고 JavaScript가 읽을 수 없으며 운영 HTTPS에서 전달되도록 보호한다. 외부 사이트에서 원치 않는 변경 요청을 보내는 일을 막는 CSRF 방어와 요청 제한을 적용한다. API와 서버 서비스 양쪽의 진입점에서 권한을 검사하며 연락처·주소는 허용된 상세 응답에만 포함한다.

## 구현 순서와 배포

구현 순서는 **현재 앱에 Prisma 추가 → 모델·DB 변경 이력·기존 데이터 이관 → 인증 → 상품 조회·관리 통합 → 주문 API → 고객·관리자 주문 화면 → 통합 검증**이다. DB와 상품 조회가 준비되어야 주문 검증을 만들 수 있고, API가 준비되어야 화면이 실제 주문을 접수할 수 있기 때문이다. 기존 /api/catalog·/api/admin/catalog 등은 같은 서비스에 연결해 호환성을 유지한다.

마이그레이션은 “주문 테이블을 추가한다” 같은 DB 구조 변경을 기록하고 적용하는 절차다. 이미 DB가 있으면 db pull로 현재 구조를 가져와 baseline이라는 초기 기준 이력을 등록한다. 없으면 초기 migration을 생성한다. 기존 CHECK 제약은 migration SQL에 보존한다. seed.ts는 빈 개발·검증 DB의 초기 데이터용이며 운영 데이터를 매번 초기화하는 용도로 사용하지 않는다. [기존 DB 편입](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/baselining)

개발은 `prisma migrate dev`, 검증·운영은 `prisma migrate deploy`를 사용한다. 기존 Frontend CI에 Prisma validate·generate와 격리 DB 통합 테스트를 추가하고 lint·Next.js build·빌드 후 타입 검사를 유지한다. 앱 전체를 함께 빌드·배포하며 migration은 배포 단계에서 한 번 적용한다. 후보 서버의 화면·API·DB 상태 확인 후 전환하고 이관 백업·쓰기 제한·ID 대조 및 앱 롤백 시 신규 주문 보존 절차를 마련한다. [마이그레이션 운영](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production)
