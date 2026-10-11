# 백엔드 시연 가이드 (메모리 저장소 기준)

주문·인증 API 를 **화면 없이 터미널(curl)로** 시연하는 순서와, 시연 전에 확인할 환경 설정을 정리한다.
실제 DB 가 없어 저장소는 메모리 구현이다. 서버를 다시 시작하면 주문·세션이 초기화된다.

## 1. 서버 실행

```bash
npm ci
npm run build
ADMIN_LOGIN_ID=admin ADMIN_PASSWORD=<발표용 비밀번호> npm run start   # http://localhost:3000
```

| 환경변수 | 용도 | 비고 |
| --- | --- | --- |
| `ADMIN_LOGIN_ID`, `ADMIN_PASSWORD` | 임시 관리자 계정 | **둘 다 있어야** 만들어진다. 없으면 어떤 로그인도 실패한다(기본 비밀번호 없음) |
| `ADMIN_DATA_DIR` | 카탈로그·이미지 저장 폴더 | 기본 `.data/admin` |
| `TRUSTED_PROXY_HOPS` | 앞단 프록시 개수 | 기본 0. 설정하지 않으면 요청자별 제한이 꺼지고 전체·계정 단위 제한만 작동한다 |
| `NODE_ENV` | `npm run start` 는 `production` | 아래 주의 참고 |

**주의: 쿠키 `Secure`**
- `production` 에서는 세션 쿠키에 `Secure` 가 붙는다. 시연 주소가 **HTTPS 가 아니면**(예: `http://서버IP:3000`) 브라우저가 쿠키를 버려서 **로그인이 되지 않는다.**
- `http://localhost` 는 브라우저가 예외로 받아 준다. 서버 주소로 시연하려면 HTTPS 를 쓰거나 `npm run dev` 로 띄운다(개발 모드는 `Secure` 가 붙지 않는다).
- **curl 도 같은 규칙을 따른다.** 쿠키 파일(`-c`, `-b`)은 `Secure` 플래그를 보존하고 HTTPS 에서만 보낸다(`localhost` 는 예외). 개발 서버에서 실측한 결과: `http://localhost:3000` 은 쿠키가 전달되어 `200`, `http://172.27.0.3:3000`(비-localhost HTTP)은 쿠키가 저장되지 않아 후속 요청이 `401` 이었다. 그래서 **아래 시연 스크립트는 서버와 같은 기기에서 `localhost` 로 실행하거나 HTTPS 주소로 실행**해야 한다. 쿠키의 `Secure` 를 끄거나 쿠키 파일을 고쳐서 우회하지 않는다.

## 2. 시연 순서 (13단계)

서버가 켜진 상태에서 아래 스크립트를 실행한다(`ADMIN_PASSWORD` 는 서버와 같은 값). 각 단계에서 보여 줄 것은 주석과 같다. 같은 명령으로 개발 서버에서 실제 실행해 확인했다.

```bash
#!/usr/bin/env bash
B=${B:-http://localhost:3000}
ADMIN_ID=${ADMIN_LOGIN_ID:-admin}
ADMIN_PW=${ADMIN_PASSWORD:?ADMIN_PASSWORD 를 지정하세요}
DAY=$(date -d "+1 day" +%F 2>/dev/null || date -v+1d +%F)   # 받을 날짜: 내일
J='content-type: application/json'
JAR=$(mktemp -d)

# 메뉴 번호 0 (레몬 치킨 아보카도) 2개 + 드레싱 선택. 가격은 보내지 않는다.
BODY='{"items":[{"productId":0,"dressingKey":"dressing-0","quantity":2}],"ordererName":"홍길동","phone":"010-1234-5678","address":"서울 중구 세종대로 110","desiredDate":"'$DAY'","desiredSlot":"12:00–13:00"}'

echo "1) 비회원 세션 발급 (쿠키로만 전달)"
curl -s -c $JAR/guest -X POST $B/api/v1/session; echo

echo "2) 주문 생성 — 서버가 가격을 다시 계산"
R=$(curl -s -b $JAR/guest -X POST $B/api/v1/orders -H "$J" -H 'Idempotency-Key: demo-0001' -d "$BODY"); echo "$R"
ID=$(echo "$R" | sed -E 's/.*"id":"([^"]+)".*/\1/')

echo "3) 같은 요청 재전송 → 같은 주문(200), 중복 접수 없음"
curl -s -o /dev/null -w "상태 %{http_code}\n" -b $JAR/guest -X POST $B/api/v1/orders -H "$J" -H 'Idempotency-Key: demo-0001' -d "$BODY"

echo "4) 같은 키로 다른 내용 → 409"
curl -s -b $JAR/guest -X POST $B/api/v1/orders -H "$J" -H 'Idempotency-Key: demo-0001' -d "${BODY/110/999}"; echo

echo "5) 가격을 조작해서 보내기 → 400 (서버가 가격 필드를 거부)"
curl -s -b $JAR/guest -X POST $B/api/v1/orders -H "$J" -H 'Idempotency-Key: demo-0002' -d '{"items":[{"productId":0,"dressingKey":"dressing-0","quantity":2,"price":1}],"ordererName":"A","phone":"010-1234-5678","address":"x","desiredDate":"'$DAY'","desiredSlot":"12:00–13:00"}'; echo

echo "6) 로그인 없이 관리자 API → 401"
curl -s $B/api/v1/admin/orders; echo

echo "7) 관리자 로그인"
curl -s -c $JAR/admin -X POST $B/api/v1/auth/login -H "$J" -d '{"loginId":"'$ADMIN_ID'","password":"'$ADMIN_PW'"}'; echo

echo "8) 관리자 주문 목록 / 상세 (연락처·처리 이력 포함)"
curl -s -b $JAR/admin "$B/api/v1/admin/orders?status=received"; echo
curl -s -b $JAR/admin $B/api/v1/admin/orders/$ID | head -c 600; echo

echo "9) 상태 변경: 접수 → 확인 (version 낙관적 잠금)"
curl -s -b $JAR/admin -X PATCH $B/api/v1/admin/orders/$ID/status -H "$J" -d '{"status":"confirmed","version":1}'; echo
echo "10) 오래된 version 으로 다시 변경 → 409 (다른 관리자가 먼저 바꿈), 최신 version 으로는 성공"
curl -s -b $JAR/admin -X PATCH $B/api/v1/admin/orders/$ID/status -H "$J" -d '{"status":"preparing","version":1}'; echo
curl -s -b $JAR/admin -X PATCH $B/api/v1/admin/orders/$ID/status -H "$J" -d '{"status":"preparing","version":2}'; echo

echo "11) 준비가 시작된 주문의 고객 취소 → 409"
curl -s -b $JAR/guest -X POST $B/api/v1/orders/$ID/cancel -H "$J" -d '{}'; echo

echo "12) 다른 방문자는 이 주문을 볼 수 없다 → 404"
curl -s -c $JAR/other -X POST $B/api/v1/session >/dev/null
curl -s -b $JAR/other $B/api/v1/orders/$ID; echo

echo "13) 내 주문 목록 (마이페이지 주문 내역용)"
curl -s -b $JAR/guest $B/api/v1/orders | head -c 400; echo
rm -rf $JAR
```

