# leaf & bowl · UC-D 관리자 주문 운영 최종 검증 및 시연 실행가이드

**버전:** 2026-10-26 / **담당:** D(관리자 운영) / **Redmine:** #773, #775, #780, #796, #801, #803

현재 후속 작업 브랜치 `feat/uc-d-db-verification`은 PR #219 구현을 기반으로 한다. 이 문서의 기존 실서버 관찰 기록과 이번 브랜치의 자동 테스트 결과를 구분한다. PR #219와 운영 DB에는 변경을 가하지 않았다.

## 1. 현재 검증된 사실과 남은 실제 결과

| 업무 | 현재 근거 | 판정 |
|---|---|---|
| 관리자 로그인·JWT | 격리 DB 관리자 로그인 200, 브라우저 로그아웃 후 접근 차단, 폐기 JWT 401 | **격리 환경 확인** |
| 관리자 주문 목록 GET | 브라우저 목록·FastAPI 실HTTP GET 200, 서버 로그 | **격리 환경 확인** |
| 주문 상세 화면 | 브라우저 상세와 FastAPI 개별 GET 200, 상태·버전·이력 표시 | **격리 환경 확인** |
| 관리자 상태 변경 PATCH | 브라우저 저장 및 FastAPI PATCH 200·409 서버 로그 | **격리 환경 확인** |
| DB version/history | 실DB에서 1회 변경당 version+1·history+1, 관리자 ID·사유·시간 확인 | **격리 환경 확인** |
| 동시성·rollback | 서로 다른 DB 세션의 동시 요청 1건 성공/1건 Conflict, history FK 실패 후 DB 불변 | **격리 환경 자동 테스트 통과** |
| 401/404/409/422 | FastAPI 네트워크 HTTP 응답 및 로그아웃 후 재사용 차단 | **격리 환경 확인** |
| 시연 시나리오 | 격리 환경 브라우저 흐름 확인 | **기능 시연 준비**, 제출 환경 재확인 필요 |
| 주문 API 후속 PR | 인증 1차 PR #209 병합, 주문 API PR #219 CI 통과·리뷰 대기 | **이 브랜치 변경은 PR #219에 반영하지 않음** |

**기준:** 아래 실DB·화면 검증은 새로 만든 로컬 폐기 가능 DB의 시험 주문만 사용했다. 팀 공용 Supabase나 제출 환경에서 재현된 결과로 해석하지 않는다.

## 2. FastAPI 브리지 활성화

Next.js 서버의 `ADMIN_FASTAPI_BRIDGE_ENABLED` 기본값은 꺼짐이다. 켜지 않으면 관리자 주문 GET/PATCH와 로그인은 기존 Next.js 구현을 사용하므로 FastAPI가 동작했다는 증거가 아니다. Next.js와 FastAPI가 **같은 DB와 같은 관리자 UUID**를 사용하는지 확인한 뒤 Next.js 서버 환경에 `ADMIN_FASTAPI_BRIDGE_ENABLED=true`를 설정하고 서버를 재시작한다. `BACKEND_URL`은 FastAPI 서버 주소다. 서버 로그에서 `/api/admin/orders` GET 및 PATCH를 확인한다. 브라우저에는 HttpOnly 관리자 쿠키만 전달되며 Bearer 헤더는 Next.js 서버가 FastAPI로 보낸다. 로그아웃은 기능 플래그를 나중에 껐더라도 기존 FastAPI 쿠키가 있으면 토큰 폐기를 시도한다.

`tools/uc_d_final_check.py`와 읽기 전용 SQL은 이미 저장소에 있다. 실DB 쓰기 검증 전에는 아래 안전 조건을 따른다.

## 3. 우선: 안전한 읽기 전용 검사

기존 FastAPI(8000)와 Next.js(3000) 서버를 켜 둔다. 루트 PowerShell:

```powershell
cd C:\dev\leaf-bowl
python tools\uc_d_final_check.py --login-id admin_dev --report .data\uc-d-qa\read-evidence.json
```

