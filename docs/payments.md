# 토스페이먼츠 테스트 결제

카드·토스페이·카카오페이는 토스 SDK의 결제창에서 인증한다. 앱은 카드번호·유효기간·CVC를 받거나 저장하지 않는다. 현재는 테스트 환경만 지원하며 실제 청구, 가상계좌, 자동결제와 자동 환불은 포함하지 않는다.

## 키 확인과 설정

1. [개발자센터](https://developers.tosspayments.com/)에 이메일로 가입하고 로그인한다.
2. 전자결제 신청 전에는 **개발 연동 체험 상점**, 신청 후에는 해당 상점을 선택한다.
3. [API 키](https://developers.tosspayments.com/my/api-keys)에서 **API 개별 연동 키**의 **결제창(구버전)** 상점아이디(MID)를 선택한다. 현재 SDK의 `payment()` 방식에 맞는 `test_ck_…` 클라이언트 키와 `test_sk_…` 시크릿 키를 같은 세트로 사용한다. 주문서형·결제창형의 `test_gck_…`/`test_gsk_…` 키와 브랜드페이·자동결제용 MID는 이 구현에 사용할 수 없다.
4. 로컬 `.env.local` 또는 배포 서버의 비밀 환경변수에 아래 이름으로 설정하고 서버를 재시작한다. 테스트 승인은 가상이며 금액이 차감되지 않는다.

```dotenv
TOSS_CLIENT_KEY=test_ck_발급받은_클라이언트_키
TOSS_SECRET_KEY=test_sk_같은_세트의_시크릿_키
```

클라이언트 키는 결제 화면에 전달되지만 시크릿 키는 서버 승인·조회에만 사용한다. 시크릿 키를 `NEXT_PUBLIC_*`, GitHub, 채팅, 로그에 넣지 않는다. 키를 공유해야 한다면 개발자센터의 **사용자 추가하기**로 권한을 부여한다. 키가 없거나 라이브 키가 설정되면 결제를 열지 않는다.

근거: [API 키 공식 안내](https://docs.tosspayments.com/reference/using-api/api-keys), [결제창 연동](https://docs.tosspayments.com/guides/v2/payment-window/integration), [SDK v2 결제](https://docs.tosspayments.com/sdk/v2/js/payment).

카카오페이 테스트는 계약 후 해당 상점 MID로 발급된 테스트 키가 필요하다. 문서용 키·개발 연동 체험 상점 키로는 제한된다. 카드 최종 인증에는 본인 카드가 필요하며 국내 테스트용 카드번호는 제공되지 않는다. [테스트 환경 공식 안내](https://docs.tosspayments.com/blog/how-to-test-toss-payments)

## DB와 배포

기존 DB에 `npm run db:migrate`로 `0006_toss_test_payments`를 먼저 적용한다. `payment_checkouts`에는 비회원 세션, 요청 키, 서버 계산 금액·상품 스냅샷, 만료 시각, 토스 paymentKey와 승인 후 주문 연결을 저장한다. 승인 전에는 접수 주문·매출에 포함되지 않는다. 기존 상품·주문·설정은 변경하지 않는다.

배포 프로세스에 `DATABASE_URL`, `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`를 주입한다. 프록시 환경에서는 `APP_ORIGIN`을 외부 HTTPS 앱 주소와 일치시킨다. `ops/mcp_cicd.py` supervisor도 키를 포함한 환경으로 재시작해야 다음 릴리스에 전달한다. 환경 파일은 저장소 밖 또는 Git에서 제외한 `.deploy/` 안에 권한 600으로 저장한다.

## 결제와 복구

`POST /api/v1/payments/checkout`은 기존 비회원 쿠키, 같은 출처 요청, `Idempotency-Key`를 요구한다. 상품과 옵션·배송 정책을 DB에서 검증하고 합계를 계산한 뒤 30분 이내의 결제 초안을 저장한다. 클라이언트 가격은 받지 않는다. 배송 시작이 더 빠르면 그 시각까지 유효하다.

토스 인증 후 `/checkout/success`에서 `POST /api/v1/payments/confirm`을 호출한다. 서버는 세션 소유권·초안 금액을 확인하고 paymentKey를 한 번 연결한 뒤 토스 조회·승인을 수행한다. 주문번호·paymentKey·금액·KRW·DONE·카드/간편결제 조건이 모두 일치해야 DB 트랜잭션에서 주문·상품·초기 상태 이력과 결제 연결을 함께 저장한다. 장바구니는 성공 후 해당 결제를 시작한 내용과 같을 때만 비운다.

중복 요청·새로고침은 같은 주문을 반환한다. 승인 응답이 끊기거나 승인 후 DB 저장이 실패하면 같은 paymentKey를 조회해 저장을 복구하며 새 결제를 열지 않는다. 인증 전 만료된 초안은 다시 생성한다. 인증 정보가 연결된 초안은 만료되더라도 보존하며, 토스에서 ABORTED/EXPIRED/CANCELED가 정확히 확인된 경우에만 새 시도를 허용한다. 알 수 없는 승인 결과에서는 기존 결과를 재확인한다.

비회원 쿠키를 삭제하면 결제 소유권을 확인할 수 없다. 승인 결과를 계속 확인하지 못하거나 토스와 DB 기록이 다르면 새 결제를 진행하지 말고 매장에서 해당 주문번호를 조회한다. 브라우저를 닫아 DB 저장 복구가 중단된 경우에도 같은 브라우저에서 같은 주문 내용으로 재시도하면 기존 결제 확인으로 돌아간다. 자동 백그라운드 정산 작업은 포함하지 않는다.

자동 환불은 구현하지 않았다. 결제 연결이 있는 주문의 취소 API·관리자 취소는 409로 막아, 토스 환불 없이 주문 상태만 취소되는 일을 방지한다. 환불 처리는 매장 문의로 안내한다. 판매 집계에는 테스트 결제로 생성한 완료 주문도 포함되므로 테스트 서버는 운영 DB와 분리한다.

## 검증

`npm test`는 키 설정·승인 응답·API 출처/세션/본문 계약을 검사한다. `npm run test:db`는 전용 PostgreSQL에서 동시 결제 초안·승인, 금액/세션/키 변조, 승인 응답 유실, 실제 주문 트랜잭션 롤백 복구, 가격 변경, 만료·확정 실패 재시도를 검사한다. 이 테스트의 토스 응답은 어댑터에서 대체한다.

실제 테스트 결제창 검증은 전용 DB를 마이그레이션·seed하고 테스트 키를 설정한 앱에서 수행한다. 테스트 DB 주문이 생성된다.

```sh
npm exec --yes --package=playwright -- playwright install chromium
FRONT5_BASE_URL=http://localhost:3419 npm exec --yes --package=playwright -- node tests/payments-browser.cjs
```

브라우저 스크립트는 실제 토스 샌드박스 결제창 열기·취소와 동일 초안 재시도를 검사한다. 본인 카드가 필요한 최종 인증·실제 토스 승인은 자동화하지 않는다. 콜백 화면의 응답 유실·재시도·장바구니 보호는 명시적으로 대체한 승인 API 응답으로 검사한다. 이 검증에서는 접수 주문이 생성되지 않는다. 실제 테스트 승인까지 확인하려면 같은 앱에서 본인 카드로 인증한 뒤 성공 화면과 DB 결제 연결을 확인한다.

스크린샷은 `docs/screenshots/toss/`에 저장한다. `callback-ui-mocked-approval.png`는 대체 API로 확인한 성공 화면이며 실제 토스 승인 증빙이 아니다. 결제창 UI는 외부 서비스이므로 변경되면 브라우저 검증 스크립트의 선택자를 갱신한다.
