# leaf & bowl API (FastAPI)

인수한 Next.js 앱(저장소 루트) 옆에서 고객 회원·주문·관리자 기능을 맡는 백엔드입니다.

## 준비

### uv 설치

패키지·가상환경·Python 버전은 [uv](https://docs.astral.sh/uv/) 로 관리합니다. 다음 중 하나로 설치합니다.

```bash
# 전역 설치 — macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
# 전역 설치 — Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
# 또는 pipx install uv / winget install --id=astral-sh.uv

uv --version
```

uv 를 전역에 두지 않으려면 저장소 루트의 별도 가상환경에 설치해도 됩니다 (루트 `.venv/` 는 git 에서 제외됩니다).

```bash
python -m venv .venv && .venv\Scripts\activate   # macOS/Linux: source .venv/bin/activate
pip install uv
```

### 가상환경

백엔드는 항상 **`backend/.venv`** 안에서 동작합니다. `uv sync` 가 이 환경을 만들고 `uv.lock` 대로 맞춥니다.
명령은 다음 두 방식 중 편한 쪽으로 실행하며, 둘 다 같은 `backend/.venv` 를 씁니다.

```bash
cd backend
uv sync

# A) uv run: 활성화 없이 backend/.venv 로 실행
uv run uvicorn main:app --app-dir src --reload
uv run pytest

# B) 직접 활성화
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
uvicorn main:app --app-dir src --reload
pytest
deactivate
```

> 루트 `.venv` 처럼 다른 가상환경이 활성화된 셸에서 `uv run` 을 쓰면
> `VIRTUAL_ENV ... does not match the project environment` 경고가 나옵니다.
> uv 는 이 값을 무시하고 `backend/.venv` 를 쓰므로 동작에는 문제가 없습니다.
> 경고를 없애려면 B 방식으로 `backend/.venv` 를 활성화하거나 `deactivate` 합니다.

### Python 버전

`.python-version` 에 **3.13** 을 고정하고, `pyproject.toml` 은 `requires-python = ">=3.13"` 입니다.
시스템에 3.13 이 없어도 `uv sync` 가 받아서 `backend/.venv` 를 만듭니다. 직접 받으려면 `uv python install 3.13`.

의존성은 `uv.lock` 으로 고정합니다. 추가·변경은 `uv add <패키지>` (개발용은 `uv add --dev`) 로 하고 `pyproject.toml` 과 `uv.lock` 을 함께 커밋합니다.
CI 처럼 lock 을 바꾸지 않고 설치만 하려면 `uv sync --locked` 를 씁니다.

## 실행

```bash
cd backend
uv sync
cp .env.example .env      # DATABASE_URL, JWT_SECRET_KEY 채우기
uv run uvicorn main:app --app-dir src --reload
```

### DB 와 Prisma 마이그레이션

주문·상품 등 인수한 테이블은 **Prisma 마이그레이션이 소유**합니다 (`database.py` 의 `LegacyBase`).
FastAPI 는 기동할 때 자기 테이블(`customers`, `token_blacklist`)만 없으면 만들고, 인수한 테이블은 만들거나 바꾸지 않습니다.

| 상황 | 할 일 |
| --- | --- |
| 팀 공용 외부 DB (Supabase) 에 접속 | **마이그레이션 불필요.** `backend/.env` 에 주소만 넣고 기동 |
| `prisma/migrations/` 에 새 마이그레이션이 추가됨 | 담당자가 한 번만 저장소 루트에서 `npm run db:migrate` |
| 빈 DB 를 새로 준비 (로컬 PostgreSQL 등) | 저장소 루트에서 `npm ci` → `npm run db:migrate` → `npm run db:seed` 후 FastAPI 기동 |

- 공용 DB 에는 실제 주문 데이터가 있으므로 `npm run db:seed`, `prisma migrate reset`, `prisma migrate dev` 를 실행하지 않습니다.
- 적용 상태는 저장소 루트에서 `npx prisma migrate status` 로 확인합니다 (루트 `.env.local` 의 `DATABASE_URL` 사용).
- 루트 `.env.local` 과 `backend/.env` 의 `DATABASE_URL` 은 같은 DB 를 가리켜야 합니다. `postgresql://` 주소를 그대로 넣어도 asyncpg 로 바꿔 접속합니다.
- Swagger: http://localhost:8000/docs
- 상태 확인: `GET /health`, DB 연결 확인: `GET /health/db`
- `DATABASE_URL` 이 비어 있으면 DB 없이 기동합니다 (`/health` 만 동작).
- Prisma 마이그레이션 상세는 [docs/postgres.md](../docs/postgres.md) 를 따릅니다.

## 검사

```bash
uv run pytest
uv run ruff check src tests
uv run ruff format src tests
```

PostgreSQL 통합 테스트(`tests/test_orders_postgres.py`)는 `TEST_DATABASE_URL` 이 있을 때만 실행되고, 없으면 건너뜁니다.
이름이 `_test` 로 끝나는 **전용 DB** 만 허용하며, 시작할 때 `public` 스키마를 지우고 `prisma/migrations` 전체와 `db/seed.sql` 을 적용합니다.
공용 DB 주소를 넣지 마세요.

```bash
# 예: 로컬 PostgreSQL 에 빈 DB leaf_bowl_test 를 만든 뒤
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/leaf_bowl_test uv run pytest
```

## 구조

```
src/
├── main.py            앱 조립: lifespan, CORS, 요청 로깅, 예외 핸들러, 라우터
├── database.py        비동기 엔진·세션, Base(FastAPI 소유) / LegacyBase(Prisma 소유, 매핑만)
├── models.py          create_all 대상 ORM 모델 등록
├── core/
│   ├── config.py             환경변수
│   ├── exceptions.py         공통 예외 (순수 파이썬, domain 에서도 사용)
│   ├── exception_handlers.py 예외 → {"error": {code, message}} 응답
│   ├── middleware.py         요청 로깅 (메서드·경로·상태·처리시간만)
│   └── dependencies.py       get_current_customer, require_admin
└── <기능>/
    ├── presentation/    router.py, schemas.py
    ├── application/     service.py
    ├── domain/          순수 파이썬 업무 규칙
    └── infrastructure/  models.py, repositories.py
```

의존 방향은 `presentation → application → domain ← infrastructure` 이고, domain 은 FastAPI·SQLAlchemy·Pydantic 을 import 하지 않습니다.

## 인증 (OAuth2 · JWT · 블랙리스트)

| API | 설명 |
| --- | --- |
| `POST /api/auth/signup` | 회원가입 (JSON: email, password, name, phone?) |
| `POST /api/auth/token` | 로그인. form 의 `username` 에 이메일. `access_token` 발급 |
| `POST /api/auth/logout` | 토큰의 jti 를 `token_blacklist` 에 등록. 이후 같은 토큰은 401 |
| `GET /api/me` | 내 정보 |
| `PATCH /api/me` | 내 정보 수정 (JSON: name?, phone?). 보낸 항목만 바뀌고 phone 을 빈 값으로 보내면 지운다 |

Swagger 오른쪽 위 **Authorize** 에 이메일·비밀번호를 넣으면 이후 요청에 토큰이 붙습니다.

다른 기능에서 로그인한 사용자가 필요하면:

```python
from core.dependencies import CurrentCustomer, get_current_customer

@router.get("/api/orders")
async def list_my_orders(customer: CurrentCustomer = Depends(get_current_customer)):
    ...  # customer.id 로 본인 데이터만
```

관리자 API 는 `Depends(require_admin)`. 관리자 토큰은 `security.create_access_token(admin_id, "admin", {"login_id": ...})` 로 발급합니다.

FastAPI 가 만드는 테이블(`customers`, `token_blacklist`)은 기동할 때 없으면 생성하고 RLS 를 켭니다 (Supabase Data API 노출 차단).

## 주문 (UC-C)

주문은 인수한 `orders`·`order_items`·`order_status_history` 표에 저장합니다 (`orders/infrastructure`, `LegacyBase` 매핑).
회원 주문은 `orders.customer_id`, Next.js 비회원 주문은 `customer_session_id` 로 구분합니다 (`prisma/migrations/0011_member_orders`).
가격 계산 때 카탈로그·`app_settings` 를 커밋까지 공유 잠금으로 읽으며, 순서는 Next.js 와 같은 카탈로그 → 배달 시간 → 가격 정책입니다.

모든 API 는 회원 토큰(`Depends(get_current_customer)`)이 필요하고 본인 주문만 다룹니다.
요청·응답 키는 기존 Next.js API 와 같은 camelCase 이고, 금액은 문자열(`"22000"`), 시각은 UTC 밀리초(`...000Z`)입니다.
요청 모양이 틀리면 `422`, 업무 규칙 위반은 `400` 입니다.

| API | 설명 | 주요 응답 |
| --- | --- | --- |
| `POST /api/v1/orders` | 주문 생성. 헤더 `Idempotency-Key` 필수 | 201 신규, 200 같은 키·같은 내용 재전송, 409 같은 키·다른 내용, 400 규칙 위반 |
| `GET /api/v1/orders?limit&cursor` | 내 주문 목록, 최신순 커서 페이지 | 200 `{items, nextCursor}` |
| `GET /api/v1/orders/{id}` | 내 주문 상세 | 404 없거나 남의 주문 (존재 여부를 드러내지 않음) |
| `POST /api/v1/orders/{id}/cancel` | 취소 (`{reason?}`) | 200 취소됨·이미 취소됨, 409 준비 시작 이후 |

업무 규칙 (기존 Next.js `modules/orders/*` 에서 이식):

- 가격은 클라이언트 값을 믿지 않고 카탈로그로 다시 계산합니다. 숨김·삭제·품절 상품과 연결되지 않은 옵션은 400.
- 최소 주문 **15,000원**, **30,000원 이상 무료배송** (미만 배달비 3,000원). 값은 코드가 아닌 DB `app_settings.pricing_policy` 에서 읽습니다.
- 배송 시간대: 한국 시간 오늘부터 14일 이내, 운영시간(`app_settings.delivery_hours`) 안의 1시간 단위, 지금부터 30분 이후 시작. 저장은 UTC.
- 상태: `received → confirmed → preparing → delivering → completed`. 고객 취소는 `received`·`confirmed` 에서만 가능하고, DB 트리거도 같은 순서를 강제합니다.
- 주문 당시 상품명·옵션·단가를 `order_items` 에 스냅샷으로 남깁니다.

## 오류 응답 규칙

| 예외 (`core.exceptions`) | 상태 | 쓰는 곳 |
| --- | --- | --- |
| 요청 스키마 검증 실패 | 422 | FastAPI 가 자동 처리 |
| `BusinessRuleViolation` | 400 | 도메인 규칙 위반 |
| `Unauthorized` | 401 | 토큰 없음·만료·로그아웃한 토큰 |
| `Forbidden` | 403 | 남의 데이터, 관리자 전용 |
| `NotFound` | 404 | 없는 리소스 |
| `Conflict` | 409 | 중복 가입, 이미 바뀐 상태, version 불일치 |

모든 오류는 `{"error": {"code": "...", "message": "..."}}` 모양입니다.
