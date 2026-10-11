# 회귀 검증

`npm test`는 TypeScript 로더를 공유하는 도메인·API 테스트를 실행한다. `npm run build` 다음 `npx tsc --noEmit`으로 생성된 Next.js 타입을 포함해 검사한다.

브라우저 검증은 별도 서버와 테스트 데이터를 사용한다. 기본 인증 테스트 계정은 아래 환경변수와 같다.

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
```

관리자 편집 테스트는 테스트 카탈로그의 첫 메뉴를 수정하고, 409 응답 후 입력 보존·재조회·저장을 확인한다. 이미지 산출물은 `docs/screenshots/code-quality/`에 생성된다. 실행 전후 변경된 스크린샷을 확인한다.

복원 상태 테스트는 격리한 API 응답으로 메뉴·음료·드레싱의 상태 3종, 옵션 연결 정리, 저장 실패·재시도 및 재접속을 검증한다. 서버의 실제 카탈로그에는 저장하지 않는다.

시간대 테스트는 UTC·서울·로스앤젤레스 브라우저에서 UTC 배송 요청/응답·체험 주문 저장과 KST 결제/주문 내역을 확인한다. 별도 테스트 서버의 메모리 주문 API에 주문 3건을 생성하므로 운영 서버에서 실행하지 않는다. 화면 캡처는 `docs/screenshots/delivery-timezone/`에 저장한다.

전체 시간대 테스트는 세 브라우저 시간대에서 KST 자정의 고객 리뷰·관리자 리뷰·매출 갱신 시각, 미리보기 예약 날짜와 30분 마감 기준, 실제 서버 리뷰 API의 UTC 저장·KST 날짜를 확인한다. 별도 테스트 서버에 리뷰 3건을 저장한다. 카탈로그 화면/미리보기 응답은 격리된 데이터로 대체하며 운영 서버에서 실행하지 않는다. 테스트 서버를 `TZ=America/Los_Angeles`로 실행하면 서버 시스템 시간대에 대한 독립성도 확인할 수 있다.

관리자 시간대 검증은 PR #82의 관리자 권한 검사에 맞춰 실제 로그인 API를 먼저 호출한다. 기본 계정은 위 테스트 서버 환경변수와 같으며, 다른 계정은 `FRONT5_ADMIN_LOGIN_ID`·`FRONT5_ADMIN_PASSWORD`로 전달한다.
