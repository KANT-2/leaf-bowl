# PostgreSQL 실행과 기존 데이터 이관

서버의 카탈로그·리뷰·주문·결제 초안·관리자와 비회원 세션은 PostgreSQL에 저장한다. 이미지 파일은 `ADMIN_DATA_DIR/images`에 둔다. 고객 프로필·장바구니·취향·저장한 조합은 기존 브라우저 저장을 유지한다. 토스 테스트 결제 설정과 복구 절차는 [payments.md](payments.md)에 있다. 실제 회원 인증·청구는 포함하지 않는다.

## 처음 실행

Node.js 22.12 이상과 PostgreSQL 18을 준비한다. 앱 전용 DB와 소유 계정을 생성하고 `.env.example`을 `.env.local`로 복사해 연결 주소를 설정한다. 런타임 계정에는 superuser·DB 생성 권한을 주지 않는다. `SHADOW_DATABASE_URL`은 `prisma migrate dev`를 사용할 때만 별도의 빈 DB로 지정한다.

```sh
cp .env.example .env.local
chmod 600 .env.local
# .env.local의 DATABASE_URL을 설정한다.
npm ci
npm run db:validate
npm run db:migrate
npm run db:seed
npm run dev
```

`db:seed`는 `db/seed.sql`을 그대로 실행한다. 빈 카탈로그에는 상품 21개·재료 18개·리뷰 48개와 분류·옵션·알레르기·사이트 콘텐츠·메타데이터를 저장한다. `app_settings`에는 홈 배너·배송시간·가격 정책·영양정보·옵션 열량·재료 이모지·카탈로그 추천/분류/편집 선택지 7개 설정을 넣는다. 기존 카탈로그와 설정은 재실행해도 덮어쓰지 않으며, 기존 DB에 없는 설정만 추가한다. 중간 오류는 전체 롤백한다.

관리자 계정은 `ADMIN_LOGIN_ID`·`ADMIN_PASSWORD`를 모두 설정한 경우에만 만들고 기존 계정의 비밀번호는 덮어쓰지 않는다. 비밀번호는 scrypt 해시, 쿠키 토큰은 SHA-256 해시로만 DB에 저장한다. 기본 관리자 비밀번호는 없다. 기존 계정의 비밀번호를 바꾸려면 별도의 관리자 관리 작업이 필요하다.

### SQL 파일로 초기화

마이그레이션을 적용한 DB에서는 다음 명령이 `db:seed`의 기본 데이터 초기화와 같다. `DATABASE_URL`은 현재 셸에 안전하게 주입한다. 이 SQL은 관리자 계정·사용자 주문·세션을 생성하지 않는다.

```sh
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/seed.sql
```

Prisma 없이 완전히 비어 있는 DB를 SQL로 준비할 때는 다음 순서로 실행한다. `db/schema.sql`은 현재 모든 마이그레이션의 테이블·제약·뷰·트리거를 포함하며 기존 DB에 재실행하는 파일은 아니다.

```sh
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/schema.sql
psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/seed.sql
```

직접 생성한 DB에는 Prisma의 적용 이력이 없다. 이후 Prisma로 관리하려면 스키마 일치를 확인한 뒤 `prisma migrate resolve --applied`로 `0001_baseline`부터 `0006_toss_test_payments`까지 각각 등록한다. 처음부터 Prisma를 사용할 앱에는 `npm run db:migrate`를 권장한다.

서버와 고객 화면은 DB 설정을 읽으며 주문 합계도 DB 가격 정책으로 계산한다. SQL로 설정을 바꿀 때는 `updated_at`도 갱신해야 열린 고객 화면이 새 설정을 감지한다.

```sql
UPDATE app_settings
SET value = jsonb_set(value, '{deliveryFee}', '3500'::jsonb),
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'pricing_policy';
```

설정은 `modules/settings/schema.ts`로 검증한다. 누락·오류가 있으면 조회를 실패시키며 정적 기본값으로 복원하지 않는다. `0005_catalog_config`는 기존 DB에 없는 운영 설정을 한 번 추가하고 기존 값을 보존한다. 적용 전 앱에는 새로운 계약이 없으므로 마이그레이션을 먼저 실행한다.