`admin_dev` 대신 **실제로 로그인 성공한 관리자 ID**를 넣는다. `.data/`는 현재 프로젝트 Git 추적 제외 대상이다. 실제 검증 로그는 로컬에만 둔다. 비밀번호는 키보드로 입력할 때 표시되지 않으며, JSON 파일에 포함되지 않는다. 관리자 ID/비밀번호를 채팅에 보내지 않는다.

실행 항목: DB health 200 → OpenAPI 관리자 5개 확인 → 인증 없는 GET 401 → 관리자 JWT 발급 200 → 목록 200 → 상세 200(상태/버전/이력) → 없는 주문 404 → 잘못된 UUID 422. **PATCH/로그아웃 JWT 폐기는 하지 않는다.**

실패하면 출력한 항목과 HTTP 코드만 확인한다. 고객 정보·JWT·비밀번호는 공유하지 않는다. 계정/비밀번호가 맞는데 401이면 `.env.local`·`backend/.env`가 같은 DB인지, 실제 관리자 계정이 disabled가 아닌지 확인한다.

## 4. 실DB 상태변경 테스트 — 반드시 격리된 개발 DB에서만

1. 기존 root `.env.local`과 `backend/.env`는 팀 공용 Supabase를 가리키므로 **수정하지 않는다**. 독립 로컬 PostgreSQL 클러스터와 새 `_test` DB를 만들고 데이터 디렉터리·포트·`pg_control_system().system_identifier`를 확인한다. 두 서버에는 프로세스별 환경변수로만 로컬 DB URL을 주입한다.
2. 공용 Supabase / 운영·팀 공동 DB에서는 아래 명령을 **실행하지 않는다**. 기존에 표시된 임의 주문이나 다른 팀원이 사용하는 주문을 테스트 대상이라고 가정하지 않는다.
3. 별도 DB에 변경할 수 있는 테스트용 `received`/`confirmed` 주문 UUID 1개를 준비한다. 팀원 실제 주문을 선택하지 않는다. DBeaver의 `public.orders`에서 UUID와 버전만 조회해도 된다.
4. `backend/tests/test_admin_order_postgres.py`는 `TEST_DATABASE_URL`, `UC_D_TEST_DATA_DIRECTORY`, `UC_D_TEST_SYSTEM_ID` 세 값을 요구하고 연결된 서버 식별자를 쓰기 전에 대조한다. 아래 예시는 실제 식별자 확인 후에만 실행한다.

```powershell
cd C:\dev\leaf-bowl
$env:TEST_DATABASE_URL='postgresql://<로컬사용자>@127.0.0.1:<로컬포트>/<전용_DB>_test'
$env:UC_D_TEST_DATA_DIRECTORY='<확인한_로컬_클러스터_경로>'
$env:UC_D_TEST_SYSTEM_ID='<확인한_클러스터_식별자>'
cd backend
.\.venv\Scripts\python.exe -m pytest tests/test_admin_order_postgres.py -q
```

**주의:** `tools/uc_d_final_check.py --mode write`는 두 기존 env 파일 자체가 로컬 DB인지 검사하므로 이번처럼 프로세스 환경변수만 격리한 구성에서는 실행하지 않는다. 해당 도구의 기본 read 모드는 사용할 수 있다. HTTP 쓰기 시연은 서버 프로세스와 DB 식별자를 별도로 확인한 뒤 격리 시험 주문에만 수행한다.

검증: 상태 변경 200 → 재조회 version+1·history+1 → 같은 이전 version으로 PATCH 409 → 불변 → 실제 관리자 history 기록 확인 → 미인증 PATCH 401 → 없는 주문 404 → 입력 오류 422 → 실패 후 불변 → FastAPI 로그아웃 204 → 폐기된 JWT 401.

마지막으로 아래 SQL을 **같은 테스트 DB의 DBeaver**에서 실행해 화면·API·DB가 일치하는지 확인한다. SQL은 SELECT만 수행한다.

## 5. 실서버 브라우저 E2E 확인

