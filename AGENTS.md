<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 저장소 작업 지침

## 합의된 브랜치 전략

`main`은 개발 결과 통합·검증, `production`은 운영 배포 기준으로 사용한다.
기본적으로 `develop` 없이 운영하며, 작업은 개별 브랜치에서 수행하고 PR로 병합한다.

| 브랜치 | 역할 | 분기 기준 | PR 대상 |
| --- | --- | --- | --- |
| `main` | 개발 결과 통합·검증 | — | `production` |
| `production` | 운영 배포 기준 | — | 배포·긴급 수정 후 `main`에 동기화 |
| `feat/이슈번호-기능명` | 기능 개발 | `main` | `main` |
| `fix/이슈번호-수정명` | 일반 버그 수정 | `main` | `main` |
| `chore/이슈번호-작업명` | 설정·문서·의존성 변경 | `main` | `main` |
| `hotfix/이슈번호-수정명` | 운영 긴급 수정 | `production` | `production` |

작업 브랜치 이름은 위 형식을 권장하되 강제하지 않는다. GitHub 규칙이나 CI로
작업 브랜치의 이름·접두사·이슈 번호를 검증하지 않는다.

### 일반 개발·배포 흐름

1. 최신 `main`에서 작업 브랜치를 생성한다. 예: `feat/12-login`.
2. 하나의 변경 단위로 작업하고 `main`을 대상으로 PR을 생성한다.
3. 리뷰와 CI를 통과하면 **Squash merge**하고 작업 브랜치를 삭제한다.
4. 배포할 변경이 모두 검증되면 `main → production` 배포 PR을 생성한다.
5. 배포 PR은 **Merge commit**으로 병합하고 운영 배포한다.
6. 배포 성공 후 해당 운영 커밋에 `v0.1.0` 같은 버전 태그를 붙인다.
7. 관리자가 `production → main` 동기화 PR에서 `main`의 병합 방식 규칙만 우회하여
   **Merge commit**으로 병합해 배포 이력을 맞춘다. 일반 배포 동기화의 리뷰 승인은 유지한다.

배포 시점의 `main` 전체가 배포 대상이다. 배포 검증 중에도 다음 기능 개발을
계속해야 할 때 `release/*` 도입을 검토한다.

### 운영 긴급 수정 흐름

1. 최신 `production`에서 `hotfix/*` 브랜치를 생성한다.
2. 수정·검증 후 `production` 대상으로 PR을 생성하고 **Merge commit**으로 병합한다.
   관리자는 CI 통과 후 리뷰 승인 없이 리뷰 규칙만 우회하여 즉시 병합할 수 있으며,
   이후 운영 배포한다.
3. 배포 성공 후 새 버전 태그를 붙인다.
4. 즉시 관리자가 `production → main` 동기화 PR에서 `main`의 병합 방식 규칙만 우회하여
   **Merge commit**으로 병합한다. 해당 Hotfix 동기화 PR에도 동일한 리뷰 승인 예외를 적용한다.

`main`과 `production` 사이의 병합은 항상 **Merge commit**을 사용한다.

### PR·브랜치 보호 규칙

- `main`, `production`에는 직접 push하거나 force push하지 않으며, 브랜치를 삭제하지 않는다.
- 일반 PR은 작성자 외 최소 1명의 승인, 리뷰 대화 해결, CI 통과를 병합 조건으로 한다.
- Hotfix와 해당 동기화 PR은 리뷰 승인 없이 병합할 수 있다. CI와 리뷰 대화 해결 조건은 유지한다.
- PR에는 변경 이유, 관련 이슈, 확인 방법을 작성한다. UI 변경에는 스크린샷을 첨부한다.
- GitHub 브랜치 보호 설정은 위 조건을 강제하도록 구성한다.
- 브랜치 간 Merge commit을 허용해야 하므로 **Require linear history는 비활성화**한다.

### CI·배포 도입 기준

아래 항목은 합의된 도입 기준이며, 이 문서의 작성만으로 CI·배포나 GitHub 보호 설정이
구성된 것은 아니다.

- 앱 파일과 `package.json`은 저장소 루트에 위치한다. CI는 루트에서
  `npm ci`, `npm run lint`, `npm run build`,
  `npx tsc --noEmit`를 순서대로 실행한다. 빌드가 생성하는 Next.js 타입을 사용하므로
  별도 타입 검사는 빌드 후 수행한다.
- 작업 PR은 Preview, `main`은 검증 환경, `production`은 운영 환경에 연결한다.
- 운영 장애 시 직전 정상 배포로 복구하고, 원인 변경을 되돌리는 PR로 브랜치 상태도 맞춘다.

## 합의된 이슈 관리 방식

