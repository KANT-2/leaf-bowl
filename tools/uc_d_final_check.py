#!/usr/bin/env python3
"""UC-D 관리자 FastAPI 실제 응답 점검. 표준 라이브러리만 사용.

기본 모드는 GET/로그인/검증 요청만 수행한다. 주문 변경은 명시적인
--mode write + _test 로컬 DB 확인 + 사용자 재확인을 모두 통과할 때만 한다.
JWT·비밀번호·주문 개인정보는 출력하거나 리포트에 저장하지 않는다.
"""
from __future__ import annotations

import argparse
import datetime as dt
import getpass
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
BACKEND_ENV = ROOT / "backend" / ".env"
NEXT_ENV = ROOT / ".env.local"
TRANSITIONS = {
    "received": "confirmed", "confirmed": "preparing",
    "preparing": "delivering", "delivering": "completed",
}
EXPECTED_PATHS = {
    ("post", "/api/admin/token"), ("post", "/api/admin/logout"),
    ("get", "/api/admin/orders"),
    ("get", "/api/admin/orders/{order_id}"),
    ("patch", "/api/admin/orders/{order_id}/status"),
}


class CheckFailure(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """서버가 다른 호스트로 이동을 요구해도 관리자 토큰/비밀번호를 재전송하지 않는다."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def env_value(path: Path, key: str) -> str | None:
    if not path.is_file():
        return None
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        match = re.match(r"^\s*(?:export\s+)?" + re.escape(key) + r"\s*=\s*(.*)$", line)
        if match:
            val = match.group(1).strip()
            if val and val[0] in "\"'" and val[-1] == val[0]:
                val = val[1:-1]
            else:
                val = val.split(" #", 1)[0].strip()
            return val
    return None


def validate_base_url(base_url: str) -> str:
    """인증 정보가 외부 서버로 전송되지 않도록 로컬 FastAPI만 허용."""
    try:
        target = urllib.parse.urlsplit(base_url)
        allowed = (
            target.scheme == "http"
            and target.hostname in ("localhost", "127.0.0.1", "::1")
            and target.port == 8000
            and target.path in ("", "/")
            and not target.username and not target.password
            and not target.query and not target.fragment
        )
    except ValueError:
        allowed = False
    if not allowed:
        raise CheckFailure("로컬 8000번 FastAPI 주소(http://127.0.0.1:8000)만 사용할 수 있습니다.")
    return base_url.rstrip("/")


def parse_local_test_db(value: str | None) -> tuple[str, int, str, str]:
    """파일에 적힌 DB의 호스트/포트/이름/사용자를 대조. 비밀번호는 기록하지 않음."""
    if not value:
        raise CheckFailure("DATABASE_URL이 없습니다. 쓰기 테스트는 중단합니다.")
    if "$" in value or "${" in value:
        raise CheckFailure("DATABASE_URL 변수 치환 값을 자동 확인할 수 없습니다. 쓰기 테스트 중단.")
    try:
        parsed = urllib.parse.urlsplit(value)
        host = parsed.hostname
        port = parsed.port or 5432
        dbname = urllib.parse.unquote(parsed.path.lstrip("/"))
        username = urllib.parse.unquote(parsed.username or "")
    except ValueError as exc:
        raise CheckFailure("DATABASE_URL 형식이 잘못되었습니다.") from exc
    if parsed.scheme not in ("postgresql", "postgres", "postgresql+asyncpg"):
        raise CheckFailure("PostgreSQL DB URL만 허용합니다.")
    if host not in ("localhost", "127.0.0.1", "::1"):
        raise CheckFailure("쓰기 테스트는 로컬 PostgreSQL만 허용합니다. Supabase/공유 DB 중단.")
    if not 1 <= port <= 65535:
        raise CheckFailure("PostgreSQL 포트가 유효하지 않습니다.")
    if not re.fullmatch(r"[a-zA-Z0-9_-]+_test", dbname):
        raise CheckFailure("DB 이름은 *_test로 끝나는 별도 DB여야 합니다.")
    if not username:
        raise CheckFailure("DB 사용자 이름이 누락되었습니다.")
    # localhost/127.0.0.1 은 같은 로컬 DB로 비교한다 (단 실제 프록시 연결은 재확인).
    return ("loopback", port, dbname, username)


def require_write_safety(base_url: str, *, confirm: bool = True) -> tuple[str, int, str, str]:
    validate_base_url(base_url)
    front = parse_local_test_db(env_value(NEXT_ENV, "DATABASE_URL"))
    back = parse_local_test_db(env_value(BACKEND_ENV, "DATABASE_URL"))
    if front != back:
        raise CheckFailure("루트 .env.local과 backend/.env의 로컬 시험 DB 접속 정보가 다릅니다.")
    # 서버 프로세스의 DATABASE_URL 환경변수 오버라이드는 여기서 확인 불가. 수동 확인 필수.
    print(f"[보호 확인] 설정 파일 기준 로컬 DB: port={front[1]}, database={front[2]}")
    print("[중요] 실행 중 FastAPI/Next.js 프로세스가 이 로컬 시험 DB를 참조하는지 직접 확인하세요.")
    if confirm:
        phrase = input("정확히 'LOCAL TEST DB ONLY'를 입력해야 변경 요청을 보냅니다: ").strip()
        if phrase != "LOCAL TEST DB ONLY":
            raise CheckFailure("사용자 확인이 없어 쓰기 테스트를 중단했습니다.")
    return front


def request_json(base_url: str, method: str, path: str, *, token: str | None = None,
                 data: dict | None = None, form: dict | None = None) -> tuple[int, Any]:
    url = base_url.rstrip("/") + path
    headers = {"Accept": "application/json"}
    body = None
    if token:
        headers["Authorization"] = "Bearer " + token
    if form is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        body = urllib.parse.urlencode(form).encode()
    elif data is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(data, ensure_ascii=False).encode()
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(req, timeout=15) as response:
            status = response.status
            raw = response.read(2_000_000)
    except urllib.error.HTTPError as exc:
        status, raw = exc.code, exc.read(2_000_000)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise CheckFailure("FastAPI 연결 실패. 백엔드 터미널 실행 여부를 확인하세요.") from exc
    try:
        result = json.loads(raw) if raw else {}
    except (ValueError, UnicodeDecodeError):
        raise CheckFailure(f"{path}: 서버가 JSON이 아닌 응답을 보냈습니다 (HTTP {status}).")
    return status, result


def ensure(label: str, actual: int, expected: int, report: dict) -> None:
    ok = actual == expected
    report["checks"].append({"check": label, "http": actual, "expected": expected, "pass": ok})
    print(("[PASS] " if ok else "[FAIL] ") + f"{label}: HTTP {actual} (기대 {expected})")
    if not ok:
        raise CheckFailure(f"{label} 실패: HTTP {actual}, 기대 {expected}")


def check_shape(body: Any, keys: set[str], label: str) -> None:
    if not isinstance(body, dict) or not keys.issubset(body):
        raise CheckFailure(f"{label}: 필드 {', '.join(sorted(keys))}가 부족합니다. API 응답 계약 확인 필요.")


def save_report(path: str | None, report: dict) -> None:
    if path:
        dest = Path(path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"[리포트 저장] {dest} (JWT/비밀번호/연락처/주소 제외)")


def run(args: argparse.Namespace) -> int:
    report: dict = {"checked_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
                    "mode": args.mode, "checks": []}
    validate_base_url(args.base_url)
    if args.mode == "write":
        if not args.order_id:
            raise CheckFailure("쓰기 모드에는 --order-id UUID가 필요합니다.")
        try:
            uuid.UUID(args.order_id)
        except ValueError as exc:
            raise CheckFailure("--order-id는 UUID여야 합니다.") from exc
        require_write_safety(args.base_url)

    code, body = request_json(args.base_url, "GET", "/health/db")
    ensure("FastAPI DB 연결", code, 200, report)
    code, spec = request_json(args.base_url, "GET", "/openapi.json")
    ensure("OpenAPI", code, 200, report)
    paths = spec.get("paths", {}) if isinstance(spec, dict) else {}
    present = {(verb.lower(), path) for path, item in paths.items() for verb in item}
    missing = EXPECTED_PATHS - present
    if missing:
        raise CheckFailure(f"등록 안 된 관리자 API: {sorted(missing)}")
    print("[PASS] 관리자 FastAPI 5개 Method/Path 등록 확인")
    report["checks"].append({"check": "관리자 OpenAPI 경로 5개", "pass": True})

    code, _ = request_json(args.base_url, "GET", "/api/admin/orders?limit=2")
    ensure("미인증 관리자 GET 차단", code, 401, report)

    login_id = args.login_id or input("관리자 ID: ").strip()
    if not login_id:
        raise CheckFailure("관리자 ID를 입력해야 합니다.")
    password = getpass.getpass("관리자 비밀번호 (표시 안 됨): ")
    code, auth = request_json(args.base_url, "POST", "/api/admin/token",
                              form={"username": login_id, "password": password})
    password = ""  # 이후 출력 또는 파일 저장 금지
    ensure("실제 관리자 OAuth2 로그인", code, 200, report)
    check_shape(auth, {"access_token"}, "로그인 응답")
    token = auth["access_token"]
    if not isinstance(token, str) or not token:
        raise CheckFailure("관리자 JWT가 비어 있습니다.")

    code, orders = request_json(args.base_url, "GET", "/api/admin/orders?limit=50", token=token)
    ensure("FastAPI 관리자 주문 목록", code, 200, report)
    check_shape(orders, {"items", "nextCursor"}, "관리자 주문 목록")
    items = orders["items"]
    if not isinstance(items, list):
        raise CheckFailure("목록 items가 배열이 아닙니다.")
    print(f"[확인] 첫 페이지에 주문 {len(items)}건 (DB 전체 건수가 아님)")

    target = args.order_id or (items[0].get("id") if items and isinstance(items[0], dict) else None)
    if not target:
        print("[미검증] 조회 가능한 주문이 없습니다. 상세/404·422 HTTP 검사는 미실행입니다.")
        if args.mode == "write":
            raise CheckFailure("쓰기 대상 주문이 없습니다.")
        report["checks"].append({"check": "주문 상세 검증", "pass": False, "reason": "조회 가능한 주문 없음"})
        save_report(args.report, report)
        return 3
    try:
        uuid.UUID(str(target))
    except ValueError as exc:
        raise CheckFailure("FastAPI 목록에서 유효하지 않은 UUID 주문 ID를 반환했습니다.") from exc

    detail_path = f"/api/admin/orders/{target}"
    code, before = request_json(args.base_url, "GET", detail_path, token=token)
    ensure("관리자 주문 상세", code, 200, report)
    check_shape(before, {"id", "status", "version", "history"}, "상세 응답")
    if str(before["id"]) != str(target) or not isinstance(before["history"], list):
        raise CheckFailure("상세 주문 ID/처리 이력이 응답 계약과 맞지 않습니다.")
    print(f"[확인] 상세 조회 성공: 상태={before['status']}, version={before['version']}, history={len(before['history'])}건")
    report["order_id"] = str(target)
    report["before"] = {"status": before["status"], "version": before["version"],
                        "history_count": len(before["history"])}

    code, _ = request_json(args.base_url, "GET", f"/api/admin/orders/{uuid.uuid4()}", token=token)
    ensure("없는 주문 상세 404", code, 404, report)
    code, _ = request_json(args.base_url, "GET", "/api/admin/orders/not-a-uuid", token=token)
    ensure("형식 오류 주문 ID 422", code, 422, report)

    if args.mode == "write":
        status = before["status"]
        next_status = TRANSITIONS.get(status)
        if not next_status:
            raise CheckFailure(f"선택한 주문 상태({status})는 다음 단계가 없습니다. 별도의 접수/확인/준비 주문이 필요합니다.")
        version = before["version"]
        if not isinstance(version, int) or version < 1:
            raise CheckFailure("주문 버전이 유효하지 않습니다.")
        patch_data = {"status": next_status, "version": version, "reason": "UC-D local test DB integration QA"}
        patch_path = detail_path + "/status"
        code, _ = request_json(args.base_url, "PATCH", patch_path, token=token, data=patch_data)
        ensure("관리자 상태 PATCH 성공", code, 200, report)
        code, after = request_json(args.base_url, "GET", detail_path, token=token)
        ensure("PATCH 후 상세 재조회", code, 200, report)
        if after.get("status") != next_status or after.get("version") != version + 1:
            raise CheckFailure("PATCH 후 status/version+1이 일치하지 않습니다.")
        old_history = before["history"]
        new_history = after.get("history")
        if not isinstance(new_history, list) or len(new_history) != len(old_history) + 1:
            raise CheckFailure("PATCH 이후 이력이 정확히 1건 증가하지 않았습니다.")
        report["checks"].append({"check": "status/version+1/history+1", "pass": True})
        print("[PASS] 상태 전이 / version+1 / history+1")
        report["after"] = {"status": after["status"], "version": after["version"],
                           "history_count": len(new_history)}
        code, _ = request_json(args.base_url, "PATCH", patch_path, token=token, data=patch_data)
        ensure("오래된 version 충돌 409", code, 409, report)
        code, unchanged = request_json(args.base_url, "GET", detail_path, token=token)
        ensure("충돌 후 상태 재조회", code, 200, report)
        if unchanged.get("status") != after["status"] or unchanged.get("version") != after["version"] or len(unchanged.get("history", [])) != len(new_history):
            raise CheckFailure("409 후 주문 상태/버전/이력이 변경됐습니다.")
        print("[PASS] 409 후 status/version/history 불변")
        report["checks"].append({"check": "409 후 불변", "pass": True})
        latest_entry = new_history[-1] if new_history else {}
        if (
            not isinstance(latest_entry, dict)
            or latest_entry.get("toStatus") != next_status
            or latest_entry.get("changedBy") != "admin"
        ):
            raise CheckFailure("최신 이력의 변경 후 상태 또는 관리자 변경자 필드가 일치하지 않습니다.")
        print("[PASS] 최신 이력 toStatus 및 changedBy=admin")
        report["checks"].append({"check": "이력 관리자 변경자", "pass": True})
        code, _ = request_json(args.base_url, "PATCH", patch_path, data={"status": next_status, "version": version + 1})
        ensure("미인증 PATCH 차단", code, 401, report)
        code, _ = request_json(args.base_url, "PATCH", f"/api/admin/orders/{uuid.uuid4()}/status",
                               token=token, data={"status": next_status, "version": 1})
        ensure("없는 주문 PATCH 404", code, 404, report)
        code, _ = request_json(args.base_url, "PATCH", patch_path,
                               token=token, data={"status": "invalid_status", "version": version + 1})
        ensure("잘못된 상태 PATCH 422", code, 422, report)
        code, still_ok = request_json(args.base_url, "GET", detail_path, token=token)
        ensure("오류 응답 후 DB 상태 재조회", code, 200, report)
        if still_ok.get("status") != after["status"] or still_ok.get("version") != after["version"] or len(still_ok.get("history", [])) != len(new_history):
            raise CheckFailure("PATCH 실패(401/404/422) 후 주문이 변경되었습니다.")
        print("[PASS] 실패 응답 후 주문 상태/버전/이력 불변")
        report["checks"].append({"check": "실패 응답 후 불변", "pass": True})
        code, _ = request_json(args.base_url, "POST", "/api/admin/logout", token=token)
        ensure("관리자 FastAPI 로그아웃", code, 204, report)
        code, _ = request_json(args.base_url, "GET", "/api/admin/orders?limit=2", token=token)
        ensure("폐기된 JWT 401", code, 401, report)
    else:
        print("[안전] 읽기 검사 완료. PATCH·토큰 블랙리스트 변경을 수행하지 않았습니다.")

    save_report(args.report, report)
    print("[끝] 보고서의 PASS는 위에서 직접 확인한 범위에만 해당합니다.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="UC-D FastAPI live integration smoke test, default read-only")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--login-id", help="관리자 ID; 비밀번호는 실행 시 안전하게 입력")
    parser.add_argument("--mode", choices=["read", "write"], default="read")
    parser.add_argument("--order-id", help="검사할 주문 UUID, write 시 필수")
    parser.add_argument("--report", help="고객 정보/비밀번호/JWT를 포함하지 않는 JSON 증빙 위치")
    args = parser.parse_args()
    try:
        return run(args)
    except CheckFailure as exc:
        print("[검증 중단]", exc, file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("[중단] 사용자가 검사를 중단했습니다.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
