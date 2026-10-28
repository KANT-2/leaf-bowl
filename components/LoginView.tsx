"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeading from "./PageHeading";
import { useAuth } from "./AuthProvider";
import { useToast } from "./ToastProvider";
import { safeReturnPath } from "@/modules/shared/return-path";

/** FastAPI 회원 비밀번호 규칙과 같다 (backend customers/domain/customer.py) */
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;

export default function LoginView() {
  const { isLoggedIn, login, signup } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const next = safeReturnPath(useSearchParams().get("next"));
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signingUp = mode === "signup";

  useEffect(() => {
    if (isLoggedIn) {
      router.replace(next);
    }
  }, [isLoggedIn, router, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !email.trim() || !password) {
      return;
    }
    if (signingUp && !PASSWORD_RULE.test(password)) {
      setError("비밀번호는 영문과 숫자를 모두 포함해 8~64자로 입력해주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (signingUp) {
        await signup({ email: email.trim(), password, name: name.trim(), phone: phone.trim() || undefined });
        toast("회원가입이 완료되었습니다");
      } else {
        await login(email.trim(), password);
        toast("로그인되었습니다");
      }
      router.push(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  if (isLoggedIn) {
    return null;
  }

  return (
    <main className="wrap auth-wrap">
      <div className="auth-card">
        <span className="eyebrow">YOUR DAILY BOWL</span>
        <PageHeading>{signingUp ? "회원가입" : "로그인"}</PageHeading>
        <form onSubmit={submit} aria-busy={busy}>
          {signingUp && (
            <label className="field">
              <span>이름</span>
              <input
                required
                maxLength={50}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                autoComplete="name"
              />
            </label>
          )}
          <label className="field">
            <span>이메일</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>비밀번호</span>
            <input
              type="password"
              required
              minLength={signingUp ? 8 : 1}
              maxLength={64}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={signingUp ? "영문+숫자 8~64자" : "비밀번호"}
              autoComplete={signingUp ? "new-password" : "current-password"}
            />
          </label>
          {signingUp && (
            <label className="field">
              <span>연락처 (선택)</span>
              <input
                type="tel"
                maxLength={20}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-0000-0000"
                autoComplete="tel"
              />
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="primary full form-btn" disabled={busy}>
            {busy ? "처리 중…" : signingUp ? "회원가입" : "로그인"}
          </button>
        </form>
        <div className="auth-divider">
          <span>{signingUp ? "이미 회원이신가요?" : "처음 오셨나요?"}</span>
        </div>
        <button
          type="button"
          className="ghost-btn form-btn full"
          disabled={busy}
          onClick={() => {
            setMode(signingUp ? "login" : "signup");
            setError("");
          }}
        >
          {signingUp ? "로그인하기" : "이메일로 회원가입"}
        </button>
      </div>
    </main>
  );
}
