# leaf & bowl · UC-D 관리자 주문 운영 최종 검증 및 시연 실행가이드

**버전:** 2026-10-26 / **담당:** D(관리자 운영) / **Redmine:** #773, #775, #780, #796, #801, #803

## 1. 현재 검증된 사실과 남은 실제 결과

| 업무 | 현재 근거 | 판정 |
|---|---|---|
| 관리자 로그인·JWT | 백엔드 관리자 관련 77개 테스트 통과, 화면 관리자 로그인 성공 | 핵심 구현 확인 |
| 관리자 주문 목록 GET | Next.js 관리자 주문 50개 화면, FastAPI `GET /api/admin/orders?limit=50` **200 OK** 실서버 로그 | **확인** |
| 주문 상세 화면 | 실제 상세 모달과 상태·버전·메뉴·이력 표시 | **UI 확인**. FastAPI 개별 GET 로그는 추가 확인 |
| 관리자 상태 변경 PATCH | UI 입력·저장 버튼 표시, FastAPI Fake HTTP 13개 통과 | **실DB 변경 미검증** |
| DB version/history | 기존 C의 조건부 version UPDATE + history INSERT 재사용, Fake 테스트 | **실DB 커밋 전후 대조 미검증** |
| 401/404/409/422 | Fake/단위 테스트 근거 | **실DB/실서버 오류 코드 추가 확인 필요** |
| 시연 시나리오 | 이 문서 아래에 완성 | **문서 준비 완료**, 최종 현장 리허설 미검증 |
| 주문 API 후속 PR | 인증 1차 PR #209는 병합됨 | **GET/PATCH/UI/Bridge 후속 PR 별도 생성/병합 필요** |

**기준:** 코드를 작성한 것과 실제 DB에서 실행해 검증한 것은 다른 완료 조건이다. 화면에 있는 실제 주문 50건을 테스트 주문으로 간주하지 않는다. 전체 DB에 50건만 있다는 의미도 아니다.

## 2. 압축 파일 설치

ZIP을 프로젝트 루트 `C:\dev\leaf-bowl\`에 폴더 구조 그대로 압축 해제한다. 새로운 파일만 포함하므로 기존 관리자 API 소스 파일은 덮어쓰지 않는다.

추가 파일:
- `tools/uc_d_final_check.py` : Python 표준 라이브러리 기반 FastAPI 점검 도구(기본 읽기 전용)
- `docs/UC-D_최종_검증_실행가이드.md` : 문서와 시연 시나리오
- `docs/UC-D_실DB_조회증빙.sql` : DBeaver 읽기 전용 검증 쿼리

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

1. 별도의 로컬 PostgreSQL DB(이름 예: `leaf_bowl_test`)를 만들고, root `.env.local`과 `backend/.env`의 `DATABASE_URL`을 **모두 이 DB로 변경**한다. FastAPI 및 Next.js 서버를 이 환경으로 재시작한다. 먼저 해당 DB의 준비 및 테스트용 주문 생성 상태를 확인한다.
2. 공용 Supabase / 운영·팀 공동 DB에서는 아래 명령을 **실행하지 않는다**. 기존에 표시된 임의 주문이나 다른 팀원이 사용하는 주문을 테스트 대상이라고 가정하지 않는다.
3. 별도 DB에 변경할 수 있는 테스트용 `received`/`confirmed` 주문 UUID 1개를 준비한다. 팀원 실제 주문을 선택하지 않는다. DBeaver의 `public.orders`에서 UUID와 버전만 조회해도 된다.
4. 설정 파일이 모두 로컬 `_test` DB임을 확인한 후에만 아래 명령을 실행한다.

```powershell
cd C:\dev\leaf-bowl
python tools\uc_d_final_check.py --login-id admin_dev --mode write --order-id <테스트_주문_UUID> --report .data\uc-d-qa\write-evidence.json
```

**주의:** 위 예시의 `<테스트_주문_UUID>`는 실제 UUID로 교체한다. 실행 중 `LOCAL TEST DB ONLY`를 정확히 입력해야 PATCH가 진행된다. 이 보호 장치는 구성 파일과 로컬 API 주소를 검사하지만, 이미 실행된 FastAPI 프로세스의 환경변수 오버라이드나 로컬 프록시의 실제 DB 대상까지 자동 판별할 수 없으므로, **사용자가 실제 서버가 동일한 로컬 시험 DB를 보고 있음을 확인해야 한다.**

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

## 7. D 담당 WBS 최종 완료 판정표

| WBS | 완료 조건 | 현재 |
|---|---|---|
| 10/23 API 명세 초안 | 노션 v0.1 존재 | 완료 |
| 10/23 Order 상태 전이 | C·D 공통 도메인/전이 규칙과 테스트 | 완료 |
| 10/26 관리자 로그인 | 실제 관리자 로그인·권한 검증 | 완료(실제 로그인 화면) |
| 10/26 관리자 주문 목록 API | 서버 GET200/화면 목록 | 완료(10/26 실증) |
| 10/26 관리자 상태 변경 API | 실DB PATCH + version/history 검증 | **검증 대기** |
| 10/27 관리자 배달 관리 화면 연동 | 실제 목록·상세·PATCH 저장·충돌/재조회 | **부분 완료, 저장 실증 대기** |
| 10/27 시연 시나리오 | 문서 완성 + 시연 리허설 검증 | **문서 완성, 리허설 대기** |

### 남은 추가 증빙 (WBS 밖이지만 제출 안정화에 유리)

- 관리자 관련 Python 77개 테스트 통과(전체 백엔드 테스트와 구분)
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
