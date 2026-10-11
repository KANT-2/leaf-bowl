# 시간 처리 규칙

- 모든 절대 시각은 UTC로 저장·응답한다. JSON 문자열은 `YYYY-MM-DDTHH:mm:ss.sssZ`를 사용한다. Date와 epoch milliseconds도 같은 UTC 절대 시각을 나타낸다.
- 고객·관리자·미리보기의 날짜와 시간은 KST(UTC+09:00)로 표시한다. 오늘, 예약 범위, 매출 집계 기간도 KST 달력 기준으로 계산한다.
- 날짜만 있는 달력 값, 운영 시간, 표시 레이블은 절대 시각이 아니므로 KST 의미를 유지한다. HTTP 쿠키 만료 시각은 표준 GMT 형식이다.
- 공통 구현은 `public/customer-preview/time.js`, TypeScript 진입점은 `lib/time.ts`이다. 서버·React·독립 미리보기가 같은 함수를 사용한다. 새 표시·입력 처리에서 시스템 로컬 날짜 getter나 시간대 없는 Date.parse를 사용하지 않는다.
- 배송 API는 UTC Z 시작·종료를 받는다. 기존 KST 날짜/슬롯 쌍은 UTC로 변환해 호환한다. 다른 시각 입력은 명시적 오프셋을 UTC Z로 정규화하며, 시간대 없는 입력과 잘못된 달력 날짜를 거부한다.
- 기존 카탈로그는 읽기 시 schema 4로 이관하며 이전 버전의 백업을 보관한다. 리뷰 시각을 UTC로, 표시 날짜를 KST로 정규화하고 삭제 ID·고객 상품 번호를 유지한다. 날짜만 있는 과거 리뷰는 기존 예시 데이터와 같은 KST 정오로 해석한다. 해석할 수 없는 과거 날짜 레이블은 원문을 보존한다.
- 브라우저의 과거 배송 기록과 레시피 시각은 읽기 시 변환하고 이후 저장에 UTC를 사용한다. 로컬 리뷰 epoch는 유지하되 표시용 날짜를 KST로 다시 계산한다.
- CI와 배포 스크립트의 Next.js 하위 프로세스는 `TZ=UTC`를 사용한다. 배포 로그·상태는 UTC Z로 기록한다. 운영 스크립트 적용은 PR 병합 후 `ops/README.md` 절차를 따른다.

검증: `npm test`, `python3 -m unittest discover -s ops -p 'test_*.py' -v`, `tests/README.md`의 세 시간대 브라우저 시나리오.