`catalog_config`는 카테고리 API 분류, 알레르기 표시 순서/편집 선택지, 재료 분류, 원산지 선택지, 재료별 추천 상품 번호, 배송 요청 선택지를 저장한다. 현재 전용 설정 편집 UI는 없으며 SQL로 관리한다. 추천 번호는 상품의 영속 `customerId`이고 삭제·품절된 상품이면 현재 공개 상품에서 대안을 선택한다.

```sql
UPDATE app_settings
SET value = jsonb_set(value, '{bowlRecommendations,chicken}', '5'::jsonb),
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'catalog_config';
```

설치 중 Prisma postinstall의 종료 코드 139가 발생한 개발 컨테이너에서는 Node 22.23.3으로 교체한 뒤 generate·검증이 정상 동작했다. 이 현상을 일반적인 Node 22 문제로 단정하지 않는다. 로컬 버전은 `node --version`으로 확인한다.


컨테이너 기본 `NODE_ENV=production`은 개발 의존성을 설치하지 않으므로 개발 서버 준비에는 `NODE_ENV=development npm ci --include=dev`를 사용한다. 개발 서버 역시 `NODE_ENV=development`로 시작한다.

## 기존 JSON을 가져오는 경우

기존 앱의 저장을 잠시 멈추고 카탈로그·이미지 디렉터리를 보관한다. 새 DB에서 **seed보다 먼저** 실행한다.

```sh
npm run db:migrate
npm run db:import -- /absolute/path/to/catalog.json
npm run db:seed
```

가져오기는 원본과 같은 바이트의 `catalog.json.postgres-backup.<SHA256>.json`을 권한 600으로 생성한다. 고객 상품 번호, 다음 번호, revision, 리뷰 삭제 이력, 리뷰 UTC 시각과 표시 정보, 원산지·옵션·시즌 페이지를 유지한다. 이전 schemaVersion 1~3은 기존 변환 규칙으로 정규화하고 4는 현재 형식으로 처리한다.

파일 체크섬을 DB에 기록하므로 같은 파일의 재실행은 아무 데이터도 바꾸지 않는다. 내용이 다른 파일을 이미 데이터가 있는 DB에 가져오면 중단한다. 현재 DB의 수정이나 주문을 자동으로 덮어쓰지 않는다. 잘못된 데이터·관계 또는 연결 오류가 생기면 전체 저장을 취소한다.

이미지는 DB로 복사하지 않는다. 기존 `images` 디렉터리를 유지하거나 새 `ADMIN_DATA_DIR/images`로 옮기고, 고정된 절대 경로를 설정한다. 이관 후 파일 저장소의 쓰기를 다시 활성화하지 않는다. 전환 전에 다른 앱 프로세스가 기존 JSON을 계속 수정하면 가져온 스냅샷 이후의 편집은 반영되지 않으므로 개발 서버를 멈춘 상태에서 이관·환경 변경·재시작을 묶어서 수행한다.

과거 메모리 주문·세션은 DB에 저장된 기록이 없어 자동으로 복원할 수 없다. 브라우저의 이전 체험 주문은 마이페이지에 그대로 표시하며 실제 DB 주문·매출로 변환하지 않는다. 새 주문은 서버 API로 접수하고 비회원 쿠키가 유지되는 동안 같은 브라우저에서 조회한다. 이 쿠키를 삭제하거나 세션이 만료되면 과거 DB 주문을 본인 것으로 조회할 수 없다.

## 테스트와 CI

단위 테스트는 메모리 어댑터와 이전 JSON 변환을 검사하고, 통합 테스트는 실제 PostgreSQL에서 잠금·롤백·동시 요청·세션 상한·이관·DB 상품 권한을 검사한다.

`.env.test.local`에 전용 테스트 DB 주소를 설정한다. 환경변수 `DATABASE_URL`을 직접 전달해도 된다. 테스트 DB 이름은 `_test` 또는 `-test`로 끝나야 한다.

```sh
NODE_ENV=test npm run db:migrate
npm test
npm run test:db
npm run lint
npm run build
npx --no-install tsc --noEmit
```