### 작업 단위·담당자

- 구현 전에 이슈를 생성한다. 기능, 버그, 설정·문서 변경 모두 포함한다.
- 이슈 하나는 독립적으로 검증할 수 있는 작업 단위로 잡는다.
- 작업 이슈에는 담당자 1명을 지정하고, 기본적으로 **이슈 1개 → 작업 브랜치 1개 → PR 1개**로 진행한다.
- 며칠 이상 걸리거나 여러 PR이 필요한 기능은 상위 이슈와 하위 작업 이슈로 나누고,
  GitHub의 하위 이슈 기능으로 관계를 관리한다.
- 제목은 `[Feature] 로그인 화면 구현`, `[Bug] 로그인 실패 메시지 누락`처럼 작성한다.

### 라벨

| 구분 | 라벨 | 의미 |
| --- | --- | --- |
| 유형 | `feature`, `bug`, `chore`, `docs` | 작업 성격 |
| 우선순위 | `P0` | 운영 장애 등 즉시 대응 |
| 우선순위 | `P1` | 다음 배포에 필요한 작업 |
| 우선순위 | `P2` | 일정에 따라 처리할 작업 |
| 진행 장애 | `blocked` | 선행 작업·정보를 기다리는 상태 |

### 진행 상태·완료 기준

진행 상태는 GitHub Projects에서 관리한다.

| 상태 | 진입 기준 |
| --- | --- |
| Backlog | 요구사항 등록 |
| Ready | 범위·수용 기준·구현 계획·선행 조건 정리 완료 |
| In progress | 담당자가 구현 시작 |
| In review | PR 생성 및 리뷰 요청 |
| Done | 수용 기준 충족, 검증 완료, `main` 병합 |

- 담당자별 진행 중인 작업은 기본 1개로 유지한다.
- 작업이 막히면 `blocked` 라벨을 붙이고 원인, 필요한 결정, 해제 조건을 댓글로 기록한다.
- 구현 완료와 운영 배포는 구분한다. 일반 작업 이슈는 `main` 병합 시 닫는다.
- 실제 배포 여부는 버전 마일스톤과 배포 PR의 포함 이슈 목록으로 추적한다.
- 운영 긴급 수정 이슈는 운영 배포와 `main` 동기화가 모두 끝난 뒤 닫는다.

## 합의된 구현 계획 작성 방식

### 계획의 위치·내용

구현 계획은 해당 이슈 본문에서 관리하며, 기존 코드와 구조를 확인한 뒤 작성한다.

| 항목 | 작성할 내용 |
| --- | --- |
| 목적 | 해결할 문제와 사용자에게 달라지는 동작 |
| 작업 범위 | 이번에 구현할 내용과 제외할 내용 |
| 수용 기준 | 완료 여부를 확인할 수 있는 구체적인 조건 |
| 선행 조건 | 필요한 API, 디자인, 관련 이슈와 미정 사항 |
| 구현 계획 | 변경할 영역과 작업 순서를 체크리스트로 작성 |
| 검증 계획 | 정상·오류·경계 상황을 확인할 방법 |

- 작은 수정은 짧은 체크리스트로 작성한다.
- 복잡한 작업은 데이터 흐름, 컴포넌트 역할, 인터페이스까지 정리한다.
- 요구사항이나 외부 계약이 불명확하면 해당 부분을 먼저 확인하고,
  독립적으로 진행 가능한 작업은 계속한다.

### 구현 중 계획 관리

- 범위·접근 방식이 바뀌면 이슈 본문을 최신 상태로 수정하고, 댓글로 변경 이유를 남긴다.
- 추가로 발견한 독립적인 개선 사항은 별도 이슈로 등록한다.
- 체크리스트는 구현·검증이 끝난 항목만 완료 표시한다.
- 새 테스트는 변경의 위험과 기존 테스트 구성을 보고 결정한다.
- PR에는 실제 수행한 검증 결과를 기록한다.

### 이슈·브랜치·PR·배포 연결

- 기본 브랜치는 `main`으로 유지한다.
- 이슈 번호를 브랜치 이름에 포함하는 것을 권장한다. 예: `feat/12-login`. 이름은 강제하지 않는다.
- PR 제목은 `feat: 로그인 화면 구현`처럼 변경 유형과 내용을 나타낸다.
- 작업을 완전히 해결하는 `main` 대상 PR 본문에는 `Closes #12`처럼 이슈를 연결한다.
- 일부 작업만 포함하는 PR 본문에는 `Refs #12`처럼 이슈를 참조한다.
- `Closes` 자동 종료는 기본 브랜치 대상 PR에서 동작한다. `production` 대상 hotfix PR은
  `Refs #번호`로 연결하고, 운영 배포와 `main` 동기화가 끝난 뒤 이슈를 닫는다.
