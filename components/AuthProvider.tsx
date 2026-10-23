"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { userStore } from "@/infrastructure/browser/profile-store";
import { memberTokenStore } from "@/infrastructure/browser/member-token";
import { loginMember, logoutMember, signupMember, type Member } from "@/features/member/client";
import { type Address, type UserProfile } from "@/modules/profile/types";

import {
  loginProfile,
  addProfileAddress,
  updateProfileAddress,
  removeProfileAddress,
  setDefaultProfileAddress,
} from "@/modules/profile/operations";

interface AuthContextValue {
  user: UserProfile | null;
  /** FastAPI 회원 토큰이 있을 때만 로그인 상태다 */
  isLoggedIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: { email: string; password: string; name: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<UserProfile, "name" | "email" | "phone">>) => void;
  addAddress: (input: Omit<Address, "id">) => void;
  updateAddress: (id: string, patch: Partial<Omit<Address, "id">>) => void;
  removeAddress: (id: string) => void;
  setDefaultAddress: (id: string) => void;
  setPreferences: (patch: { preferredCategories?: string[]; excludedAllergens?: string[] }) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const user = useSyncExternalStore(userStore.subscribe, userStore.getSnapshot, userStore.getServerSnapshot);
  const token = useSyncExternalStore(
    memberTokenStore.subscribe,
    memberTokenStore.getSnapshot,
    memberTokenStore.getServerSnapshot,
  );

  const login = useCallback(async (email: string, password: string) => {
    const member: Member = await loginMember(email, password);
    const current = userStore.getSnapshot();
    // 다른 회원이 같은 브라우저로 로그인하면 이전 회원의 주소·취향을 이어받지 않는다
    const previous = current?.email === member.email ? current : null;
    const profile = loginProfile(previous, { name: member.name, email: member.email, provider: "email" });
    userStore.set({ ...profile, phone: profile.phone || member.phone || "" });
  }, []);

  const signup = useCallback(
    async (input: { email: string; password: string; name: string; phone?: string }) => {
      await signupMember(input);
      await login(input.email, input.password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    await logoutMember();
    const current = userStore.getSnapshot();
    if (current) {
      userStore.set({ ...current, loggedIn: false });
    }
  }, []);

  const updateProfile = useCallback((patch: Partial<Pick<UserProfile, "name" | "email" | "phone">>) => {
    const current = userStore.getSnapshot();
    if (current) {
      userStore.set({ ...current, ...patch });
    }
  }, []);

  const addAddress = useCallback((input: Omit<Address, "id">) => {
    const current = userStore.getSnapshot();
    if (!current) {
      return;
    }
    userStore.set(addProfileAddress(current, { ...input, id: crypto.randomUUID() }));
  }, []);

  const updateAddress = useCallback((id: string, patch: Partial<Omit<Address, "id">>) => {
    const current = userStore.getSnapshot();
    if (!current) {
      return;
    }
    userStore.set(updateProfileAddress(current, id, patch));
  }, []);

  const removeAddress = useCallback((id: string) => {
    const current = userStore.getSnapshot();
    if (!current) {
      return;
    }
    userStore.set(removeProfileAddress(current, id));
  }, []);

  const setDefaultAddress = useCallback((id: string) => {
    const current = userStore.getSnapshot();
    if (!current) {
      return;
    }
    userStore.set(setDefaultProfileAddress(current, id));
  }, []);

  const setPreferences = useCallback((patch: { preferredCategories?: string[]; excludedAllergens?: string[] }) => {
    const current = userStore.getSnapshot();
    if (current) {
      userStore.set({ ...current, ...patch });
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoggedIn: !!token && !!user?.loggedIn,
      login,
      signup,
      logout,
      updateProfile,
      addAddress,
      updateAddress,
      removeAddress,
      setDefaultAddress,
      setPreferences,
    }),
    [
      user,
      token,
      login,
      signup,
      logout,
      updateProfile,
      addAddress,
      updateAddress,
      removeAddress,
      setDefaultAddress,
      setPreferences,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