`test:db`는 URL의 이름과 서버의 실제 DB 이름을 확인한 뒤 **테스트 DB의 앱 테이블을 비운다**. 개발·운영 DB 주소를 전달하지 않는다. GitHub Actions는 독립 PostgreSQL 18 서비스에서 같은 마이그레이션과 통합 테스트를 실행한다.

브라우저 검증은 테스트 DB에 `db:seed`를 실행하고, 토스 테스트 키를 설정한 앱을 `localhost:3419`에서 실행한 뒤 Playwright가 설치된 환경에서 수행한다.

```sh
FRONT5_BASE_URL=http://localhost:3419 node tests/payments-browser.cjs
```

이 검증은 실제 토스 테스트 결제창 열기·취소, 동일 결제 초안 재시도를 확인한다. 콜백 UI의 승인 API 응답 유실·장바구니 보호는 대체 응답으로 검사하며 실제 결제를 승인하지 않는다. 서버 승인·주문 저장·롤백 복구는 실제 PostgreSQL 통합 테스트에서 대체 토스 응답으로 확인한다. 본인 카드로 최종 인증하는 수동 확인 방법과 제한은 [payments.md](payments.md)에 있다. 결과는 `docs/screenshots/toss/`에 저장한다. 과거 결제 없는 주문 저장 검증 스크린샷은 `docs/screenshots/postgres/`와 `docs/screenshots/sql-defaults/`에 남아 있으며 현재 결제 흐름을 나타내지 않는다.

## 배포 환경

Next.js와 Prisma CLI는 저장소 루트 `.env*`를 `@next/env` 규칙으로 읽는다. 환경변수로 직접 주입한 값이 우선한다. Docker 개발 컨테이너 안에서는 호스트의 `127.0.0.1` 대신 동일 네트워크의 PostgreSQL 서비스 이름·별칭을 사용한다. DB URL·비밀번호는 브라우저로 전달하지 않고 `NEXT_PUBLIC_*`로 설정하지 않는다.

배포 supervisor를 시작할 때 `DATABASE_URL`과 고정된 `ADMIN_DATA_DIR`를 환경으로 주입한다. TLS 프록시가 내부 Host·scheme을 바꾸는 환경에서는 `APP_ORIGIN`을 실제 앱 주소(예: `https://kant2-front5-staging.dev.crasnec.com`)로 지정한다. 쓰기 API는 이 주소를 정확히 비교하며 임의의 `X-Forwarded-*` 헤더를 신뢰하지 않는다. 주소 설정 변경 후에는 서버를 재시작한다. 릴리스 디렉터리 안의 `.env.local`이나 상대 이미지 경로에 의존하지 않는다. 기존 `ops/mcp_cicd.py`는 자신의 환경을 빌드·후보·운영 서버에 전달한다. 운영 배포 전에 전용 DB에 migration·import/seed를 적용하고, 보호된 브랜치의 리뷰와 CI를 통과한 뒤 배포한다. migration이나 seed를 빌드·앱 요청마다 자동 실행하지 않는다.

이번 마이그레이션은 기존 SQL 규칙을 유지하며 신규 열·테이블을 추가한다. DB 구조·데이터를 보관하고 앱 버전을 되돌릴 수 있지만 과거 JSON 앱을 재활성화하면 DB와 파일이 따로 수정된다. 복구 시 쓰기를 잠시 멈추고 저장소를 하나로 유지한다.

연결 풀은 프로세스당 최대 5개이며 연결 대기는 5초, SQL과 트랜잭션 실행은 20초로 제한한다. 서버 프로세스 수를 늘리면 DB의 연결 수와 파일 저장 경로 공유를 함께 점검한다. 카탈로그가 없거나 DB에 연결하지 못하면 오류를 반환하며 파일·메모리로 전환하지 않는다.

판매 현황은 완료 주문의 상품·음료·드레싱 스냅샷을 완료 시각 기준으로 집계한다. 실제 결제·환불 확정 기능은 포함하지 않는다. `fixtures/admin/sales-orders.demo.json`은 테스트 참고용으로만 남기며 실제 매출에 적용하는 `seed:sales-demo` 명령은 제거했다.
