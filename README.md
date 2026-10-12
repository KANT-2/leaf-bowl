<div align="center">

<img src="public/images/hero-cutout.png" alt="신선한 채소와 구운 닭고기를 담은 leaf & bowl 샐러드" width="280" />

# leaf & bowl

**오늘의 신선한 한 그릇**

샐러드를 고르고, 취향을 발견하고, 나만의 한 끼를 완성하는 쇼핑몰 체험 프로젝트.

<img src="https://img.shields.io/badge/Next.js-16.4-194B38?style=flat-square" alt="Next.js 16.4" />
<img src="https://img.shields.io/badge/React-19.3-194B38?style=flat-square" alt="React 19.3" />
<img src="https://img.shields.io/badge/TypeScript-5-194B38?style=flat-square" alt="TypeScript 5" />
<img src="https://img.shields.io/badge/Tailwind_CSS-4-194B38?style=flat-square" alt="Tailwind CSS 4" />

[프로젝트 소개](#프로젝트-소개) · [주요 기능](#주요-기능) · [시작하기](#시작하기) · [개발 가이드](#개발-가이드) · [관련 문서](#관련-문서)

</div>

---

## 프로젝트 소개

**leaf & bowl**은 샐러드와 음료 탐색부터 옵션 선택, 장바구니, 예약 배달과 결제 화면까지 이어지는 웹 프로젝트입니다. 재료를 골라 취향에 맞는 조합을 만드는 **bowl match**와 메뉴·옵션·리뷰·사이트 문구를 관리하는 **관리자 화면**을 함께 제공합니다.

Next.js App Router 기반으로 고객 화면과 관리자 화면을 구성하고, 공통 카탈로그를 통해 저장한 변경 사항을 고객 화면에 반영합니다.

> **체험 범위** · 로그인은 실제 인증 없이 동작하는 모의 로그인입니다. 결제 수단은 실제 청구가 없는 체험 기능이며, 주문 접수·조회와 관리자 인증은 PostgreSQL에 연결됩니다. 초기 리뷰는 예시 데이터입니다.

## 주요 기능

| 기능 | 사용자가 할 수 있는 일 |
| --- | --- |
| 🥗 메뉴 탐색 | 샐러드·음료 목록, 상품 상세, 재료·알레르기 정보 확인 |
| 🥑 bowl match | 재료 카드를 선택해 나만의 조합을 만들고 저장 |
| 🛒 장바구니 | 드레싱·음료 옵션 선택, 수량 변경, 최신 가격으로 합계 확인 |
| 🚚 예약 배달 체험 | 배송 정보와 수령 날짜·시간대를 선택하고 결제 흐름 체험 |
| ⭐ 상품 리뷰 | 평점 분포·정렬·더보기 확인, 리뷰 작성 및 서버 저장 |
| 👤 마이페이지 | 프로필·배송지·취향 설정, 체험 주문 내역과 내 리뷰 확인 |
| 🌿 관리자 | 메뉴·옵션·재료·시즌·리뷰·매장 위치 관리, 이미지 업로드, 고객 화면 미리보기 |

### 고객 화면과 연결된 카탈로그

관리자가 **저장한** 메뉴 이름·가격·이미지·판매 상태와 사이트 문구를 고객 화면에서 함께 사용합니다. 같은 브라우저의 탭에는 저장 알림을 전달하고, 다른 접속자는 화면 복귀·페이지 이동 시 갱신으로 최신 상태를 확인합니다. 주기적인 카탈로그 폴링은 사용하지 않습니다.

숨김·삭제한 상품은 고객 목록에서 제외되고, 품절 상품은 담기·주문이 제한됩니다. 장바구니에 담긴 상품과 옵션의 가격도 최신 카탈로그를 기준으로 다시 계산합니다.

<details>
<summary><strong>카탈로그 연동 검증 화면 보기</strong></summary>

아래 이미지는 자동 갱신과 가격 재계산을 확인하기 위해 테스트용 모의 API 응답을 사용한 화면입니다.

| 메뉴 자동 갱신 | 장바구니 가격 재계산 |
| --- | --- |
| ![메뉴 이름과 가격의 자동 갱신 검증](docs/screenshots/shared-catalog/menu-live-update.png) | ![장바구니 옵션 가격의 자동 재계산 검증](docs/screenshots/shared-catalog/cart-live-price.png) |

</details>

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 프레임워크 | Next.js 16.4 · App Router · Route Handlers |
| UI | React 19.3 · TypeScript 5 |
| 스타일 | Tailwind CSS 4 · 화면별 CSS |
| 컴포넌트 | Radix UI · Lucide React · Sonner |
| 데이터 검증 | Zod |
| 서버 저장소 | PostgreSQL 18 · Prisma 7.10 (카탈로그·앱 설정·리뷰·주문·세션) |
| 브라우저 저장소 | 장바구니·체험 프로필·취향 localStorage |
| DB 변경 이력 | Prisma migrations · 기존 SQL 제약·뷰·트리거 보존 |
| 검증·배포 | GitHub Actions `Frontend CI` · 개발 MCP 배포 스크립트 |

## 시작하기

### 로컬 개발

CI와 동일한 **Node.js 22**, npm, Git을 준비합니다.

```bash
git clone https://github.com/KANT-2/leaf-bowl.git
cd leaf-bowl
cp .env.example .env.local
# PostgreSQL 전용 DB와 DATABASE_URL을 설정한다.
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다. 관리자 화면은 [http://localhost:3000/admin](http://localhost:3000/admin)에서 확인할 수 있습니다.

PostgreSQL과 `DATABASE_URL`이 필요합니다. `db:seed`는 실행 원본 [db/seed.sql](db/seed.sql)로 비어 있는 카탈로그를 초기화하고 배너·배송시간·가격 정책·영양정보 등의 DB 설정을 넣습니다. 기존 편집과 주문은 보존합니다. 기존 JSON을 옮길 때는 seed보다 먼저 가져오기를 실행합니다. [DB 운영 가이드](docs/postgres.md)를 참고하세요.

### 저장 경로 설정

| 환경 변수 | 기본값 | 용도 |
| --- | --- | --- |
| `DATABASE_URL` | 없음 | 앱 전용 PostgreSQL 연결 주소 |
| `ADMIN_LOGIN_ID`, `ADMIN_PASSWORD` | 없음 | `db:seed`에서 만들 관리자 계정 |
| `ADMIN_DATA_DIR` | `.data/admin` | 업로드 이미지의 영속 저장 디렉터리 |

필요하면 저장소 루트의 `.env.local`에 경로를 지정합니다.

```dotenv
ADMIN_DATA_DIR=/absolute/path/to/leaf-bowl-data
```

릴리스 디렉터리를 교체하는 배포에서는 데이터를 유지하도록 고정 절대 경로를 사용합니다. 환경 변수 파일과 `.data/`는 Git에서 제외됩니다.

### 빌드와 실행

```bash
npm run build
npm run start
```

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 실행 |
| `npm run lint` | ESLint 규칙 및 Prettier 스타일 검사 |
| `npm run format` | 코드 포맷 수정 |
| `npm run format:check` | 코드 포맷 검사 |
| `npx eslint --fix` | 중괄호·함수 간 빈 줄 등 린트 자동 수정 |
| `npm run build` | 운영 빌드 생성 |
| `npm run start` | 생성된 운영 빌드로 서버 실행 |
| `npx --no-install tsc --noEmit` | TypeScript 검사 |

Next.js가 생성하는 타입을 사용하므로 별도 타입 검사는 빌드 후에 실행합니다.

## 페이지 안내

| 경로 | 화면 |
| --- | --- |
| `/` | 홈 · 시즌 스페셜 · 메뉴 · 리뷰 |
| `/menu` | 샐러드 메뉴 목록 |
| `/drinks` | 음료 목록 |
| `/product/[id]` | 상품 상세와 옵션 선택 |
| `/product/[id]/reviews` | 상품별 리뷰 |
| `/reviews` | 기본 상품 리뷰(`/product/0/reviews`)로 이동 |
| `/match` | bowl match · 나만의 재료 조합 |
| `/login` | 체험용 로그인 |
| `/mypage` | 프로필·배송지·취향·주문 내역·내 리뷰 |
| `/checkout` | 체험용 결제 |
| `/admin` | 관리자 화면 |
| `/admin/preview` | 관리자 카탈로그 기반의 별도 고객 미리보기 |

장바구니는 고객 화면에서 열리는 드로어입니다. 기존 `/bowl-match` 주소는 `/match`로 이동합니다.

## 개발 가이드

### 프로젝트 구조

```text
leaf-bowl/
├── app/
│   ├── (customer)/       # 고객 페이지와 루트 레이아웃
│   ├── admin/            # 관리자 페이지와 루트 레이아웃
│   ├── api/              # 카탈로그·상품·리뷰·이미지 API
│   └── styles/           # 고객 화면별 스타일
├── components/           # 고객 컴포넌트·Provider·관리자 UI
├── modules/              # 카탈로그·주문·프로필·장바구니의 계약과 업무 규칙
├── application/          # 트랜잭션 조합·서비스 생성·서버 조회
├── infrastructure/       # PostgreSQL·HTTP·브라우저 저장소 어댑터
├── features/             # 화면별 표시·입력·클라이언트 요청 로직
├── seed/                 # SQL 초기화·명시적 JSON 이관 전용
├── public/               # 상품·재료 이미지
├── prisma/               # DB 모델·마이그레이션·seed
├── db/                   # 기존 PostgreSQL 설계 SQL
├── tests/                # 카탈로그·브라우저 검증
├── docs/                 # 설계·연동 문서와 검증 스크린샷
├── ops/                  # 배포 스크립트·운영 문서·테스트
└── .github/workflows/    # Frontend CI
```

코드 스타일은 들여쓰기 2칸, 쌍따옴표, 세미콜론, 줄 폭 120자, LF로 통일합니다. `if`·`else`·`for`·`while`·`do` 본문에는 중괄호를 반드시 사용합니다. 인접한 함수 선언(화살표 함수·export 함수 포함)과 클래스 메서드 사이에는 빈 줄을 한 줄 두고, 연속 빈 줄 두 개 이상은 허용하지 않습니다. 긴 문자열·URL처럼 나누기 어려운 값은 120자를 넘을 수 있습니다.

`npx eslint --fix`로 중괄호·함수 간 간격을 수정한 다음 `npm run format`으로 포맷을 정리합니다. `npm run lint`는 두 검사 모두 수행하며 스타일 위반도 기존 CI에서 실패합니다. 생성 코드·빌드 결과·배포 상태·사진/정적 자산·문서는 자동 포맷 대상에서 제외합니다. SQL·Prisma 스키마·Python은 Prettier 포맷 대상이 아닙니다.

[모듈 경계와 데이터 흐름](docs/architecture.md)에 책임·의존성 규칙과 변경 시 확인할 항목을 정리했습니다. `npm run lint`와 `npm test`가 경계 위반·순환 의존성·클라이언트의 서버 코드 참조를 검사합니다.

Tailwind 색상·글꼴 토큰은 `app/styles/theme.css`에서 공유합니다. 기본 스타일은 `base`, 화면별 CSS는 `components` 레이어에 두어 Tailwind 유틸리티로 크기·여백을 조정할 수 있게 합니다. 고객의 기존 리셋과 관리자 Preflight는 각 루트 레이아웃에서 유지합니다. 공통 컴포넌트의 변형과 화면이 요구하는 크기는 컴포넌트 클래스에서 지정합니다.

### 데이터는 어디에 저장되나요?

| 데이터 | 현재 저장 위치 | 특징 |
| --- | --- | --- |
| 고객·관리자 공통 카탈로그와 리뷰 | PostgreSQL | `application/catalog.ts`에서 조회·저장, 잠금·`revision`으로 저장 충돌 확인 |
| 배너·배송시간·가격·영양·추천·편집 선택지 | PostgreSQL `app_settings` | 런타임 정적 기본값 없이 검증된 DB 설정 사용 |
| 서버 주문·주문 항목·상태 이력 | PostgreSQL | 비회원 세션별 조회, 재전송·상태 변경 충돌 방지 |
| 관리자 계정·관리자/비회원 세션 | PostgreSQL | 비밀번호·토큰 해시와 만료 시각 보존 |
| 관리자 업로드 이미지 | 서버의 `images/` 디렉터리 | `ADMIN_DATA_DIR` 아래 보관, PNG·JPEG·WebP 및 파일당 5MB 제한 |
| 장바구니 | localStorage · `bb-cart` | 브라우저에 보존하고 최신 카탈로그로 가격·판매 가능 여부 계산 |
| 모의 사용자·프로필·배송지·취향 | localStorage · `bb-user` | 서버 계정 없이 현재 브라우저에 저장 |
| 과거 체험 주문 내역 | localStorage · `bb-orders` | 이전 기록을 보존하며 새 DB 주문과 함께 표시 |
| 저장한 bowl match 조합 | localStorage · `bm-recipe` | 저장한 조합을 보존하고 카드 진행 상태는 메모리에서 관리 |
| 작성한 리뷰의 로컬 기록 | localStorage · `bb-user-reviews` | 서버 저장 리뷰와 연계해 내 리뷰 식별·기존 기록 이관에 사용 |
| 개별 상품 조회·수정 API | PostgreSQL 공통 카탈로그 | 고객·관리자 화면 및 주문 가격과 같은 저장소 |

DB 구조는 [`prisma/schema.prisma`](prisma/schema.prisma), 변경 이력은 `prisma/migrations`에서 관리합니다. 기존 SQL의 CHECK·IDENTITY·뷰·트리거를 baseline에 보존했습니다. 실행과 기존 JSON 이관은 [DB 운영 가이드](docs/postgres.md)를 참고합니다.

### 구현된 API

| 메서드 | 경로 | 용도 |
| --- | --- | --- |
| `GET` | `/api/catalog` | 고객용 카탈로그 조회 |
| `GET`, `PUT` | `/api/admin/catalog` | 관리자 카탈로그 조회·전체 저장 |
| `POST` | `/api/reviews` | 고객 리뷰 작성 |
| `POST` | `/api/admin/images` | 관리자 이미지 업로드 |
| `GET` | `/api/admin/images/[key]` | 업로드 이미지 조회 |
| `GET` | `/api/products` | 공통 DB 상품 목록·분류별 조회 |
| `GET` | `/api/products/[id]` | 공통 DB 개별 상품 조회 |
| `PATCH` | `/api/admin/products/[id]` | 관리자 인증 후 공통 DB 상품 일부 수정 |

개별 상품 API도 공통 카탈로그를 사용합니다. 오류 응답은 카탈로그 계열의 `{ "error": "메시지" }`와 개별 상품 API의 `{ "message": "메시지" }`로 구분됩니다.

### 변경 사항 검증

기본 검증은 저장소 루트에서 아래 순서로 실행합니다.

```bash
npm ci
npm run db:validate
npm test
npm run test:db
npm run lint
npm run build
npx --no-install tsc --noEmit
```

카탈로그 저장·이관·옵션·리뷰를 수정할 때는 `npm test`와 `npm run test:db`를, CI/CD 스크립트를 수정할 때는 `python3 -m unittest discover -s ops -p 'test_*.py' -v`를 추가로 실행합니다. 브라우저 연동 확인 절차는 [관리자·고객 연동 문서](docs/admin-integration.md)에 정리되어 있습니다.

## 배포와 협업

GitHub Actions의 **Frontend CI**는 PR과 `main`·`production` push에서 의존성 설치, 린트, 배포 스크립트 테스트, 빌드, 타입 검사를 수행합니다. 개발 MCP 배포 프로세스는 해당 브랜치 최신 커밋의 CI 성공을 확인한 뒤 서버를 교체합니다.

| 브랜치 | 역할 | 배포 환경 |
| --- | --- | --- |
| 작업 브랜치 | 기능·수정·문서 작업 | `main` 대상 PR로 검토 |
| `main` | 개발 결과 통합·검증 | 비공개 검증 앱 · 포트 3100 |
| `production` | 운영 배포 기준 | 공개 운영 앱 · 포트 3200 |

작업은 **이슈 → 작업 브랜치 → PR** 순서로 진행합니다. 일반 작업 PR은 리뷰·CI를 통과한 뒤 Squash merge하고, `main → production` 배포와 `production → main` 동기화에는 Merge commit을 사용합니다.

브랜치 보호·리뷰·Hotfix 규칙은 [AGENTS.md](AGENTS.md), 배포 준비·상태 확인·복구 방법은 [운영 가이드](ops/README.md)를 따릅니다.

## 관련 문서

| 문서 | 내용 |
| --- | --- |
| [저장소 작업 지침](AGENTS.md) | 이슈·계획·브랜치·PR·코드리뷰 규칙 |
| [관리자·고객 연동](docs/admin-integration.md) | 공통 카탈로그, 데이터 이관, 브라우저 검증 절차 |
| [DB 설계](docs/db-design.md) | PostgreSQL ERD, 테이블 매핑, 트랜잭션 계약 |
| [DB 운영](docs/postgres.md) | DB 설정·초기화·JSON 이관·테스트·배포 |
| [배포·운영](ops/README.md) | 개발 MCP 배포, CI 게이트, 로그와 복구 |

---

<p align="center"><strong>FRESH EVERY DAY</strong><br />오늘의 신선함을, 당신의 한 끼로.</p>
