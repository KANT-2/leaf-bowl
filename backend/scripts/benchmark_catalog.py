"""공개 메뉴 API만 읽어 전후 성능과 revision 기반 무효화 증거를 기록한다."""

import argparse
import hashlib
import json
import math
import statistics
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from time import perf_counter

import httpx

CASES = (
    ("menu_list", {"page": 1, "size": 8, "sort": "default"}),
    ("keyword_allergen", {"q": "치킨", "exclude_allergens": "우유", "page": 1, "size": 8}),
    (
        "category_price",
        {"category": "든든한 단백질", "min_price": 10000, "max_price": 12000, "sort": "priceLow", "page": 1, "size": 8},
    ),
)


def read_json(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path: str, value: dict) -> None:
    destination = Path(path).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    # 기존 측정값을 덮어쓰지 않는다. 재측정은 다른 출력 파일에 남긴다.
    with destination.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    print(f"기록: {destination}")


def fetch_menu(client: httpx.Client, params: dict) -> tuple[dict, float, dict]:
    started = perf_counter()
    response = client.get("/api/v1/menus", params=params)
    response.raise_for_status()
    body = response.json()
    elapsed = (perf_counter() - started) * 1000
    if not isinstance(body.get("items"), list) or not isinstance(body.get("total"), int):
        raise ValueError("메뉴 응답 형식이 올바르지 않습니다.")
    metadata = {
        "cache": response.headers.get("x-catalog-cache", "UNREPORTED"),
        "revision": response.headers.get("x-catalog-revision"),
        "server_ms": response.headers.get("x-process-time-ms"),
    }
    return body, elapsed, metadata


def digest(body: dict) -> str:
    return hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def measure(args) -> None:
    results = []
    with httpx.Client(base_url=args.base_url.rstrip("/"), timeout=20, trust_env=False) as client:
        for name, params in CASES:
            first, first_ms, first_meta = fetch_menu(client, params)
            expected = digest(first)
            for _ in range(args.warmups - 1):
                warm, _, _ = fetch_menu(client, params)
                if digest(warm) != expected:
                    raise ValueError("측정 중 상품이 변경됐습니다. 수정 작업을 멈추고 다시 측정해주세요.")
            samples, server_samples, statuses, revisions = [], [], [], set()
            for _ in range(args.samples):
                body, elapsed, metadata = fetch_menu(client, params)
                if digest(body) != expected:
                    raise ValueError("측정 중 상품이 변경됐습니다. 이번 결과는 비교에 사용하지 않습니다.")
                if args.require_hit and metadata["cache"] != "HIT":
                    raise ValueError(
                        f"반복 요청이 HIT가 아닙니다: {metadata['cache']}. 설정·TTL·서버 재시작을 확인하세요."
                    )
                samples.append(elapsed)
                statuses.append(metadata["cache"])
                if metadata["revision"]:
                    revisions.add(metadata["revision"])
                if metadata["server_ms"] is not None:
                    server_samples.append(float(metadata["server_ms"]))
            if len(revisions) > 1:
                raise ValueError("측정 중 revision이 변경됐습니다. 동일 조건에서 다시 측정해주세요.")
            ordered = sorted(samples)
            result = {
                "case": name,
                "params": params,
                "samples_ms": [round(value, 3) for value in samples],
                "first_request_ms": round(first_ms, 3),
                "first_cache_state": first_meta["cache"],
                "mean_ms": round(statistics.mean(samples), 3),
                "median_ms": round(statistics.median(samples), 3),
                "p95_ms": round(ordered[math.ceil(len(ordered) * 0.95) - 1], 3),
                "server_mean_ms": round(statistics.mean(server_samples), 3) if server_samples else None,
                "cache_status_counts": dict(Counter(statuses)),
                "revisions": sorted(revisions),
                "body_sha256": expected,
                "items_count": len(first["items"]),
                "total": first["total"],
            }
            results.append(result)
            print(
                f"{name}: mean={result['mean_ms']}ms median={result['median_ms']}ms "
                f"p95={result['p95_ms']}ms {result['cache_status_counts']}",
                flush=True,
            )
    write_json(
        args.output,
        {
            "label": args.label,
            "captured_at": datetime.now(UTC).isoformat(),
            "base_url": args.base_url,
            "samples_per_case": args.samples,
            "warmups": args.warmups,
            "results": results,
        },
    )


