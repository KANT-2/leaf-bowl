"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { userStore } from "@/infrastructure/browser/profile-store";
import { type Address, type AuthProvider as Provider, type UserProfile } from "@/modules/profile/types";

import {
  loginProfile,
  addProfileAddress,
  updateProfileAddress,
  removeProfileAddress,
  setDefaultProfileAddress,
} from "@/modules/profile/operations";

interface AuthContextValue {
  user: UserProfile | null;
  isLoggedIn: boolean;
  login: (input: { name: string; email: string; provider: Provider }) => void;
  logout: () => void;
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

  const login = useCallback((input: { name: string; email: string; provider: Provider }) => {
    const current = userStore.getSnapshot();
    userStore.set(loginProfile(current, input));
  }, []);

  const logout = useCallback(() => {
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
      isLoggedIn: !!user?.loggedIn,
      login,
      logout,
      updateProfile,
      addAddress,
      updateAddress,
      removeAddress,
      setDefaultAddress,
      setPreferences,
    }),
    [user, login, logout, updateProfile, addAddress, updateAddress, removeAddress, setDefaultAddress, setPreferences],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
