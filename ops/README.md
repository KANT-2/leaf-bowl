# 개발 MCP CI/CD

GitHub Actions의 `Frontend CI`는 PR과 `main`·`production` push에서 의존성 설치,
린트, 빌드, 타입 검사를 수행한다. 개발 MCP의 두 앱은 각각 해당 브랜치의 최신
커밋에 대한 CI 성공을 확인하고, 검증된 Next.js 서버 버전으로 자동 교체한다.

| 환경 | 브랜치 | 앱 이름 | 포트 | 공개 범위 |
| --- | --- | --- | --- | --- |
| 검증 | `main` | `kant2-front5-staging` | 3100 | 본인·관리자 |
| 운영 | `production` | `kant2-front5-production` | 3200 | 링크 공개 |

개발 MCP `app_deploy`가 발급한 독립 HTTPS 도메인:

- 검증: https://kant2-front5-staging.dev.crasnec.com
- 운영: https://kant2-front5-production.dev.crasnec.com

개발 MCP 프로젝트 이름은 `front-5-cicd`이다. 기존 브랜치 보호와 Hotfix의 리뷰 승인
예외는 유지하며, Hotfix도 CI 성공 후에 배포한다. PR 브랜치 자체는 자동 배포하지 않는다.

## 동작

1. 앱 프로세스가 60초마다 해당 브랜치의 최신 커밋을 가져온다.
2. 해당 SHA·브랜치의 최신 `Frontend CI` push 실행이 완료·성공 상태인지 확인한다.
   PR 실행, 다른 워크플로, 다른 SHA의 성공은 배포 근거로 사용하지 않는다.
3. 커밋별 별도 디렉터리에서 `npm ci`와 `npm run build`를 수행한다.
4. 임시 로컬 포트에서 서버를 실행해 `/` 응답이 HTTP 200인지 확인한다.
5. 빌드 중 브랜치가 더 진행됐거나 최신 CI가 더 이상 성공 상태가 아니라면 해당 후보는 배포하지 않는다.
6. 기존 서버를 종료하고 새 서버를 시작한다. 시작 후 HTTP 확인이 실패하면 이전 버전을 복구한다.
7. 배포한 SHA·CI 실행 URL과 상태를 저장한다. 서버 종료는 마지막 검증 버전으로 재시작한다.

GitHub API는 새 커밋을 기다릴 때 최소 180초 간격으로 조회하며, 인증 토큰 없이 공개
저장소를 읽는다. CI/API/빌드/후보 HTTP 확인 오류가 발생하면 기존 서버를 유지하고 재시도한다.
버전 교체에는 짧은 서버 재시작 시간이 발생할 수 있다.

## 처음 준비·실행

개발 MCP의 등록 프로젝트에서 아래 명령으로 초기 릴리스를 준비한다.

```sh
python3 ops/mcp_cicd.py --branch main --port 3100 --prepare-only
python3 ops/mcp_cicd.py --branch production --port 3200 --prepare-only
```

개발 MCP `app_deploy`에 지정할 명령:

```sh
# 검증: visibility=private, port=3100
python3 ops/mcp_cicd.py --branch main --port 3100

# 운영: visibility=public, port=3200
python3 ops/mcp_cicd.py --branch production --port 3200
```

같은 브랜치에는 supervisor 하나만 실행할 수 있다. 종료 시 하위 Next.js 프로세스도 종료한다.
Python 3.12 이상, Linux, Git, Node.js 22, npm과 GitHub/npm/Google Fonts 네트워크 접근이 필요하다.
배포는 개발 MCP 앱 프로세스가 실행되는 동안 자동 동작한다. 실행 환경이 재생성되면
이 문서의 준비·앱 배포 절차로 복원한다.

## 상태·로그·운영

- 배포 상태: `.deploy/<브랜치>/state.json`
- 빌드 로그: `.deploy/<브랜치>/logs/build-<SHA>.log`
- 서버 로그: `.deploy/<브랜치>/logs/server.log`
- 빌드 결과: `.deploy/<브랜치>/releases/<SHA>/`
- 배포 프로세스 로그: 개발 MCP `process_logs`
- 상태·캐시·로그는 Git에 커밋하지 않는다. 이전 정상 릴리스는 복구를 위해 보관한다.

두 앱의 서버 응답은 각각 `http://127.0.0.1:3100/`, `http://127.0.0.1:3200/`에서 확인한다.
내부 응답은 정상인데 외부 HTTPS 연결이 시간 초과되면, DNS 해석과 MCP 호스트의
외부 443 연결·게이트웨이 경로를 확인한다. 검증 앱의 외부 접근에는 계정 인증이 필요하다.

앱 기능 장애를 되돌릴 때는 기존 운영 규칙대로 되돌림 PR을 대상 브랜치에 병합한다.
해당 커밋의 CI가 통과하면 자동 배포된다. 스크립트 수정은 작업 브랜치와 리뷰 PR로 관리하고,
병합 후 개발 MCP 작업 디렉터리의 운영 스크립트를 갱신하고 앱을 재배포한다.

빌드·후보·운영 Next.js 프로세스에 `TZ=UTC`를 주입한다. 배포 로그와 상태의 시각은 UTC `Z`로 기록한다. 화면 날짜·시간은 공통 변환으로 KST를 표시하며, 브라우저 시스템 시간대에 의존하지 않는다.

PostgreSQL 저장을 사용하는 버전은 배포 전에 환경별 DB에 migration과 import/seed를 실행하고,
supervisor 프로세스에 `DATABASE_URL`, 고정된 `ADMIN_DATA_DIR`, 실제 HTTPS 주소인 `APP_ORIGIN`을 주입해야 한다.
`APP_ORIGIN`은 TLS 프록시 뒤에서 로그인·주문 등 쓰기 API의 출처 확인에 사용한다.
릴리스 안의 `.env.local` 대신 supervisor 환경을 사용한다. 상세 절차는
[PostgreSQL 실행과 이관](../docs/postgres.md)을 따른다.

환경별 변수를 추가할 때는 앱별 프로세스의 환경으로 주입하고,
`NEXT_PUBLIC_*`는 빌드에 포함되므로 기존 같은-SHA 빌드 캐시를 사용하지 않도록
앱을 중지한 상태에서 해당 환경의 생성된 릴리스 디렉터리를 정리한 뒤 다시 준비한다.
GitHub 워크플로를 재생성해 ID가 바뀌면 스크립트의 `WORKFLOW_ID`도 갱신한다.

## 검증

```sh
python3 -m unittest discover -s ops -p 'test_*.py' -v
```

CI 실패·대기, 다른 브랜치/워크플로/PR 성공 배제, 빌드·후보 HTTP 오류 시 기존 버전 유지,
배포 중 최신 커밋 변경 시 교체 취소, 시작 실패 시 이전 서버·상태 복구를 검증한다.