1. `/admin/login`에서 관리자 계정 로그인. `lb_admin` 및 FastAPI 토큰 브리지 기능은 서버 안에서 처리. JWT를 콘솔·스크린샷·문서에 복사하지 않는다.
2. **위치 및 배달 관리** → 주문 목록. FastAPI 터미널 `GET /api/admin/orders?limit=50` 200 기록 확인 (기존 화면 실증 완료).
3. 상세 보기. FastAPI 터미널 `GET /api/admin/orders/{uuid}` 200 기록 확인. 상태·version·메뉴·금액·처리 이력 보이는지 확인.
4. **별도 `_test` DB와 시험 주문 연결 확인 후에만** 드롭다운 다음 상태 선택 → 이유 입력 → 상태 변경 저장. 브라우저에서 저장 중 버튼 잠금·성공/실패 UI와 재조회를 본다.
5. 다음 조회에서 version 1 증가·이력 1건 증가 여부를 DBeaver SQL과 대조한다. 동일 버전 중복 요청 409 및 화면 재조회 확인.
6. 로그아웃 → `/admin` 접근 제한·FastAPI 관리자 토큰 401 확인. 정상 비밀번호로 로그인 시 다시 접속되는지 확인.

## 6. D 담당 발표용 시연 시나리오 (PPT 제외, 기능 중심)

**전제:** 예시 주문은 `_test`에 저장된 테스트 주문이고, 개발자가 그 UUID/초기 상태를 사전 점검했다.

| 단계 | 진행 동작 | 화면/백엔드에서 보여줄 결과 | 실패 시 안전한 대체 |
|---|---|---|---|
| 1 | 관리자 로그인 | 실제 관리자 로그인 통과·주문 메뉴 진입 | FastAPI `/docs` 관리자 token 200 등 비밀값 제외 기록 |
| 2 | 배달 관리 화면 진입 | 주문 목록 상태별 필터·50건 조회 및 GET 200 | 10/26 실증한 목록 캡처 |
| 3 | 테스트 주문 상세 열기 | 배송 정보·아이템·버전·이력, GET 상세 200 | 읽기 전용 도구 출력 |
| 4 | `received → confirmed` (또는 허용 다음 상태) | PATCH 200, version 1 증가, 새 history 1건 | 격리 DB 자동검증 결과표 |
| 5 | 동일 old version 재전송 | 409, 기존 주문/이력 불변 | 격리 DB 자동검증 결과표 |
| 6 | DB 이력·관리자 구분 확인 | `changed_by=admin`, `admin_user_id`, 사유/created_at | SELECT SQL 결과 캡처(개인정보 숨김) |
| 7 | 로그아웃·권한 확인 | 로그아웃 후 주문 API 401 및 관리자 화면 재로그인 요구 | 자동검증 로그 |

**1분 설명:** “관리자 계정만 주문 관리 API에 접근할 수 있도록 JWT·활성 계정 검사를 적용했습니다. 주문 조회는 관리자 전용 조회 레이어에서 처리하고, 상태 변경은 기존 팀 Order 도메인의 허용 전이와 version 낙관적 잠금을 재사용합니다. 같은 version으로 상태를 동시에 바꾸면 성공한 요청만 이력을 남기고 나머지는 409로 충돌 처리합니다. 화면은 기존 Next.js 디자인을 유지하고 FastAPI를 서버측 인증 브리지로 연결했습니다.”

이 설명 중 *동시성 실DB 결과*는 도전 실습 W100~W105에서 **실측하기 전에는 결과가 있었다고 말하지 않는다**. 409 Fake 테스트 결과와 실DB 결과를 구분한다.

W100~W105의 개별 수용 기준은 현재 저장소에서 확인되지 않았다. 아래 검증을 해당 번호의 완료 근거로 대체하지 않는다.

## 7. D 담당 WBS 최종 완료 판정표