- 배포 PR에는 포함 이슈, 검증 결과, 배포 확인 방법을 기록한다.

GitHub Projects, 라벨, 마일스톤은 위 기준에 맞춰 구성한다.
이 문서의 작성만으로 GitHub의 해당 설정이나 이슈 템플릿이 구성된 것은 아니다.

## 합의된 코드리뷰 규칙

### 리뷰 요청 전 작성자 책임

- 변경 사항을 직접 다시 읽고 관련 없는 수정은 분리한다.
- PR에는 관련 이슈, 변경 이유, 주요 구현 방식, 실제 수행한 검증 결과를 작성한다.
- UI 변경에는 스크린샷과 확인 방법을 첨부한다.
- 미완성 작업은 Draft로 유지하고, 검증을 마친 뒤 리뷰를 요청한다.
- 독립적인 변경을 여러 개 포함해 PR이 커지면 작업 이슈와 PR을 나눈다.

### 리뷰 항목

| 항목 | 확인할 내용 |
| --- | --- |
| 요구사항 | 이슈의 수용 기준 충족과 작업 범위 준수 |
| 동작 | 정상·오류·경계 상황, 로딩·빈 화면·중복 요청 처리 |
| 회귀 | 기존 기능과 공통 컴포넌트에 미치는 영향 |
| 구조 | 기존 패턴 준수와 책임·데이터 흐름의 명확성 |
| 프론트엔드 품질 | 변경 관련 반응형, 키보드 조작, 입력 레이블 |
| 보안·성능 | 비밀정보 노출, 권한 처리 오류, 불필요한 요청·연산 |
| 검증 | 변경 위험에 맞는 검증 수행과 확인 가능한 결과 |

- 리뷰어는 이슈와 구현 계획을 먼저 읽고 코드를 확인한다.
- 실행 확인이 필요한 변경은 로컬이나 Preview에서 재현한다.
- 직접 확인한 내용과 코드만 보고 판단한 내용을 구분한다.

### 리뷰 코멘트

| 표시 | 의미 | 병합 전 처리 |
| --- | --- | --- |
| `[필수]` | 결함, 수용 기준 누락, 합의된 규칙 위반 | 수정 또는 근거를 통한 해소 필요 |
| `[제안]` | 가독성·구조 개선 등 선택 사항 | 반영하거나 이유를 남기고 종료 |
| `[질문]` | 의도·동작 확인 | 답변 필요. 문제가 확인되면 필수로 전환 |

- 코멘트에는 위치, 이유, 발생 상황, 가능한 개선 방향을 적는다.
- 개인 취향만으로 수정을 강제하지 않는다. 포맷·스타일은 린터와 합의된 규칙을 따른다.
- 이번 변경과 무관한 개선은 별도 이슈로 등록한다.

### 승인·수정·재검토·병합

- 일반 PR에 필수 문제가 남으면 **Request changes**를 사용한다.
- 검토가 끝났고 필수 문제가 없으면 **Approve**한다.
- 작성자는 각 코멘트에 수정 내용이나 반영하지 않는 근거를 답변한다.
- 필수 코멘트는 리뷰어가 수정 결과를 확인한 뒤 해결 처리한다.
- 승인 후 변경 내용이 추가되면 영향 범위를 재검토하고 다시 승인한다.
- 일반 PR은 작성자 외 팀원 최소 1명 승인, 필수 수정과 리뷰 대화 해결,
  최신 변경에 대한 필수 CI 통과, 수용 기준 충족과 검증 결과 기록 후 작성자가 병합한다.
- 리뷰 요청 후 1영업일 안에 첫 피드백을 주는 것을 목표로 한다.
- 의견이 갈리면 수용 기준·재현 결과·기존 규칙을 근거로 논의하고,
  해결되지 않으면 다른 팀원에게 판단을 요청한다.
- AI 리뷰는 보조로 활용하며 지적의 타당성을 확인한다. 일반 PR의 필수 팀원 승인은 별도로 받는다.
- Hotfix는 수정 범위를 좁히고 CI 통과 후 리뷰 승인 없이 병합할 수 있다.

### GitHub 설정과 Hotfix 예외 운영

- `main`, `production`에 공통 보호 규칙과 리뷰 규칙을 분리해 적용한다.
- 공통 보호 규칙은 PR 필수, 리뷰 대화 해결, `Frontend CI` 통과,
  최신 대상 브랜치와 함께 검증, force push·브랜치 삭제 금지를 적용한다. 우회 권한은 부여하지 않는다.