실제 실행 결과(요약)

| 단계 | 응답 |
| --- | --- |
| 2 주문 생성 | `201` `{"status":"received","subtotal":"21800","deliveryFee":"3000","total":"24800", ...}` (금액은 문자열) |
| 3 재전송 | `200` (같은 주문) |
| 4 다른 내용 | `409` `같은 요청 번호로 다른 내용의 주문이 이미 있습니다.` |
| 5 가격 조작 | `400` `주문 내용을 확인해주세요.` |
| 6 로그인 없음 | `401` `로그인이 필요합니다.` |
| 10 오래된 version | `409` `다른 관리자가 먼저 변경했습니다. 새로 고친 뒤 다시 시도해주세요.` |
| 11 준비 중 취소 | `409` `준비가 시작된 주문은 취소할 수 없습니다.` |
| 12 타인 주문 | `404` `주문을 찾을 수 없습니다.` |

## 3. 추가로 보여 줄 수 있는 것

- **관리자 API 보호**: 로그인 없이 `GET /api/admin/catalog`, `/admin/preview` → `401` / 로그인 화면으로 이동. 로그아웃 뒤에는 같은 쿠키로 다시 접근할 수 없다.
- **남용 방어**: 헤더를 바꿔 새 세션을 계속 요청해도 분당 120건에서 `429`. 틀린 비밀번호를 같은 아이디로 분당 10번 넘게 보내면 `429`.
- **테스트**: `node --test tests/*.test.cjs` (시간대 `TZ=UTC`, `TZ=Asia/Seoul`, `TZ=America/Los_Angeles` 에서 같은 결과).

## 4. 발표에서 말할 한계 (정직하게)

- 실제 DB 가 없어 **메모리 저장소**다. 서버를 다시 시작하면 주문·세션이 사라진다. DB(PostgreSQL, Prisma)로 바꿀 때 service·route 의 업무 규칙은 그대로 쓰고, 저장소 계약은 트랜잭션을 표현하도록 바꾼다([트랜잭션 계약 제안](db-design.md)).
- 화면의 주문 완료는 아직 이 API 를 호출하지 않는다(화면 담당과 연동 예정). 체크아웃은 localStorage mock 이다.
- 관리자 계정은 환경변수로 만드는 임시 계정이다.
- 요청 제한은 서버 메모리 기준이라 서버가 여러 대면 공유되지 않는다.
- 같은 아이디로 틀린 시도가 많으면 그 아이디가 1분간 잠길 수 있다(무차별 대입 방지의 대가, [제한 사항](db-design.md#세션-정리와-상한)).

## 5. 시연 전 체크리스트

- [ ] 시연 주소(브라우저·curl 모두)가 HTTPS 이거나 `localhost` 인가 (비-localhost HTTP 이면 로그인·주문 조회가 401 이 된다. 브라우저 시연은 `npm run dev` 도 가능)
- [ ] `ADMIN_LOGIN_ID`, `ADMIN_PASSWORD` 를 서버에 설정했고 시연자가 비밀번호를 알고 있는가
- [ ] 서버를 방금 재시작해 이전 주문이 비어 있는가(원하면)
- [ ] 받을 날짜는 내일, 시간대는 영업시간(10:00–21:00) 안의 한 시간 단위인가
- [ ] `node --test tests/*.test.cjs` 가 통과하는가

## UTC 저장·KST 표시 호환

배송 요청은 `desiredStartAt`·`desiredEndAt`의 UTC ISO Z를 사용한다. 위 시연의 기존 `desiredDate`·`desiredSlot` 쌍도 호환 입력으로 받아 KST로 해석하고 UTC로 정규화한다. 고객·관리자 목록/상세는 UTC 시작·종료와 그로부터 계산한 KST 호환 날짜/슬롯을 함께 반환한다. Prisma 초안은 SQL과 같은 `desired_start_at`·`desired_end_at` TIMESTAMPTZ를 사용한다. DB 연결·마이그레이션 적용은 별도 단계다.