| WBS | 완료 조건 | 현재 |
|---|---|---|
| 10/23 API 명세 초안 | 노션 v0.1 존재 | 완료 |
| 10/23 Order 상태 전이 | C·D 공통 도메인/전이 규칙과 테스트 | 완료 |
| 10/26 관리자 로그인 | 실제 관리자 로그인·권한 검증 | 완료(실제 로그인 화면) |
| 10/26 관리자 주문 목록 API | 서버 GET200/화면 목록 | 완료(10/26 실증) |
| 10/26 관리자 상태 변경 API | 실DB PATCH + version/history 검증 | **격리 로컬 DB 확인** |
| 10/27 관리자 배달 관리 화면 연동 | 실제 목록·상세·PATCH 저장·충돌/재조회 | **격리 로컬 브라우저 확인** |
| 10/27 시연 시나리오 | 문서 완성 + 시연 리허설 검증 | **기능 흐름 확인, 제출 환경 리허설 대기** |

### 2026-10-26 후속 브랜치 자동 검증

- 백엔드 Fake/단위 관련 81개 통과: 관리자 상태 변경·조회·로그아웃, 공통 상태 규칙·커서. 실제 PostgreSQL 동시 트랜잭션을 검증한 결과는 아니다.
- Next.js 주문/브리지 관련 17개 통과: 기존 UC-C 주문·취소 회귀와 서버측 FastAPI JWT 전달, 관리자 GET/PATCH·401/404/409/422 전달 및 로그아웃 계약 포함. FastAPI 서버 연결은 Mock이다.
- `ruff check` 관리자 영역 통과, TypeScript `tsc --noEmit` 통과.
- PostgreSQL 18 독립 클러스터를 저장소의 무시된 `.data/`에 만들고 `127.0.0.1:55432`에만 바인딩했다. 새 `leaf_bowl_uc_d_test` DB의 데이터 디렉터리와 서버 식별자를 읽기 쿼리로 대조한 후에만 쓰기 테스트를 진행했다. 기존 env 파일과 팀 공용 Supabase는 변경하지 않았다.
- `test_admin_order_postgres.py`: 실DB 4개 통과. 정상 status/version/history·관리자 메타데이터, 2세션 동시 변경 1승 1충돌, history FK 실패 후 rollback, 실제 DB에 연결된 FastAPI ASGI HTTP 계약을 확인했다. 초기화 확인용 기존 PostgreSQL 테스트 1개도 통과했다.
- 실제 FastAPI 네트워크 HTTP: 로그인/목록/상세/로그아웃 200·200·200·204, 미인증·없는 주문·잘못된 UUID·이전 version·잘못된 상태·폐기 JWT는 각각 401·404·422·409·422·401. 응답 본문의 고객 정보·JWT는 기록하지 않았다.
- 실제 Next.js 브라우저: 로그인→주문 5건 목록→시험 주문 상세→`received → confirmed` 저장 중 버튼 잠금→version 2·이력 추가·목록 재조회 확인. 별도 FastAPI PATCH 후 오래된 화면 저장에서 409 안내와 재조회 버튼을 확인했고, 최신 `preparing`/version 3/이력 3건으로 갱신됐다. 로그아웃 후 `/admin`은 로그인 화면으로 이동했다. FastAPI 로그에 브라우저 GET/PATCH 200·PATCH 409·로그아웃 204가 남았다.
- 해당 시험 주문의 DB 최종 대조: `preparing`, version 3, history 3건, 두 관리자 이력의 ID·사유·시간 저장 확인. 토큰 블랙리스트 기록도 확인했다.
- DDD 계층 테스트 18개 및 새 실DB 테스트 파일 Ruff 통과. W100~W105 개별 정의는 저장소에서 여전히 확인되지 않았다. 제출 환경 또는 팀 공용 DB에서의 실증은 수행하지 않았다.

### 남은 추가 증빙 (WBS 밖이지만 제출 안정화에 유리)

- 관리자 관련 Python 테스트와 전체 백엔드 테스트는 구분해 기록
- 루트 Next TypeScript/수정 파일 ESLint 검사, 기존 Node 회귀 테스트 확인
- FastAPI 상세 GET·PATCH·409/401/422 실HTTP, 실 PostgreSQL order_status_history 행 검증
- `git status -sb`/`git diff --check`, 인증 #209 외의 주문·UI·브리지 후속 PR 생성/CI 확인