def compare(args) -> None:
    before, after = read_json(args.before), read_json(args.after)
    if before["base_url"] != after["base_url"] or before["samples_per_case"] != after["samples_per_case"]:
        raise ValueError("동일한 URL과 반복 횟수의 결과만 비교합니다.")
    old = {row["case"]: row for row in before["results"]}
    if set(old) != {row["case"] for row in after["results"]}:
        raise ValueError("측정 사례가 서로 다릅니다.")
    lines = [
        "# 메뉴 캐시 적용 전·후 응답 시간",
        "",
        f"- 적용 전: {before['captured_at']}",
        f"- 적용 후: {after['captured_at']}",
        f"- 조건별 요청 수: {before['samples_per_case']} (워밍업 제외)",
        "",
        "| 조건 | 전 평균(ms) | 후 평균(ms) | 전 중앙값(ms) | 후 중앙값(ms) | "
        "중앙값 감소율 | 전 p95(ms) | 후 p95(ms) |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in after["results"]:
        previous = old[row["case"]]
        if previous["params"] != row["params"] or previous["body_sha256"] != row["body_sha256"]:
            raise ValueError("조건 또는 상품 응답이 바뀌었습니다. 같은 데이터로 전후 측정이 필요합니다.")
        improvement = (1 - row["median_ms"] / previous["median_ms"]) * 100
        lines.append(
            f"| {row['case']} | {previous['mean_ms']} | {row['mean_ms']} | "
            f"{previous['median_ms']} | {row['median_ms']} | {improvement:.1f}% | "
            f"{previous['p95_ms']} | {row['p95_ms']} |"
        )
    lines.extend(
        [
            "",
            "실제 로컬 HTTP 순차 요청의 경과 시간이다. DB revision은 캐시 HIT에서도 확인한다. "
            "네트워크·DB 상태·서버 부하는 결과에 영향을 주며, 소수 표본의 p95는 참고 수치다. "
            "첫 요청은 별도로 JSON에 기록하며 콜드 캐시임을 보장하지 않는다.",
            "",
        ]
    )
    destination = Path(args.output).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("x", encoding="utf-8") as stream:
        stream.write("\n".join(lines))
    print("\n".join(lines))
    print(f"기록: {destination}")


def capture(args) -> None:
    with httpx.Client(base_url=args.base_url.rstrip("/"), timeout=20, trust_env=False) as client:
        body, elapsed, metadata = fetch_menu(client, {"page": 1, "size": 50, "sort": "default"})
        warmed, _, warm_metadata = fetch_menu(client, {"page": 1, "size": 50, "sort": "default"})
        if digest(warmed) != digest(body) or warm_metadata["cache"] != "HIT":
            raise ValueError("같은 결과의 HIT를 확인하지 못했습니다. 설정과 상품 변경 여부를 확인하세요.")
        metadata = warm_metadata
    item = next((item for item in body["items"] if item["key"] == args.key), None)
    if item is None:
        raise ValueError("기록할 상품이 첫 50개 메뉴에 없습니다. 다른 상품 키를 선택해주세요.")
    if metadata["revision"] is None:
        raise ValueError("revision 헤더가 없습니다. 캐시 코드를 적용하고 서버를 다시 시작한 뒤 실행하세요.")
    write_json(
        args.output,
        {
            "base_url": args.base_url,
            "captured_at": datetime.now(UTC).isoformat(),
            "key": args.key,
            "item": item,
            "elapsed_ms": round(elapsed, 3),
            **metadata,
        },
    )
    print(json.dumps({"item": item, **metadata}, ensure_ascii=False, indent=2))


def verify(args) -> None:
    before = read_json(args.before)
    age = (datetime.now(UTC) - datetime.fromisoformat(before["captured_at"])).total_seconds()
    expected = int(args.expect) if args.field == "price" else args.expect
    with httpx.Client(base_url=before["base_url"].rstrip("/"), timeout=20, trust_env=False) as client:
        # 첫 요청 결과만 판단한다. 값이 바뀔 때까지 반복해 실패를 감추지 않는다.
        body, elapsed, metadata = fetch_menu(client, {"page": 1, "size": 50, "sort": "default"})
    item = next((item for item in body["items"] if item["key"] == before["key"]), None)
    passed = (
        metadata["revision"] is not None
        and metadata["revision"] != before["revision"]
        and item is not None
        and before["item"][args.field] != expected
        and item[args.field] == expected
        and 0 <= age < args.ttl_seconds
    )
    result = {
        "passed": passed,
        "checked_at": datetime.now(UTC).isoformat(),
        "key": before["key"],
        "field": args.field,
        "before_value": before["item"][args.field],
        "expected": expected,
        "actual": item[args.field] if item else None,
        "before_revision": before["revision"],
        "after_revision": metadata["revision"],
        "cache": metadata["cache"],
        "first_request_ms": round(elapsed, 3),
        "seconds_since_capture": round(age, 3),
        "configured_ttl_seconds": args.ttl_seconds,
        "within_ttl": 0 <= age < args.ttl_seconds,
    }
    write_json(args.output, result)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not passed:
        raise ValueError("수정 직후 반영 검증에 실패했습니다. revision 갱신과 관리자 저장 성공 여부를 확인하세요.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    bench = sub.add_parser("measure")
    bench.add_argument("--base-url", default="http://127.0.0.1:8000")
    bench.add_argument("--label", choices=("before", "after"), required=True)
    bench.add_argument("--samples", type=int, default=10)
    bench.add_argument("--warmups", type=int, default=2)
    bench.add_argument("--require-hit", action="store_true")
    bench.add_argument("--output", required=True)
    diff = sub.add_parser("compare")
    diff.add_argument("--before", required=True)
    diff.add_argument("--after", required=True)
    diff.add_argument("--output", required=True)
    snap = sub.add_parser("capture")
    snap.add_argument("--base-url", default="http://127.0.0.1:8000")
    snap.add_argument("--key", default="salad-0")
    snap.add_argument("--output", required=True)
    check = sub.add_parser("verify")
    check.add_argument("--before", required=True)
    check.add_argument("--field", choices=("name", "price", "status"), required=True)
    check.add_argument("--expect", required=True)
    check.add_argument("--ttl-seconds", type=float, required=True, help="검증 서버에 설정한 캐시 TTL")
    check.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.command == "measure" and (args.samples < 2 or args.warmups < 1):
        parser.error("samples는 2 이상, warmups는 1 이상이어야 합니다.")
    try:
        {"measure": measure, "compare": compare, "capture": capture, "verify": verify}[args.command](args)
    except (ValueError, FileExistsError, httpx.HTTPError) as exc:
        parser.exit(1, f"오류: {exc}\n")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
