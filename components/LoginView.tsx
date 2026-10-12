"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeading from "./PageHeading";
import { useAuth } from "./AuthProvider";
import { useToast } from "./ToastProvider";
import { GoogleIcon } from "./icons/BrandMarks";
import { safeReturnPath } from "@/modules/shared/return-path";

export default function LoginView() {
  const { isLoggedIn, login } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const next = safeReturnPath(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (isLoggedIn) {
      router.replace(next);
    }
  }, [isLoggedIn, router, next]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      return;
    }
    login({ name: email.split("@")[0] || "손님", email: email.trim(), provider: "email" });
    toast("로그인되었습니다");
    router.push(next);
  };

  const googleLogin = () => {
    login({ name: "구글 사용자", email: "google@example.com", provider: "google" });
    toast("구글 계정으로 로그인되었습니다");
    router.push(next);
  };

  if (isLoggedIn) {
    return null;
  }

  return (
    <main className="wrap auth-wrap">
      <div className="auth-card">
        <span className="eyebrow">YOUR DAILY BOWL</span>
        <PageHeading>로그인</PageHeading>
        <form onSubmit={submit}>
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
              minLength={1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="primary full form-btn">
            로그인
          </button>
        </form>
        <div className="auth-divider">
          <span>또는</span>
        </div>
        <button type="button" className="social-btn social-google form-btn full" onClick={googleLogin}>
          <GoogleIcon />
          구글로 시작하기
        </button>
      </div>
    </main>
  );
}