### Git/검사 명령 (프로젝트 루트 PowerShell)

```powershell
cd C:\dev\leaf-bowl
git status -sb
git diff --check
npx tsc --noEmit
npx eslint app/api/v1/admin/orders app/api/v1/auth application/fastapi-admin-bridge.ts components/admin/editors/DeliveryOrders.tsx components/admin/editors/OrderStatusEditor.tsx
node --require ./tests/register-typescript.cjs --test tests/admin-guard.test.cjs tests/orders-api.test.cjs
cd backend
uv run pytest tests/test_admin_order_status.py tests/test_admin_order_queries.py -q
uv run ruff check src/admin_orders tests/test_admin_order_status.py tests/test_admin_order_queries.py
```

**팀 전체 `npm run lint`**는 과거 Prettier 342개 파일의 광범위한 포맷 경고가 있었으므로 D 변경 범위 검사와 별도로 보고하고 팀 코드 전체에 자동 `--write` 하지 않는다. **`backend/tests/test_orders_postgres.py`는 공유 DB의 public schema를 DROP할 수 있으므로 공유 DB에서 절대 실행하지 않는다.**

## Redmine #888 · DB 커넥션 풀 튜닝 및 비교 (2026-10-27)

`backend/src/database.py`의 기존 AsyncEngine·세션 수명 관리를 유지하면서 `DATABASE_POOL_SIZE`(기본 5), `DATABASE_MAX_OVERFLOW`(10), `DATABASE_POOL_TIMEOUT`(30초), `DATABASE_POOL_RECYCLE`(-1: 비활성)를 설정 가능하게 했다. 기본값은 SQLAlchemy의 기존 풀 동작과 같고 `pool_pre_ping` 및 선택적인 statement cache 비활성화도 유지한다. 설정 범위는 각각 1~50, 0~50, 0초 초과~300초, -1 또는 1~86400초이며 잘못된 값은 앱 설정 로딩 시 거부된다.

### 격리 환경과 측정 방법

- PostgreSQL 18.4, `127.0.0.1:55432`, 전용 `leaf_bowl_uc_d_test` DB, 데이터 디렉터리 `C:\dev\leaf-bowl\.data\uc-d-postgres-20261026`, 시스템 식별자 `7700979184671432628`을 서버 쿼리와 `pg_controldata`로 대조했다. 서버 `max_connections=100`; 측정 시작 시 주문 6건. 기존 `.env` 파일과 공용 Supabase는 사용하거나 변경하지 않았다.
- 읽기 전용 `SELECT 1`과 실제 `SqlAdminOrderReader.list_all(20, None, OrderListFilter())`를 각각 비교했다. 설정마다 동시 요청 12개, 워밍업 24개, 단일 요청 20개, 본 측정 60개 × 3회. `pool_timeout=30`, `pool_recycle=-1`은 세 설정에서 동일하다.
- 지연은 요청 전체 시간이다. checkout 시간은 세션 연결 요청부터 연결 획득까지로, **순수 큐 대기 외에 새 연결 생성과 pre-ping도 포함**한다. 최대 연결 수는 풀 checkout/checkin 이벤트로 측정했다. 처리량은 3회의 성공 요청 수 / 3회 실제 경과 시간이다.

| 작업 | 설정 (size/overflow) | 단일 평균 ms | 처리량 req/s | 평균 ms | p50 / p95 ms | checkout 평균 / p95 ms | 오류 | 최대 사용 / 종료 시 대여 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SELECT 1 | 기본 5/10 | 1.56 | 363.7 | 19.72 | 6.00 / 103.88 | 15.42 / 97.84 | 0 | 6 / 0 |
| SELECT 1 | A 5/5 | 1.51 | 423.2 | 18.64 | 10.64 / 87.14 | 13.79 / 79.31 | 0 | 7 / 0 |
| SELECT 1 | B 10/10 | 1.73 | 527.6 | 14.12 | 11.90 / 17.69 | 8.10 / 11.73 | 0 | 11 / 0 |
| 관리자 주문 조회 | 기본 5/10 | 5.71 | 119.1 | 84.19 | 62.25 / 209.65 | 35.75 / 136.52 | 0 | 12 / 0 |
| 관리자 주문 조회 | A 5/5 | 5.31 | 192.0 | 57.73 | 44.37 / 153.97 | 26.50 / 90.46 | 0 | 10 / 0 |
| 관리자 주문 조회 | B 10/10 | 5.58 | 203.0 | 54.51 | 45.56 / 105.01 | 12.53 / 26.34 | 0 | 12 / 0 |

