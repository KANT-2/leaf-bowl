"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  loadLoginHistory,
  MemberAuthError,
  type LoginHistoryFilter,
  type LoginHistoryPage,
} from "@/features/member/client";

const REASON_LABEL: Record<string, string> = {
  wrong_password: "비밀번호 불일치",
  withdrawn: "탈퇴한 계정",
};

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

/** 접속 기기 문자열(User-Agent)을 "Chrome · Windows" 처럼 짧게 보여준다 */
function deviceLabel(userAgent: string | null): string {
  if (!userAgent) {
    return "알 수 없는 기기";
  }
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "기타 브라우저";
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad/.test(userAgent)
        ? "iOS"
        : /Mac OS/.test(userAgent)
          ? "macOS"
          : "";
  return os ? `${browser} · ${os}` : browser;
}

export default function LoginHistoryTab() {
  const router = useRouter();
  const [form, setForm] = useState<Omit<LoginHistoryFilter, "page">>({});
  const [filter, setFilter] = useState<LoginHistoryFilter>({ page: 1 });
  // 응답이 어떤 조건(key)에 대한 것인지 함께 둔다. 조건과 응답의 key 가 다르면 불러오는 중이다.
  const [result, setResult] = useState<{ key: string; data?: LoginHistoryPage; error?: string }>({ key: "" });
  const [formError, setFormError] = useState("");
  const key = JSON.stringify(filter);
  const loading = result.key !== key;
  const data = result.data ?? null;
  const error = formError || (loading ? "" : (result.error ?? ""));

  useEffect(() => {
    let alive = true;
    loadLoginHistory(filter)
      .then((page) => alive && setResult({ key, data: page }))
      .catch((cause) => {
        if (!alive) {
          return;
        }
        if (cause instanceof MemberAuthError) {
          router.replace("/login?next=/mypage");
          return;
        }
        setResult({ key, error: cause instanceof Error ? cause.message : "로그인 기록을 불러오지 못했습니다." });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key 가 filter 를 그대로 나타낸다
  }, [key, router]);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.from && form.to && form.from > form.to) {
      setFormError("시작일이 종료일보다 늦을 수 없습니다.");
      return;
    }
    setFormError("");
    setFilter({ ...form, page: 1 });
  };

  return (
    <section className="surface mypage-section">
      <h2>로그인 기록</h2>
      <p className="meta">내 계정에 로그인한 기록이에요. 모르는 기기가 있으면 비밀번호를 바꿔 주세요.</p>
      <form className="login-history-filter" onSubmit={search}>
        <label className="field">
          <span>결과</span>
          <select
            value={form.result ?? ""}
            onChange={(e) =>
              setForm({ ...form, result: (e.target.value || undefined) as LoginHistoryFilter["result"] })
            }
          >
            <option value="">전체</option>
            <option value="success">성공</option>
            <option value="failure">실패</option>
          </select>
        </label>
        <label className="field">
          <span>시작일</span>
          <input type="date" value={form.from ?? ""} onChange={(e) => setForm({ ...form, from: e.target.value })} />
        </label>
        <label className="field">
          <span>종료일</span>
          <input type="date" value={form.to ?? ""} onChange={(e) => setForm({ ...form, to: e.target.value })} />
        </label>
        <button type="submit" className="ghost-btn" disabled={loading}>
          조회
        </button>
      </form>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading && <p aria-live="polite">로그인 기록을 불러오고 있어요.</p>}

      {data && !loading && data.items.length === 0 && !error && (
        <div className="empty">조건에 맞는 로그인 기록이 없어요.</div>
      )}

      {data && data.items.length > 0 && (
        <>
          <p className="meta">총 {data.total}건</p>
          <ul className="login-history-list">
            {data.items.map((item) => (
              <li key={item.id} className={item.result}>
                <span className="badge">{item.result === "success" ? "성공" : "실패"}</span>
                <span className="when">{timeFormat.format(new Date(item.createdAt))}</span>
                <span className="device">{deviceLabel(item.userAgent)}</span>
                {item.reason && <span className="reason">{REASON_LABEL[item.reason] ?? item.reason}</span>}
              </li>
            ))}
          </ul>
          <nav className="login-history-pager" aria-label="로그인 기록 페이지">
            <button
              type="button"
              className="ghost-btn"
              disabled={loading || data.page <= 1}
              onClick={() => setFilter({ ...filter, page: data.page - 1 })}
            >
              이전
            </button>
            <span>
              {data.page} / {Math.max(data.totalPages, 1)}
            </span>
            <button
              type="button"
              className="ghost-btn"
              disabled={loading || data.page >= data.totalPages}
              onClick={() => setFilter({ ...filter, page: data.page + 1 })}
            >
              다음
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
