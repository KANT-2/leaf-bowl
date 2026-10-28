# 회귀 검증

## 로컬 UI/UX 읽기 전용 QA

VS Code PowerShell에서 저장소 루트로 이동한 뒤 실행한다. 기존 `localhost:3000` 서버를 재사용하며 서버·DB를 시작하거나 변경하지 않는다. Playwright가 없다면 아래 공식 패키지와 Chromium을 **사용자가 직접** 설치한다. 이 설치는 네트워크 다운로드를 포함한다.

```powershell
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run qa:ui
```

러너는 새 브라우저 컨텍스트에서 공개 고객 화면을 390/768/1024/1440px로 캡처한다. Bowl Match 선택 0/1/4/8/12/18개, 합성 장바구니의 긴 목록·스크롤·하단 액션과 고객 Select 3곳의 열림·키보드를 확인한다. GET/HEAD/OPTIONS 외 네트워크 요청은 차단하며 결제·저장·삭제 버튼은 누르지 않는다. 실행 결과는 `.next/ui-ux-local-qa/<실행시각>/report.md`, `results.json`, PNG에 저장된다. 자동 기능 결과와 사람이 판정할 시각 QA를 분리하므로 캡처만으로 통합 작업 목록의 상태를 `VERIFIED_DONE`으로 바꾸지 않는다. 리뷰 작성 모달 및 관리자 배달·Select·이벤트 기간은 인증과 격리된 로컬 테스트 DB가 확인되기 전까지 `NOT RUN`이다. 현재 `package.json`에 `health:pages` 명령은 없다.

`npm test`는 TypeScript 로더를 공유하는 도메인·API 테스트를 실행한다. 모듈 그래프 검사는 상대 경로·alias·타입·동적 import를 확인하며 런타임 순환과 클라이언트의 서버 모듈 로드를 차단한다. 장바구니 불변성·수량·변형 병합, 프로필 기본 배송지, 시드 없는 카탈로그 저장, 필수 DB 설정·미등록 영양정보도 검증한다. `npm run build` 다음 `npx tsc --noEmit`으로 생성된 Next.js 타입을 포함해 검사한다.

`npm run lint`는 ESLint와 Prettier 검사를 함께 실행하며 CI에서 스타일 차이를 실패로 처리한다. 스타일 수정은 `npx eslint --fix` 다음 `npm run format` 순서로 수행한다. 2칸·쌍따옴표·세미콜론·120자, 제어문 중괄호, 함수 사이 빈 줄 1개, 연속 빈 줄 최대 1개를 검사한다. CSS도 포맷 대상이다.

브라우저 검증은 별도 테스트 DB·서버를 사용한다. PostgreSQL 연결은 [DB 운영 가이드](../docs/postgres.md)로 준비하고 테스트 DB의 `DATABASE_URL`을 설정한다. `npm run db:migrate` 다음 `ADMIN_LOGIN_ID=quality-admin ADMIN_PASSWORD=quality-password npm run db:seed`로 테스트 계정을 먼저 준비한다. 시작 명령만으로 계정이 생성되지는 않는다.

```bash
npm run build
ADMIN_DATA_DIR=/tmp/leaf-bowl-ui-tests ADMIN_LOGIN_ID=quality-admin ADMIN_PASSWORD=quality-password npm run start -- --port 3337
```

다른 터미널에서 Playwright 브라우저를 준비한 뒤 실행한다. Playwright는 기존 브라우저 검증처럼 임시 도구로 실행하며 앱 의존성에 추가하지 않는다.

```bash
npm exec --package=playwright -- playwright install chromium
FRONT5_BASE_URL=http://localhost:3337 npm exec --package=playwright -- node tests/admin-editors-browser.cjs
FRONT5_BASE_URL=http://localhost:3337 npm exec --package=playwright -- node tests/catalog-browser.cjs
FRONT5_BASE_URL=http://localhost:3337 npm exec --package=playwright -- node tests/restore-status-browser.cjs
FRONT5_BASE_URL=http://localhost:3337 npm exec --package=playwright -- node tests/delivery-timezone-browser.cjs
FRONT5_BASE_URL=http://localhost:3337 npm exec --package=playwright -- node tests/timezone-browser.cjs
FRONT5_BASE_URL=http://localhost:3337 npm exec --package=playwright -- node tests/architecture-browser.cjs
FRONT5_BASE_URL=http://localhost:3337 npm exec --package=playwright -- node tests/tailwind-browser.cjs
# 회원 로그인·주문: FastAPI(backend/)를 같은 전용 DB 로 띄우고 BACKEND_URL 로 가리켜 빌드한 앱에서 실행한다
FRONT5_BASE_URL=http://localhost:3337 npm exec --package=playwright -- node tests/member-order-browser.cjs
```

