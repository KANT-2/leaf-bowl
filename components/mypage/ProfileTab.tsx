"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MemberAuthError, type Member } from "@/features/member/client";
import { useAuth } from "../AuthProvider";
import { useToast } from "../ToastProvider";

export default function ProfileTab() {
  const { user, refreshProfile, updateProfile, logout } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [status, setStatus] = useState<"loading" | "ready" | "saving">("loading");
  const [error, setError] = useState("");

  const showMember = (member: Member) => {
    setName(member.name);
    setPhone(member.phone ?? "");
  };

  const handleError = (cause: unknown) => {
    if (cause instanceof MemberAuthError) {
      toast(cause.message);
      router.replace("/login?next=/mypage");
      return;
    }
    setError(cause instanceof Error ? cause.message : "요청을 처리하지 못했습니다. 다시 시도해주세요.");
  };

  // 다른 기기에서 바꾼 값도 보이도록, 탭을 열 때 서버에 저장된 정보를 다시 불러온다
  useEffect(() => {
    let alive = true;
    refreshProfile()
      .then((member) => alive && showMember(member))
      .catch((cause) => alive && handleError(cause))
      .finally(() => alive && setStatus("ready"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 탭을 열 때 한 번만 불러온다
  }, []);

  if (!user) {
    return null;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    setError("");
    setStatus("saving");
    try {
      // 이메일은 로그인 계정이라 바꾸지 않는다. 전화번호를 비우면 서버에서도 지운다.
      showMember(await updateProfile({ name: name.trim(), phone: phone.trim() }));
      toast("프로필을 저장했어요");
    } catch (cause) {
      handleError(cause);
    } finally {
      setStatus("ready");
    }
  };

  const busy = status !== "ready";

  return (
    <section className="surface mypage-section">
      <h2>기본 정보</h2>
      <p className="meta">{status === "loading" ? "저장된 정보를 불러오는 중…" : "이메일로 가입"}</p>
      <form onSubmit={submit} className="mypage-form" aria-busy={busy}>
        <label className="field">
          <span>이름</span>
          <input
            value={name}
            maxLength={50}
            disabled={busy}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
          />
        </label>
        <label className="field">
          <span>연락처</span>
          <input
            value={phone}
            maxLength={20}
            placeholder="010-0000-0000"
            disabled={busy}
            onChange={(e) => {
              setPhone(e.target.value);
              setError("");
            }}
          />
        </label>
        <label className="field">
          <span>로그인 이메일</span>
          <input type="email" value={user.email} readOnly aria-readonly="true" />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions-stack">
          <button type="submit" className="primary full form-btn" disabled={busy}>
            {status === "saving" ? "저장 중…" : "정보 저장"}
          </button>
          <div className="form-actions-row">
            <button
              type="button"
              className="text-btn"
              onClick={async () => {
                await logout();
                router.push("/");
              }}
            >
              로그아웃
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