- 리뷰 규칙은 승인 1명, 변경 시 기존 승인 취소, 마지막 push 작성자 외 승인을 요구한다.
- 리뷰 규칙에는 저장소 관리자 역할의 **PR에서만 우회** 권한을 부여한다.
- 관리자는 운영 긴급 수정 PR과 해당 Hotfix의 `production → main` 동기화에만
  리뷰 우회를 사용한다. PR 본문에는 관련 이슈와 Hotfix 사유를 기록하며,
  브랜치 이름 대신 PR의 실제 목적을 확인한다.
- GitHub 기본 규칙은 PR의 출발 브랜치 이름으로 리뷰 예외를 지정할 수 없다.
  관리자 우회 권한 자체는 다른 PR에도 적용되므로, Hotfix 한정 사용은 운영 규칙으로 준수한다.
- 저장소 병합 방식은 Squash merge와 Merge commit을 허용하고 Rebase merge는 비활성화한다.
- 병합 방식 규칙은 공통 보호·리뷰 규칙과 분리한다. `main`은 Squash merge만,
  `production`은 Merge commit만 허용한다. `main` 병합 방식 규칙에만 관리자 역할의
  **PR에서만 우회** 권한을 부여하며, `production` 병합 방식 규칙에는 우회를 허용하지 않는다.
- 관리자는 `production → main` 동기화 PR에 한해서 `main` 병합 방식 규칙을 우회하고
  Merge commit을 선택한다. 일반 작업 PR에는 병합 방식 우회를 사용하지 않는다.
  일반 배포 동기화는 리뷰 승인을 받아야 하며, Hotfix 동기화만 기존 리뷰 예외를 적용한다.
- GitHub는 출발 브랜치별로 병합 방식이나 관리자 우회 대상을 제한하지 못하므로,
  동기화 한정 우회는 운영 규칙으로 준수한다. 이 우회로 공통 보호의 CI·대화 해결·PR 필수
  조건을 우회할 수는 없다.
- 병합된 작업 브랜치는 자동 삭제하되, 보호된 `main`, `production`은 유지한다.

현재 적용된 GitHub 규칙:

| 규칙 | 대상 | 우회 |
| --- | --- | --- |
| [Protected branches: PR and CI](https://github.com/KANT-2/leaf-bowl/rules/24690460) | `main`, `production` | 없음 |
| [Code review: hotfix bypass](https://github.com/KANT-2/leaf-bowl/rules/24690471) | `main`, `production` | 관리자 PR 한정, Hotfix·해당 동기화에만 사용 |
| [Merge method: main squash, admin production sync](https://github.com/KANT-2/leaf-bowl/rules/24699903) | `main` | 관리자 PR 한정, `production → main` 동기화에만 사용 |
| [Merge method: production merge commits](https://github.com/KANT-2/leaf-bowl/rules/24699880) | `production` | 없음 |

## 개발 MCP CI/CD 운영

- 기존 `Frontend CI`를 배포 게이트로 사용한다. CI/CD 스크립트 변경 시
  `python3 -m unittest discover -s ops -p 'test_*.py' -v`도 검증한다.
- 개발 MCP 프로젝트 `front-5-cicd`에서 `ops/mcp_cicd.py`로 배포 프로세스를 운영한다.
- `main`은 비공개 검증 앱 `kant2-front5-staging`(포트 3100), `production`은
  공개 운영 앱 `kant2-front5-production`(포트 3200)에 연결한다. 같은 커밋의 FastAPI(`backend/`)는
  같은 supervisor가 내부 포트(3101·3201, `127.0.0.1`)에서 실행하고 Next.js `/backend` 프록시로만 노출한다.
- 해당 브랜치의 최신 SHA에 대한 최신 `Frontend CI` push 실행이 성공한 경우에만 배포한다.
- 브랜치 변경은 60초마다 확인하며, CI/API 재확인은 최소 180초 간격으로 수행한다.
- 빌드·후보 서버 확인 실패 시 기존 버전을 유지한다. 새 서버 시작 실패 시 이전 버전을 복구한다.
- 배포 상태·로그·릴리스는 `.deploy/`에 저장하고 Git에서 제외한다.
- 스크립트 수정은 기존 이슈·브랜치·PR·리뷰 규칙을 따르며, 병합 후 개발 MCP의
  운영 스크립트를 갱신하고 앱을 재배포한다. 실행 환경 재생성 시 준비·배포 절차로 복원한다.
- 상세 실행·검증·복구 방법은 `ops/README.md`를 따른다.

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Ignore routine debugging and unverified changes. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Keep a qualifying candidate through the reporting pass even if you resolve or work around it. A successful fix changes the report outcome; it does not erase the friction that qualified it.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `node node_modules/next/dist/bin/next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->