관리자 편집 테스트는 테스트 카탈로그의 첫 메뉴를 수정하고, 409 응답 후 입력 보존·재조회·저장을 확인한다. 이미지 산출물은 `docs/screenshots/code-quality/`에 생성된다. 실행 전후 변경된 스크린샷을 확인한다.

복원 상태 테스트는 격리한 API 응답으로 메뉴·음료·드레싱의 상태 3종, 옵션 연결 정리, 저장 실패·재시도 및 재접속을 검증한다. 서버의 실제 카탈로그에는 저장하지 않는다.

시간대 테스트는 UTC·서울·로스앤젤레스 브라우저에서 UTC 배송 요청/응답·체험 주문 저장과 KST 결제/주문 내역을 확인한다. 별도 테스트 서버의 메모리 주문 API에 주문 3건을 생성하므로 운영 서버에서 실행하지 않는다. 화면 캡처는 `docs/screenshots/delivery-timezone/`에 저장한다.

전체 시간대 테스트는 세 브라우저 시간대에서 KST 자정의 고객 리뷰·관리자 리뷰·매출 갱신 시각, 권한 있는 미리보기의 실제 고객 앱 이동, 실제 서버 리뷰 API의 UTC 저장·KST 날짜를 확인한다. 별도 테스트 서버에 리뷰 3건을 저장한다. 카탈로그 화면/미리보기 응답은 격리된 데이터로 대체하며 운영 서버에서 실행하지 않는다. 테스트 서버를 `TZ=America/Los_Angeles`로 실행하면 서버 시스템 시간대에 대한 독립성도 확인할 수 있다.

관리자 시간대 검증은 PR #82의 관리자 권한 검사에 맞춰 실제 로그인 API를 먼저 호출한다. 기본 계정은 위 테스트 서버 환경변수와 같으며, 다른 계정은 `FRONT5_ADMIN_LOGIN_ID`·`FRONT5_ADMIN_PASSWORD`로 전달한다.

`architecture-browser.cjs`는 카탈로그 응답을 격리하여 DB 배송비 표시·미등록 영양정보·관리자 DB 선택지와 미리보기 이동을 확인한다. 캡처는 `docs/screenshots/issue-97/`에 저장한다. 기존 회귀 스크립트는 `FRONT5_SCREENSHOT_DIR`로 캡처 위치를 바꿀 수 있다. 카탈로그·조합 테스트의 모의 고객 응답도 실제 공개 응답 투영을 사용한다.

`tailwind-browser.cjs`는 실제 로그인 후 홈·메뉴·상품·조합·관리자 로그인·관리자 화면을 1440·390px에서 확인하고 공통 사이드바 크기 변형을 검사한다. 메뉴·관리자 캡처는 `docs/screenshots/issue-97/`에 저장하며 `FRONT5_SCREENSHOT_DIR`로 바꿀 수 있다. 변경 전 서버에서 아래 첫 명령으로 기준을 저장하고, 같은 DB를 사용하는 변경 후 운영 빌드 서버에서 두 번째 명령으로 크기·간격·색상을 비교한다. 두 실행 사이에 카탈로그를 수정하지 않는다. 기준 파일을 생략하면 페이지 오류·크기 변형만 검사하고 캡처한다.

```bash
TAILWIND_CAPTURE_BASELINE=1 TAILWIND_BASELINE_FILE=/tmp/leaf-bowl-tailwind-before.json FRONT5_BASE_URL=http://localhost:3337 npm exec --package=playwright -- node tests/tailwind-browser.cjs
TAILWIND_BASELINE_FILE=/tmp/leaf-bowl-tailwind-before.json FRONT5_BASE_URL=http://localhost:3337 npm exec --package=playwright -- node tests/tailwind-browser.cjs
```
