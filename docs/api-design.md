# leaf & bowl API 명세 (경로 설계안)

작성: 안형준 (백엔드) · 기준: main `3658fa9`, 백엔드 설계안(PR #45) · 상태: **검토 요청**

각 API 를 **요청 메서드 / 요청 경로 / 요청 예시 / 응답 예시** 순서로 정리하고, 마지막 열 **구분**에 지금 코드와의 관계를 적는다.
내부 구조·DB 는 `docs/db-design.md` 와 백엔드 설계안을 본다.

**요청 예시**는 `{ 필드: 타입 }` 로 적고 `?` 는 선택, 괄호는 값이 들어가는 위치(경로·쿼리·본문·헤더)다. 값이 들어간 예는 §6 에 있다.

| 구분 | 뜻 |
| --- | --- |
| 현재 | main 에 이미 있고 이 문서에서 바꾸지 않는다 |
| 이동 | 같은 기능을 `/api/v1` 아래 새 경로로 옮긴다 (기존 경로는 새 경로가 자리 잡으면 제거) |
| 신규 | 새로 만든다 |
| 후속 | 이번 범위 밖 |

## 1. 공통 규칙

### 경로

| # | 규칙 | 예 |
| --- | --- | --- |
| 1 | 새로 만드는 API 는 모두 `/api/v1/*` 아래에 둔다. `v1` 은 API 규격의 첫 번째 버전이며 다른 서버를 뜻하지 않는다. 관리자용은 `/api/v1/admin` 아래 | `/api/v1/products`, `/api/v1/admin/orders` |
| 2 | 지금 화면이 쓰는 `/api/catalog`, `/api/admin/catalog`, `/api/admin/images`, `POST /api/reviews` 는 그대로 두고 같은 서비스에 연결해 호환성을 유지한다 | |
| 3 | 경로에는 명사(복수형)만 쓰고 동작은 HTTP 메서드로 표현한다 | `GET` 조회, `POST` 만들기, `PATCH` 일부 수정, `PUT` 전체 교체 |
| 4 | 소유 관계는 경로 계층으로 표현한다 | `/api/v1/products/{id}/reviews` |
| 5 | 조건·쪽 나눔은 쿼리 문자열로 받는다. 한글 값은 URL 인코딩한다 | `?category=%ED%94%8C%EB%9E%9C%ED%8A%B8%20%EB%B2%A0%EC%9D%B4%EC%8A%A4` (문서에서는 읽기 쉽게 `?category=플랜트 베이스` 로 적는다) |
| 6 | 고객 경로의 `{id}` 는 화면 주소 번호(`/product/0` 의 0), 관리자 상품 경로의 `{key}` 는 카탈로그 id(`salad-0`), 주문 경로의 `{id}` 는 주문 UUID | |

규칙 3 의 예외 (한 화면 단위이거나 동작 자체인 경로):

| 경로 | 이유 |
| --- | --- |
| `/api/catalog`, `/api/admin/catalog` | 메뉴·옵션·리뷰·문구를 한 덩어리로 다루는 단일 자원. 이미 화면이 사용 중 |
| `/api/v1/home` | 메인 한 화면용 모음 |
| `/api/v1/session`, `/api/v1/auth/login`, `/api/v1/auth/logout` | 만들어지는 자원이 아니라 동작 (설계안의 경로) |
| `/api/v1/orders/{id}/cancel`, `/api/v1/admin/orders/{id}/status` | 취소·상태 변경이라는 동작 (설계안의 경로) |

### 인증과 권한

| 구분 | 방식 |
| --- | --- |
| 고객(비회원) | `POST /api/v1/session` 으로 방문자 세션을 받는다. 쿠키로 유지되고, 본인 주문만 조회·취소할 수 있다 |
| 관리자 | `POST /api/v1/auth/login` 으로 로그인한다. 관리자 세션 쿠키가 있어야 `/api/v1/admin/*` 를 쓸 수 있다 |
| 쿠키 | JavaScript 가 읽을 수 없고(`HttpOnly`) 운영 HTTPS 에서만 전달된다. 관리자·고객 쿠키를 구분한다 |
| 쓰기 요청 | 같은 사이트에서 온 요청만 허용한다 (CSRF 방어), 로그인·주문·리뷰는 요청 횟수를 제한한다 |

> **기존 관리자 API 의 권한 검사**: `GET`·`PUT /api/admin/catalog`, `POST /api/admin/images`, `GET /api/admin/sales` 는 관리자 세션이 없으면 `401` 이다. 오류 모양은 기존 API 와 같은 `{ "error": "로그인이 필요합니다." }` 를 유지한다(화면의 오류 표시가 깨지지 않게). `/admin/preview` 는 로그인 화면으로 이동하고, `/admin` 은 로그인 쿠키가 없으면 로그인 화면으로 이동한다(보조 장치이며 실제 검사는 API 가 한다).
> 고객 화면이 쓰는 `GET /api/catalog` 와 업로드 이미지 조회(`GET /api/admin/images/{key}`)는 공개다. `PATCH /api/admin/products/{id}` 는 상품 API 통합(#72)에서 교체한 뒤 같은 검사를 붙인다.

### 공통 에러 포맷

모든 API 는 실패하면 아래 모양으로 응답한다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `status` | number | HTTP 상태 코드와 같은 값 |
| `message` | string | 사용자에게 보여줄 수 있는 한국어 안내 |

```json
{ "status": 404, "message": "상품을 찾을 수 없습니다." }
```

| 상태 | 언제 | message 예 |
| --- | --- | --- |
| 400 | 잘못된 값 (모르는 분류, 형식이 틀린 `page`·`size`, 입력 검사 실패, 가격 변조·품절 상품·잘못된 옵션 주문) | `"리뷰 내용을 확인해주세요."` |
| 401 | 인증 실패 (로그인 정보가 틀림, 로그인하지 않음, 세션 만료) | 로그인 실패 `"아이디 혹은 패스워드가 다릅니다"`, 비회원 세션이 없거나 만료 `"세션이 없거나 만료되었습니다. 페이지를 새로 고쳐주세요."` |
| 403 | 권한 부족, 또는 다른 사이트에서 보낸 쓰기 요청 | `"허용되지 않은 요청입니다."` |
| 404 | 없는 메뉴, 숨김·삭제된 메뉴, **다른 사람의 주문** (존재 여부도 알려주지 않는다) | `"상품을 찾을 수 없습니다."` |
| 409 | 충돌: 관리자 저장 `revision` 이 다름, 주문 상태 `version` 이 다름, 같은 재전송 식별키로 다른 내용, 취소할 수 없는 상태 | `"다른 화면에서 데이터가 변경되었습니다. 최신 내용을 불러온 뒤 다시 저장해주세요."` |
| 413 | 본문이 너무 큼 | `"저장할 데이터가 너무 큽니다."` |
| 429 | 요청이 너무 많음 (로그인은 접속자·계정 단위, 주문은 세션 단위로 제한) | `"요청이 너무 많습니다. 잠시 후 다시 시도해주세요."` |
| 503 | 저장소 오류 | `"잠시 후 다시 시도해주세요."` |

> **설계안이다.** 지금 코드는 에러를 `{ "error": "메시지" }` 로 내려준다 (`lib/admin/server.ts` 의 `jsonError`).
> 이 포맷으로 정해지면 `jsonError` 한 곳을 `{ status, message }` 로 바꾸고, 화면에서 `error` 필드를 읽는 곳을 함께 고친다.

### 성공 상태 코드

| 메서드 | 상태 |
| --- | --- |
| `GET`, `PUT`, `PATCH` | 200 |
| `POST` 로 새로 만들 때 (리뷰, 주문, 방문자 세션) | 201. 같은 주문 재전송이면 기존 주문과 함께 200 |
| `POST` 동작 (로그인, 로그아웃, 취소) | 200 |
| `POST /api/reviews` (현재), `POST /api/admin/images` | 200 (지금 그대로) |

### 금액과 시간

- 금액은 원 단위 정수다. 주문 합계처럼 큰 값은 BigInt 로 계산·저장하고 **JSON 응답에서는 십진 문자열**(`"24800"`)로 내려준다. 메뉴 가격(`price`)은 숫자다.
- 시각은 UTC ISO 문자열(`"2026-10-09T05:12:00.000Z"`)이고 화면이 한국 시간으로 보여준다.
- 주문 응답·요청에 쓰는 재전송 식별키는 `Idempotency-Key` 헤더로 보낸다.

### 메뉴 항목 공통 모양 (`ProductSummary`)

목록·음료·메인에서 같은 모양을 쓴다.

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | number \| null | 고객 주소 번호. 음료는 `null` |
| `key` | string | 카탈로그 id (`salad-0`, `drink-1`) |
| `name`, `nameEn` | string, string \| null | 이름, 영문 이름 |
| `price` | number | 원. 음료는 추가 금액 |
| `category` | string | 샐러드는 분류(`든든한 단백질`), 음료는 `음료` |
| `badge` | string | `""`, `BEST`, `NEW`, `PLANT`, `PICK` |
| `status` | string | `active` 또는 `soldout` (숨김·삭제는 응답에 나오지 않는다) |
| `imageUrl` | string | 이미지 주소 |
| `allergens` | string[] | 알레르기 재료 |

재료가 품절이면 그 재료가 들어간 메뉴는 `status` 가 `soldout` 이 되고, 응답에 `soldoutReason`(DB 전환 후 메뉴-재료 연결이 생기면 제공. 예: `["그릴 치킨"]`)을 함께 내려준다 (상세는 `docs/db-design.md` 의 자동 품절).

### 쪽 나눔 응답

```json
{ "items": [], "page": 1, "size": 10, "total": 48 }
```

`page` 는 1 부터, `size` 는 1~50 (기본 10). 관리자 주문 목록은 쪽 번호 대신 마지막으로 본 주문을 기준으로 다음 쪽을 가져온다 (`cursor`, §3). 주문·인증 응답과 고객 API 는 모두 `Cache-Control: no-store`.

## 2. 고객 API

| 요청 메서드 | 요청 경로 | 요청 예시 | 응답 예시 | 구분 |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/home` | (없음) | `{ "hero": { "title": "좋은 하루는, 좋은 한 그릇에서.", "description": "신선한 재료와 기분 좋은 조합." }, "seasonPages": [], "best": [], "latestReviews": [] }` (`best` 는 `ProductSummary[]`, 전체 예시는 §6) | 신규 |
| GET | `/api/v1/products` | `{ category?: String }` (쿼리) | `{ "items": [{ "id": 3, "key": "salad-3", "name": "두부 퀴노아", "nameEn": "Tofu quinoa", "price": 9900, "category": "플랜트 베이스", "badge": "PLANT", "status": "active", "imageUrl": "/images/salad-03-cutout.png", "allergens": ["대두"] }], "categories": ["든든한 단백질", "플랜트 베이스", "새로운 조합", "기타"] }` | 이동 (기존 `GET /api/products` 는 `data/products.ts` 복사본을 읽으므로 이 경로로 대체하고 제거) |
| GET | `/api/v1/drinks` | (없음) | `{ "items": [{ "id": null, "key": "drink-1", "name": "오렌지 주스", "nameEn": null, "price": 4000, "category": "음료", "badge": "", "status": "active", "imageUrl": "/admin-assets/drinks/orange-juice.png", "allergens": [] }] }` | 신규 |
| GET | `/api/v1/products/{id}` | `{ id: Number }` (경로) | `{ "id": 0, "key": "salad-0", "name": "레몬 치킨 아보카도", "price": 10900, "status": "active", "allergens": ["닭고기", "토마토"], "optionGroups": [{ "id": "dressing", "name": "드레싱 선택", "required": true, "multiple": false, "choices": [{ "key": "dressing-0", "name": "레몬 올리브", "price": 0, "available": true, "allergens": [] }] }], "rating": { "average": 4.6, "count": 4 } }` (일부, 전체는 §6) | 이동 (기존 `GET /api/products/{id}` 대체) |
| GET | `/api/v1/products/{id}/reviews` | `{ id: Number }` (경로), `{ page?: Number, size?: Number }` (쿼리) | `{ "items": [{ "id": "s0-0", "productId": 0, "rating": 5, "title": "점심이 기다려지는 조합이에요.", "body": "치킨과 아보카도가 잘 어울려요.", "author": "김**", "date": "2026.10.05", "images": [] }], "page": 1, "size": 10, "total": 4, "rating": { "average": 4.6, "count": 4 } }` | 신규 |
| POST | `/api/v1/products/{id}/reviews` | `{ id: Number }` (경로), `{ id: String, author: String, stars: Number, title: String, text: String }` (본문) | `201` `{ "id": "r-1728460000", "productId": 0, "rating": 5, "title": "맛있어요", "body": "드레싱이 잘 어울려서 또 먹고 싶어요.", "author": "홍길동", "date": "2026.10.09", "images": [] }` | 이동 (아래 `POST /api/reviews` 에서) |
| POST | `/api/reviews` | `{ id: String, pid: Number, author: String, stars: Number, title: String, text: String, via: String }` (본문) | `{ "catalog": { "reviews": [] }, "revision": 8, "updatedAt": "2026-10-09T05:20:00.000Z" }` (카탈로그 전체 중 일부) | 현재 (위로 이동한 뒤에도 한동안 함께 둔다) |
| GET | `/api/v1/reviews` | `{ page?: Number, size?: Number }` (쿼리) | `{ "items": [{ "id": "s0-0", "productId": 0, "rating": 5, "title": "점심이 기다려지는 조합이에요.", "author": "김**", "date": "2026.10.05" }], "page": 1, "size": 10, "total": 48 }` | 신규 |
| GET | `/api/catalog` | (없음) | `{ "catalog": { "products": [], "groups": [], "reviews": [], "content": {} }, "revision": 7, "updatedAt": "2026-10-09T05:12:00.000Z" }` (내용 생략. 숨김·삭제 항목은 비워서 내려간다) | 현재 (화면 자동 갱신용) |

- 리뷰 쓰기의 `id` 는 **중복 전송 방지 키**다. 같은 `id` 를 두 번 보내면 한 번만 저장된다 (지금 `appendCustomerReview` 동작 그대로).
- `pid`(메뉴 번호)는 경로의 `{id}` 로 옮겨진다. `via`(픽업·배달)는 배달로 고정되어 새 경로에서는 받지 않는다 (DB 설계에서도 삭제).

## 3. 주문·인증 API (백엔드 설계안)

백엔드 설계안(PR #45)의 경로다. 주문은 서버가 가격·배달비·판매 상태를 다시 계산하고, 응답이 오기 전에는 화면이 주문 완료를 표시하지 않는다.

| 요청 메서드 | 요청 경로 | 요청 예시 | 응답 예시 | 구분 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/session` | (없음) | `201` `{ "expiresAt": "2026-11-09T05:00:00.000Z" }` (세션 토큰은 쿠키로만 내려가고 본문에는 없다. 이미 유효한 세션 쿠키가 있으면 새로 만들지 않고 같은 형식으로 `200`) | 신규 (설계안) |
| POST | `/api/v1/auth/login` | `{ loginId: String, password: String }` (본문) | `{ "ok": true }` (관리자 세션 쿠키 발급) | 신규 (설계안) |
| POST | `/api/v1/auth/logout` | (없음) | `{ "ok": true }` | 신규 (설계안) |
| GET | `/api/v1/auth/session` | (없음) | `{ "authenticated": true, "expiresAt": "2026-10-10T18:47:44.000Z" }` (관리자 로그인 상태 확인. 로그인하지 않았거나 만료되면 `401`) | 신규 |
| POST | `/api/v1/orders` | `{ Idempotency-Key: String }` (헤더), `{ items: Object[], ordererName: String, phone: String, address: String, addressDetail?: String, desiredDate: String, desiredSlot: String }` (본문) | `201` `{ "id": "7c1d9f64-2b0a-4a56-9f0e-3c1a8e5b2d10", "status": "received", "subtotal": "21800", "deliveryFee": "3000", "total": "24800", "createdAt": "2026-10-09T05:30:00.000Z" }` (같은 키·같은 내용의 재전송은 기존 주문과 함께 `200`) | 신규 (설계안) |
| GET | `/api/v1/orders` | `{ limit?: Number, cursor?: String }` (쿼리, `limit` 기본 20 · 최대 50) | `{ "items": [{ "id": "7c1d9f64-2b0a-4a56-9f0e-3c1a8e5b2d10", "status": "received", "ordererName": "홍길동", "address": "서울 중구 세종대로 110", "addressDetail": "5층", "desiredDate": "2026-10-13", "desiredSlot": "12:00–13:00", "items": [{ "name": "레몬 치킨 아보카도", "options": "레몬 올리브 · 오렌지 주스", "unitPrice": "14900", "quantity": 1 }], "subtotal": "21800", "deliveryFee": "3000", "total": "24800", "createdAt": "2026-10-09T05:30:00.000Z" }], "nextCursor": null }` (이 방문자 세션으로 접수한 주문만 최신순. 항목은 상세 조회와 같은 모양. 세션이 없으면 `401`) | 신규 |
| GET | `/api/v1/orders/{id}` | `{ id: String }` (경로) | `{ "id": "7c1d9f64-2b0a-4a56-9f0e-3c1a8e5b2d10", "status": "received", "ordererName": "홍길동", "address": "서울 중구 세종대로 110", "addressDetail": "5층", "desiredDate": "2026-10-13", "desiredSlot": "12:00–13:00", "items": [{ "name": "레몬 치킨 아보카도", "options": "레몬 올리브 · 오렌지 주스", "unitPrice": "14900", "quantity": 1 }], "subtotal": "21800", "deliveryFee": "3000", "total": "24800", "createdAt": "2026-10-09T05:30:00.000Z" }` (본인 주문만, 그 외는 404) | 신규 (설계안) |
| POST | `/api/v1/orders/{id}/cancel` | `{ id: String }` (경로), `{ reason?: String }` (본문) | `{ "id": "7c1d9f64-2b0a-4a56-9f0e-3c1a8e5b2d10", "status": "canceled", "canceledAt": "2026-10-09T05:40:00.000Z" }` (이미 취소된 주문의 재요청은 현재 결과를 그대로 반환) | 신규 (설계안) |
| GET | `/api/v1/admin/orders` | `{ status?: String, from?: String, to?: String, limit?: Number, cursor?: String }` (쿼리. `from`·`to` 는 접수일 `YYYY-MM-DD`, 한국 시간 기준 양 끝 포함) | `{ "items": [{ "id": "7c1d9f64-2b0a-4a56-9f0e-3c1a8e5b2d10", "status": "received", "version": 1, "ordererName": "홍길동", "desiredDate": "2026-10-13", "desiredSlot": "12:00–13:00", "total": "24800", "createdAt": "2026-10-09T05:30:00.000Z" }], "nextCursor": "eyJjIjoiMjAyNi0xMC0wOVQwNTozMDowMC4wMDBaIiwiaSI6IjdjMWQ5ZjY0In0" }` | 신규 (설계안) |
| GET | `/api/v1/admin/orders/{id}` | `{ id: String }` (경로) | `{ "id": "7c1d9f64-2b0a-4a56-9f0e-3c1a8e5b2d10", "status": "confirmed", "version": 2, "ordererName": "홍길동", "phone": "010-1234-5678", "address": "서울 중구 세종대로 110", "addressDetail": "5층", "desiredDate": "2026-10-13", "desiredSlot": "12:00–13:00", "items": [{ "name": "레몬 치킨 아보카도", "options": "레몬 올리브 · 오렌지 주스", "unitPrice": "14900", "quantity": 1 }], "subtotal": "21800", "deliveryFee": "3000", "total": "24800", "createdAt": "2026-10-09T05:30:00.000Z", "cancelReason": null, "canceledAt": null, "history": [{ "fromStatus": null, "toStatus": "received", "changedBy": "customer", "reason": null, "createdAt": "2026-10-09T05:30:00.000Z" }, { "fromStatus": "received", "toStatus": "confirmed", "changedBy": "admin", "reason": null, "createdAt": "2026-10-09T05:35:00.000Z" }] }` (연락처·처리 이력은 관리자 상세에만 포함. 없는 주문은 `404`) | 신규 |
| PATCH | `/api/v1/admin/orders/{id}/status` | `{ id: String }` (경로), `{ status: String, version: Number, reason?: String }` (본문) | `{ "id": "7c1d9f64-2b0a-4a56-9f0e-3c1a8e5b2d10", "status": "confirmed", "version": 2 }` (`version` 이 다르면 409) | 신규 (설계안) |

- **주문 상태**: `received`(접수) → `confirmed`(확인) → `preparing`(준비 중) → `delivering`(배달 중) → `completed`(완료). 취소(`canceled`)는 접수·확인에서만, 완료·취소 주문은 더 바꿀 수 없다. 허용되지 않은 순서는 409.
- **주문 항목** `items` 의 한 줄은 아래 세 가지 중 하나다. 가격은 보내지 않는다. 서버가 카탈로그에서 계산한다.

  | 종류 | 모양 | 한 개 가격 |
  | --- | --- | --- |
  | 메뉴 | `{ productId: Number, dressingKey?: String, drinkKeys?: String[], quantity: Number }` | 메뉴 가격 + 드레싱 + 음료 |
  | 관리자 정의 옵션 메뉴 | `{ productId: Number, optionSelections: { [groupId]: String[] }, quantity: Number }` (기존 드레싱·음료 필드와 혼용 불가) | 메뉴 가격 + 연결된 모든 선택 옵션, 필수·단일/다중·판매 상태 검증 |
  | 내 취향 볼 | `{ ingredientKeys: String[], dressingKey?: String, quantity: Number }` (음료 불가) | 기본 볼 6,500원 + 고른 재료 + 드레싱 (화면의 `bowlPrice` 와 같다) |
  | 음료 단품 | `{ drinkKeys: [String], quantity: Number }` (음료 1개, 드레싱 불가) | 음료 가격 |

- **서버가 확인하는 것**: 판매 중인 메뉴·옵션·재료인지(숨김·삭제는 존재하지 않는 값으로 보고 400, 품절은 품절 안내와 함께 400), 필수 드레싱 선택, 같은 음료·재료의 중복, 수량 1~99, 연락처 형식, 받을 날짜가 오늘부터 14일 이내이고 받을 시간대가 운영시간(지금은 매일 10:00–21:00) 안의 한 시간 단위이며 지금부터 30분 이후에 시작하는지(한국 시간 기준, 화면과 같은 규칙이고 `desiredSlot` 은 화면이 만드는 `10:00–11:00` 표기여야 한다. 위반하면 `"받을 날짜를 다시 선택해주세요."` 또는 `"받을 시간대를 다시 선택해주세요."`), 최소 주문 금액 15,000원. 배달비는 상품 합계 30,000원 미만이면 3,000원, 이상이면 무료다.
- **관리자 취소**: 별도 경로 없이 `PATCH /api/v1/admin/orders/{id}/status` 에 `{ status: "canceled", version, reason }` 을 보낸다. 사유·취소 시각·변경자가 이력에 남는다. 고객 취소(`/cancel`)는 접수·확인 상태에서만 가능하고, 관리자가 그 사이 상태를 바꿔 충돌하면 최신 상태를 다시 읽어 판단한다.
- **재전송**: 통신 실패 후 다시 보낼 때 같은 `Idempotency-Key` 를 쓴다. 같은 내용이면 기존 주문을, 다른 내용이면 409 를 돌려준다.
- **조회 권한**: 주문 번호만으로는 다른 사람의 주문·연락처·주소를 볼 수 없다. 연락처·주소는 허용된 상세 응답에만 포함한다.
- 설계안의 경로 목록에 없는 **관리자 주문 상세**(`GET /api/v1/admin/orders/{id}`)와 목록의 **접수일 범위**(`from`·`to`)는 요구사항 BE-05 의 "관리자는 기간·상태별 목록과 상세를 조회한다"에 맞춰 추가했다. 고객의 **내 주문 목록**(`GET /api/v1/orders`)은 마이페이지 주문 내역에 필요해서 추가했다.
- 고객 계정(회원)·결제는 설계안의 범위 밖이라 이 표에 없다.

## 4. 관리자 API

| 요청 메서드 | 요청 경로 | 요청 예시 | 응답 예시 | 구분 |
| --- | --- | --- | --- | --- |
| GET | `/api/admin/catalog` | (없음) | `{ "catalog": { "products": [{ "id": "salad-0", "customerId": 0, "type": "salad", "name": "레몬 치킨 아보카도", "price": 10900, "status": "active", "badge": "BEST" }], "groups": [], "reviews": [], "content": {} }, "revision": 7, "updatedAt": "2026-10-09T05:12:00.000Z" }` (일부) | 현재 |
| PUT | `/api/admin/catalog` | `{ catalog: Object, revision: Number }` (본문) | `{ "catalog": {}, "revision": 8, "updatedAt": "2026-10-09T05:20:00.000Z" }` (`revision` 이 다르면 409) | 현재 |
| PATCH | `/api/v1/admin/products/{key}` | `{ key: String }` (경로), `{ name?: String, description?: String, price?: Number, status?: String, badge?: String, category?: String, allergens?: String }` (본문, 보낸 항목만 수정) | `{ "id": "salad-0", "customerId": 0, "type": "salad", "name": "레몬 치킨 아보카도", "price": 11900, "status": "soldout", "badge": "BEST" }` (일부) | 이동 (기존 `PATCH /api/admin/products/{id}` 는 `data/products.ts` 복사본을 수정하므로 대체하고 제거) |
| POST | `/api/admin/images` | `multipart/form-data` `{ file: File }` (PNG·JPEG·WebP, 5MB 이하) | `{ "url": "/api/admin/images/3f1c9a52-8b1e-4c52-9d0f-2b6f5a7c1e90.png" }` | 현재 |
| GET | `/api/admin/images/{key}` | `{ key: String }` (경로) | 이미지 파일 (`Content-Type: image/png`) | 현재 |

관리자 주문 API 는 §3 에 있다. `PATCH` 로 수정할 수 있는 상품 항목: `name`, `description`, `price`, `status`, `badge`, `category`, `allergens`.

## 5. API 별 에러 응답 예시

아래는 §1 의 설계 포맷(`status`, `message`)으로 적은 예시다.

| 요청 메서드 | 요청 경로 | 요청 예시 | 응답 예시 |
| --- | --- | --- | --- |
| GET | `/api/v1/products` | `?category=없는분류` | `{ "status": 400, "message": "알 수 없는 분류입니다: 없는분류" }` |
| GET | `/api/v1/products/{id}` | `/api/v1/products/99` | `{ "status": 404, "message": "상품을 찾을 수 없습니다." }` |
| GET | `/api/v1/products/{id}/reviews` | `?size=0` | `{ "status": 400, "message": "page 는 1 이상, size 는 1~50 사이의 정수여야 합니다." }` |
| POST | `/api/v1/products/{id}/reviews` | `{ "title": "a" }` | `{ "status": 400, "message": "리뷰 내용을 확인해주세요." }` |
| POST | `/api/v1/auth/login` | 틀린 비밀번호 | `{ "status": 401, "message": "아이디 혹은 패스워드가 다릅니다" }` |
| POST | `/api/v1/orders` | 품절된 메뉴 | `{ "status": 400, "message": "품절된 메뉴가 있습니다: 레몬 치킨 아보카도" }` |
| POST | `/api/v1/orders` | 같은 `Idempotency-Key` 로 다른 내용 | `{ "status": 409, "message": "같은 요청 번호로 다른 내용의 주문이 이미 있습니다." }` |
| GET | `/api/v1/orders/{id}` | 다른 사람의 주문 번호 | `{ "status": 404, "message": "주문을 찾을 수 없습니다." }` |
| POST | `/api/v1/orders/{id}/cancel` | 준비 중인 주문 | `{ "status": 409, "message": "준비가 시작된 주문은 취소할 수 없습니다." }` |
| PATCH | `/api/v1/admin/orders/{id}/status` | 오래된 `version` | `{ "status": 409, "message": "다른 관리자가 먼저 변경했습니다. 새로 고친 뒤 다시 시도해주세요." }` |
| POST | `/api/v1/orders` | 이미 시작된 시간대 | `{ "status": 400, "message": "받을 시간대를 다시 선택해주세요." }` |
| GET | `/api/v1/admin/orders` | `from` 이 `to` 보다 늦음 | `{ "status": 400, "message": "조회 기간을 확인해주세요." }` |
| GET | `/api/v1/admin/orders/{id}` | 로그인하지 않음 | `{ "status": 401, "message": "로그인이 필요합니다." }` |
| GET | `/api/v1/admin/orders` | 로그인하지 않음 | `{ "status": 401, "message": "로그인이 필요합니다." }` |
| PUT | `/api/admin/catalog` | `revision` 이 오래된 값 | `{ "status": 409, "message": "다른 화면에서 데이터가 변경되었습니다. 최신 내용을 불러온 뒤 다시 저장해주세요." }` |
| PATCH | `/api/v1/admin/products/{key}` | `{ "price": -5 }` | `{ "status": 400, "message": "price 는 0 이상이어야 합니다." }` |
| PATCH | `/api/v1/admin/products/{key}` | 다른 사이트에서 보낸 요청 | `{ "status": 403, "message": "허용되지 않은 요청입니다." }` |
| POST | `/api/admin/images` | 6MB 파일 | `{ "status": 413, "message": "이미지는 5MB 이하로 올려주세요." }` |

## 6. 요청 값 예시와 긴 응답 전체 예시

### 요청 값 예시

| 요청 | 값을 넣은 예 |
| --- | --- |
| `GET /api/v1/products` | `/api/v1/products?category=플랜트 베이스` |
| `GET /api/v1/products/{id}` | `/api/v1/products/0` |
| `GET /api/v1/products/{id}/reviews` | `/api/v1/products/0/reviews?page=1&size=10` |
| `GET /api/v1/admin/orders` | `/api/v1/admin/orders?status=received&limit=20` |
| `GET /api/admin/images/{key}` | `/api/admin/images/3f1c9a52-8b1e-4c52-9d0f-2b6f5a7c1e90.png` |

`POST /api/v1/orders` 헤더와 본문 (가격은 보내지 않는다):

```json
{
  "Idempotency-Key": "order-20261009-0001",
  "items": [
    { "productId": 0, "dressingKey": "dressing-0", "drinkKeys": ["drink-1"], "quantity": 1 },
    { "productId": 3, "dressingKey": "dressing-2", "drinkKeys": [], "quantity": 1 }
  ],
  "ordererName": "홍길동",
  "phone": "010-0000-0000",
  "address": "서울 중구 세종대로 110",
  "addressDetail": "5층",
  "desiredDate": "2026-10-13",
  "desiredSlot": "12:00–13:00"
}
```

`PATCH /api/v1/admin/orders/{id}/status` 본문:

```json
{ "status": "confirmed", "version": 1 }
```

`POST /api/v1/products/{id}/reviews` 본문:

```json
{ "id": "r-1728460000", "author": "홍길동", "stars": 5, "title": "맛있어요", "text": "드레싱이 잘 어울려서 또 먹고 싶어요." }
```

`PATCH /api/v1/admin/products/salad-0` 본문 (보낸 항목만 바뀐다):

```json
{ "price": 11900, "status": "soldout" }
```

`PUT /api/admin/catalog` 본문 (내용 생략, `revision` 은 직전에 받은 값):

```json
{ "catalog": { "products": [], "groups": [], "content": {} }, "revision": 7 }
```

`POST /api/v1/auth/login` 본문:

```json
{ "loginId": "admin", "password": "비밀번호" }
```

### `GET /api/v1/products/0` 전체 응답

```json
{
  "id": 0,
  "key": "salad-0",
  "name": "레몬 치킨 아보카도",
  "nameEn": "Lemon chicken avocado",
  "price": 10900,
  "category": "든든한 단백질",
  "badge": "BEST",
  "status": "active",
  "imageUrl": "/images/salad-00-cutout.png",
  "allergens": ["닭고기", "토마토"],
  "description": "그릴 치킨, 잘 익은 아보카도, 상큼한 레몬의 조합",
  "ingredients": "로메인 · 치킨 · 아보카도 · 퀴노아 · 토마토",
  "optionGroups": [
    {
      "id": "dressing",
      "name": "드레싱 선택",
      "required": true,
      "multiple": false,
      "choices": [
        { "key": "dressing-0", "name": "레몬 올리브", "price": 0, "available": true, "allergens": [] },
        { "key": "dressing-3", "name": "시저", "price": 0, "available": true, "allergens": ["우유", "계란", "생선"] }
      ]
    },
    {
      "id": "drinks",
      "name": "음료 추가",
      "required": false,
      "multiple": true,
      "choices": [
        { "key": "drink-1", "name": "오렌지 주스", "price": 4000, "available": true, "allergens": [] }
      ]
    }
  ],
  "rating": { "average": 4.6, "count": 4 }
}
```

### `GET /api/v1/home` 전체 응답

```json
{
  "hero": { "title": "좋은 하루는, 좋은 한 그릇에서.", "description": "신선한 재료와 기분 좋은 조합. 오늘의 나를 위한 샐러드를 만나보세요." },
  "seasonPages": [
    { "title": "조금 새로운 조합, 꽤 괜찮은 발견.", "description": "크리미한 부라타와 산뜻한 토마토.", "image": "/images/salad-09-cutout.png", "productId": 9 }
  ],
  "best": [
    { "id": 0, "key": "salad-0", "name": "레몬 치킨 아보카도", "nameEn": "Lemon chicken avocado", "price": 10900, "category": "든든한 단백질", "badge": "BEST", "status": "active", "imageUrl": "/images/salad-00-cutout.png", "allergens": ["닭고기", "토마토"] }
  ],
  "latestReviews": [
    { "id": "s0-0", "productId": 0, "rating": 5, "title": "점심이 기다려지는 조합이에요.", "body": "치킨과 아보카도가 잘 어울려요.", "author": "김**", "date": "2026.10.05", "images": [] }
  ]
}
```

## 7. 정해 두고 쓰는 것

설계안(`/api/v1`, 주문·인증 경로)을 기준으로 아래처럼 정리했다. 바꾸고 싶은 항목이 있으면 이 표를 고친다.

| # | 항목 | 이 문서의 선택 |
| --- | --- | --- |
| 1 | 음료 경로 | `GET /api/v1/drinks` 로 분리 (페이지 `/menu`, `/drinks` 와 1:1) |
| 2 | 리뷰 쓰기 주소 | `POST /api/v1/products/{id}/reviews` (`pid` 가 경로로 이동). 기존 `POST /api/reviews` 는 한동안 함께 둔다 |
| 3 | `/api/v1/home` | 두고, `/api/catalog` 는 자동 갱신용으로 유지 |
| 4 | 에러 필드 | `{ status, message }` (이 문서) |

- 2번은 화면(`ReviewsProvider`)의 호출 주소를 바꿔야 하고 리뷰 사진 PR(#28)이 같은 파일을 수정 중이라 **그 PR 머지 후에** 옮긴다.
- 이 문서의 `ProductSummary` 에는 `type` 이 없다 (경로로 구분하므로). 구현 초안(#39)은 `type` 을 포함하고 `/api/v1` 이 아니므로 설계안 구조(`modules/`)로 다시 만든다.
- 주문·인증 API(`/api/v1/session`, `auth`, `orders`, `admin/orders`)는 `feat/orders-core` 에서 **메모리 저장소로 먼저 구현**했다. 서버를 다시 시작하면 주문·세션이 사라지며, DB(Prisma)가 준비되면 저장소 계약(`modules/orders/repository.ts`)만 바꿔 끼운다.
- 관리자 주문 API 는 임시 계정(환경변수 `ADMIN_LOGIN_ID`, `ADMIN_PASSWORD`)으로 로그인한다. 설정하지 않으면 로그인할 수 없다.
