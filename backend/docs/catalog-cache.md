# 메뉴 검색 결과 캐시

이슈 #208. 공개 메뉴 API `GET /api/v1/menus`의 성공한 목록·검색 결과만 캐시한다.

## 구조와 일관성

요청마다 DB에서 `SELECT revision FROM catalog_meta WHERE id = 1 FOR SHARE`를 실행한다. 관리자 카탈로그 수정은 기존 `FOR UPDATE` 잠금과 revision 증가를 사용한다. 같은 행의 공유 잠금을 보유한 동안 분류·알레르기 검증과 상품 조회를 수행하므로 revision과 검색 결과가 서로 다른 수정 시점을 가리키지 않는다.

캐시 키는 revision, 검색어, 분류, 최소·최대 가격, 제외 알레르기 집합, 정렬, 페이지, 페이지 크기다. 제외 알레르기는 중복과 순서만 정규화한다. 관리자가 수정하고 커밋하면 다음 요청은 새 revision을 읽어 과거 키를 사용하지 않는다. TTL 만료를 기다리지 않는다.

캐시 HIT에서도 revision을 읽는 DB 왕복이 필요하다. 이전 revision에 대한 요청이 이미 진행 중이었다면 그 요청은 이전 결과를 반환할 수 있다. 관리자 커밋 후 시작한 새 요청이 최신 값을 사용하는 것이 보장 범위다. DB에서 revision 갱신 없이 직접 수정한 값이나 이미 브라우저에 표시된 화면의 자동 갱신은 이 캐시가 보장하지 않는다.

## 보관 범위

- 앱 인스턴스별 메모리 캐시. 기본 TTL 60초, 최대 256개, LRU 제거
- 같은 키의 동시 요청은 하나의 성공한 로더 결과를 공유한다. 다른 키의 조회는 서로 막지 않는다.
- Product는 불변이고, 목록은 반환할 때 새로 복사해 호출자의 변경이 캐시를 오염시키지 않는다.
- 예외·취소·400·422 응답은 저장하지 않는다.
- 인증·회원·블랙리스트에는 캐시를 적용하지 않는다. 메뉴 캐시는 인증 객체·JWT·회원 ID를 키나 값으로 받지 않는다.
- 프로세스가 여러 개면 각자 캐시를 보유하지만 모든 요청이 DB revision을 확인한다. 앱 프로세스 재시작 시 메모리 캐시는 비워진다.

## 설정

```dotenv
CATALOG_CACHE_ENABLED=true
CATALOG_CACHE_TTL_SECONDS=60
CATALOG_CACHE_MAX_ENTRIES=256
```

비활성화하면 기존 DB 조회 경로를 사용하고 revision 추가 조회도 생략한다. 설정 변경은 서버 재시작 후 반영된다. 최대 TTL은 3600초, 최대 엔트리 수는 4096개다.

## 응답 진단

성공한 메뉴 JSON의 기존 필드는 유지한다.

- `X-Catalog-Cache`: `MISS` / `HIT` / `BYPASS`
- `X-Catalog-Revision`: 캐시 활성화 시 해당 응답에 사용한 revision
- `Cache-Control: no-store`: 브라우저·CDN 대신 서버에서 매번 revision을 확인하도록 한다.

## 검증 결과와 남은 확인

main `70e8b76`을 반영해 캐시를 적용한 후 백엔드 전체 검사: **475 passed, 17 skipped**. Ruff 검사와 서식 검사가 통과했다. 건너뛴 항목은 전용 `TEST_DATABASE_URL`이 필요한 기존 PostgreSQL 통합 검사다. 인증·블랙리스트 회귀는 메뉴 캐시를 켠 상태에서 회원 조회 후 로그아웃하고 같은 토큰이 즉시 401이 되는 경로를 포함한다.

관리자 상품 수정과 복구를 실제 DB에서 확인했다. 수정 전 이름·revision `3`·HIT를 기록한 뒤 관리자 화면에서 상품 이름을 바꾸자 첫 요청에서 새 이름·revision `4`·MISS가 반환됐고 검증 스크립트가 통과했다. 원래 이름으로 저장해 복구했을 때에도 첫 응답에서 원래 이름·revision `5`·MISS를 반환했다. 복구용 JSON의 `passed: false`는 검증 스크립트가 전후 값의 차이를 필수로 검사하기 때문에 같은 원래 이름을 확인할 때 생긴 false negative다. 응답값과 revision 변경으로 복구를 확인했다. 증거는 `catalog-cache-invalidation-before.json`, `catalog-cache-invalidation-after.json`, `catalog-cache-invalidation-restored.json`에 있다.