로컬 12개 동시 요청에서는 B가 관리자 주문 조회의 처리량·p95·checkout 지연에서 가장 양호했고 오류와 연결 미반환이 없었다. **로컬 격리 환경의 조건부 권장값은 B(10/10)**이다. 운영 기본값 5/10은 유지한다. 주문 6건·단일 머신·한 번의 측정 세트이므로 운영 적용 전에 DB의 전체 연결 한도에서 앱 프로세스 수 × (pool size + overflow), 다른 사용자의 연결 수, p95를 함께 확인해야 한다. A는 최대 연결 수를 10개로 제한해야 할 때 대안이다. 실측에서 타임아웃은 0건이었고, 1/0 풀에 연결 하나를 점유해 둔 별도 실DB 테스트에서 0.05초 타임아웃 예외를 확인했다.

### 재실행과 검증 범위

기존 식별자가 같은 **폐기 가능한 로컬 클러스터**에만 아래 환경변수를 현재 셸 프로세스에 설정한 뒤 실행한다. 스크립트가 루프백 주소·포트·DB명·데이터 디렉터리·시스템 식별자·서버 연결 한도를 재확인한다. `TEST_DATABASE_URL`은 출력 파일에 기록하지 않는다.

```powershell
$env:TEST_DATABASE_URL = 'postgresql://<local-test-user>@127.0.0.1:55432/leaf_bowl_uc_d_test'
$env:UC_D_TEST_DATA_DIRECTORY = 'C:\dev\leaf-bowl\.data\uc-d-postgres-20261026'
$env:UC_D_TEST_SYSTEM_ID = '7700979184671432628'
backend\.venv\Scripts\python.exe tools\uc_d_pool_benchmark.py
cd backend
.venv\Scripts\python.exe -m pytest tests/test_database_pool.py -q
```

`tests/test_database_pool.py`에서 설정 범위·기본값·엔진 옵션·종료 시 엔진 해제, 실DB checkout 타임아웃·관리자 주문 조회·연결 반환을 검증한다. 기존 관리자 상태 변경 서비스와 UC-C 세션 코드는 변경하지 않았다. 공용 DB, 실제 주문, 팀 공용 계정에는 벤치마크나 쓰기 테스트를 실행하지 않는다.

실행 결과: 풀 설정 및 관리자 상태 변경 단위 테스트 27개, UC-C 주문 API Fake 테스트 44개, 새 풀 설정(2/1)을 적용한 실DB 관리자 상태 변경 트랜잭션 테스트 1개 통과. 수정 파일 Ruff와 `git diff --check` 통과. 벤치마크 직후 주문 수는 6건으로 시작 시와 같고 테스트 DB 접속 세션은 확인 쿼리 자체의 1개뿐이었다. 이후 별도 상태 변경 시험 주문 1건을 생성해 status/version/history가 함께 영속화되고 연결이 반환되는지 확인했다. 기존 동시성·롤백 검증은 변경 범위 밖이므로 반복 실행하지 않았다.

## Redmine #887 · W102 낙관적·비관적 잠금 비교 (2026-10-27)

### 격리 환경과 방법

