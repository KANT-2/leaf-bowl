# leaf & bowl API (FastAPI)

인수한 Next.js 앱(저장소 루트) 옆에서 고객 회원·주문·관리자 기능을 맡는 백엔드입니다.

## 실행

```bash
cd backend
uv sync
cp .env.example .env   # DATABASE_URL, JWT_SECRET_KEY 채우기
uv run uvicorn main:app --app-dir src --reload
```

- Swagger: http://localhost:8000/docs
- 상태 확인: `GET /health`, DB 연결 확인: `GET /health/db`
- `DATABASE_URL` 이 비어 있으면 DB 없이 기동합니다 (`/health` 만 동작).

## 검사

```bash
uv run pytest
uv run ruff check src tests
uv run ruff format src tests
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