## 성능 측정

같은 코드·DB·URL에서 서버를 캐시 OFF로 실행하고 `before`를 수집한 뒤, 서버를 캐시 ON으로 다시 실행해 `after`를 수집한다. 두 측정 사이에 코드·상품을 변경하지 않는다. 설정은 서버를 실행한 터미널에서 변경하고 서버를 재시작해야 적용된다.

```powershell
.\.venv\Scripts\python.exe scripts/benchmark_catalog.py measure --label before --samples 30 --output docs/catalog-cache-live-before-off.json
# 서버를 CATALOG_CACHE_ENABLED=true로 재시작한 다음 실행
.\.venv\Scripts\python.exe scripts/benchmark_catalog.py measure --label after --samples 30 --require-hit --output docs/catalog-cache-live-after-on.json
.\.venv\Scripts\python.exe scripts/benchmark_catalog.py compare --before docs/catalog-cache-live-before-off.json --after docs/catalog-cache-live-after-on.json --output docs/catalog-cache-live-comparison.md
```

같은 조건·응답 본문·요청 수·URL일 때만 비교한다. 상품이 바뀌거나 출력 파일이 이미 존재하면 중단한다. 재측정은 다른 파일 이름을 사용한다. 이전 `7f4df55` 예비 측정은 참고 자료이며 최신 main 설치 후의 측정을 대신하지 않는다.

2026-10-26 로컬 측정에서는 각 조건을 2회 워밍업한 뒤 30회 기록했다. OFF 표본 90개는 모두 `BYPASS`, ON 표본 90개는 모두 `HIT`였고, 사례별 요청 조건과 응답 본문 SHA-256이 일치했다. 적용 전/후 중앙값은 메뉴 목록 34.670/33.037ms(-4.7%), 검색어·알레르기 36.263/31.903ms(-12.0%), 분류·가격 34.794/32.191ms(-7.5%)였다. 평균은 각각 31.337/32.372ms, 36.530/31.796ms, 35.289/31.898ms였다. 전체 표와 p95는 `catalog-cache-live-comparison.md`에 있다. 로컬 순차 측정이며 운영 성능을 보장하지 않는다.

## 관리자 수정 직후 반영 확인

검증 서버는 TTL을 3600초로 실행해 확인 도중 자연 만료되는 상황과 구분한다. 기존 서버를 Ctrl+C로 멈춘 뒤 해당 터미널에서 실행한다.

```powershell
$env:CATALOG_CACHE_ENABLED = 'true'
$env:CATALOG_CACHE_TTL_SECONDS = '3600'
.\.venv\Scripts\python.exe -m uvicorn main:app --app-dir src --reload
```

다른 터미널에서 수정 전 상품을 기록한다. `capture`는 같은 요청을 두 번 호출해 동일 결과의 HIT까지 확인한다.

```powershell
.\.venv\Scripts\python.exe scripts/benchmark_catalog.py capture --key salad-0 --output docs/catalog-cache-invalidation-before.json
```

관리자 화면에서 `salad-0`의 이름을 `레몬 치킨 아보카도 (캐시검증)`으로 바꾸고 저장 성공을 확인한다. 그다음 아래 명령으로 **첫 요청 하나**를 검사한다.

```powershell
.\.venv\Scripts\python.exe scripts/benchmark_catalog.py verify --before docs/catalog-cache-invalidation-before.json --field name --expect '레몬 치킨 아보카도 (캐시검증)' --ttl-seconds 3600 --output docs/catalog-cache-invalidation-after.json
```

통과 조건은 revision 변경, 기대한 새 값, 기록 후 3600초 이내다. 새 값이 나올 때까지 재시도하지 않는다. 결과 JSON의 `passed`, `within_ttl`, `before_revision`, `after_revision`, 상품 값을 증거로 남긴다. 검증 후 관리자 화면에서 원래 이름으로 복구하고 TTL을 60초로 되돌려 서버를 재시작했다.

## 참고

- PostgreSQL 17 행 잠금: https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS
- 로컬 HTTP 순차 측정은 운영 부하·동시 사용자의 지연시간을 보장하지 않는다. 네트워크와 DB 상태에 따른 변동이 있으므로 원본 표본을 함께 보관한다.