- 기존 전용 PostgreSQL 18.4 클러스터의 `127.0.0.1:55432`, `leaf_bowl_uc_d_test`, 데이터 디렉터리 `C:\dev\leaf-bowl\.data\uc-d-postgres-20261026`, 시스템 식별자 `7700979184671432628`을 쓰기 전에 다시 대조했다. 연결 한도는 100, 실험 전 주문 수는 7건이었다. 기존 env 파일·공용 Supabase는 사용하지 않았다.
- `tools/uc_d_locking_comparison.py`는 기존 `test_admin_order_postgres.py`의 시험 주문 생성·스냅샷, `AdminOrderStatusService`, 공통 `SqlOrderRepository`를 재사용한다. 운영 코드의 version 조건 UPDATE는 그대로 둔다. 실험용 비관적 경로에서만 `SELECT ... FOR UPDATE` 후 status/version을 다시 확인하고 같은 서비스를 호출한다.
- 두 방식 모두 초기 `received`/version 1/이력 1건, 동시 요청 2개, 풀 5/overflow 10, `lock_timeout=2초`, `statement_timeout=5초`를 사용했다. 방식별 워밍업 2쌍, 본 측정 10쌍 × 3회(요청 60건). 반복별 실행 순서를 교차했다. 시험 주문 생성과 결과 확인 시간은 아래 응답 지연·처리량에서 제외했다.

| 방식 | 성공 / 충돌 / 오류 | 평균 ms | p50 / p95 ms | 처리량 req/s | FOR UPDATE 획득 평균 / p95 ms | 타임아웃 / 데드락 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 기존 낙관적 잠금 | 30 / 30 / 0 | 14.69 | 14.98 / 16.95 | 132.9 | 해당 없음 | 0 / 0 |
| 실험용 비관적 잠금 | 30 / 30 / 0 | 13.39 | 12.85 / 15.23 | 145.7 | 5.72 / 12.14 | 0 / 0 |

모든 시험 쌍에서 정확히 한 요청만 성공했고, 종료 후 각 주문이 `confirmed`/version 2/이력 2건(관리자 변경 1건)임을 확인했다. 실험 후 DB에서 W102 사유의 관리자 이력 **65건**(워밍업 4 + 측정 60 + 대기 제어 1)을 별도 조회했고, 풀의 종료 시 대여 연결은 0개, 확인 쿼리 시 DB 세션은 1개였다. 첫 세션이 행 잠금을 보유한 상태에서 두 번째 세션의 획득 시간이 **91.77 ms**였고, `lock_timeout=30 ms`를 강제한 경우 PostgreSQL `55P03` 잠금 타임아웃과 주문 불변을 확인했다. 위 표의 획득 시간은 네트워크 왕복과 SQL 실행 시간도 포함하므로 순수 DB 잠금 대기 시간은 아니다.

**판정:** 두 방식 모두 정합성 PASS. 이 작은 로컬 워크로드에서 `FOR UPDATE` 경로의 p95는 낮고 처리량은 높게 측정됐지만, 단일 환경·동시 요청 2개·3회 반복만으로 운영 우월성을 확정할 수 없다. 비교 경로도 공통 서비스를 재사용하므로 잠금 획득 뒤 version 조건 UPDATE를 실행하는 **추가 잠금 실험**이다. 기존 낙관적 잠금을 유지한다. W102 실험에서 FAIL/BLOCKED 항목은 없다.

### 재실행

이 스크립트는 테스트 주문을 INSERT/UPDATE한다. 반드시 위의 격리 클러스터가 같은 식별자로 실행 중일 때만 현재 PowerShell 프로세스에 아래 값을 설정한다. 스크립트도 접속 주소·DB명·데이터 디렉터리·시스템 식별자를 검사한 뒤 쓰기를 시작한다. 비밀번호·JWT·고객 정보는 출력하지 않는다.

```powershell
$env:TEST_DATABASE_URL = 'postgresql://<local-test-user>@127.0.0.1:55432/leaf_bowl_uc_d_test'
$env:UC_D_TEST_DATA_DIRECTORY = 'C:\dev\leaf-bowl\.data\uc-d-postgres-20261026'
$env:UC_D_TEST_SYSTEM_ID = '7700979184671432628'
backend\.venv\Scripts\python.exe tools\uc_d_locking_comparison.py
```
