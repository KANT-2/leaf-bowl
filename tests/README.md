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
```

관리자 편집 테스트는 테스트 카탈로그의 첫 메뉴를 수정하고, 409 응답 후 입력 보존·재조회·저장을 확인한다. 이미지 산출물은 `docs/screenshots/code-quality/`에 생성된다. 실행 전후 변경된 스크린샷을 확인한다.
