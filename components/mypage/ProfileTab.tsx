"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../AuthProvider";
import { useToast } from "../ToastProvider";

export default function ProfileTab() {
  const { user, updateProfile, logout } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");

  if (!user) {
    return null;
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // 이메일은 로그인 계정(FastAPI)이라 여기서 바꾸지 않는다
    updateProfile({ name: name.trim() || user.name, phone: phone.trim() });
    toast("프로필을 저장했어요");
  };

  return (
    <section className="surface mypage-section">
      <h2>기본 정보</h2>
      <p className="meta">{user.provider === "email" ? "이메일로 가입" : "구글로 가입"}</p>
      <form onSubmit={submit} className="mypage-form">
        <label className="field">
          <span>이름</span>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>연락처</span>
          <input value={phone} maxLength={20} placeholder="010-0000-0000" onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="field">
          <span>로그인 이메일</span>
          <input type="email" value={user.email} readOnly aria-readonly="true" />
        </label>
        <div className="form-actions-stack">
          <button type="submit" className="primary full form-btn">
            정보 저장
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
