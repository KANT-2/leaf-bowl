"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Snapshot } from "@/lib/admin/catalog";
import { customerCatalog, type CustomerCatalog } from "@/lib/customer/catalog";
const Context = createContext<CustomerCatalog | null>(null);
export function useCustomerCatalog() {
  const context = useContext(Context);
  if (!context) throw new Error("CustomerCatalogProvider is required");
  return context;
}
export function notifyCatalogSaved() {
  try {
    localStorage.setItem("catalog-updated", String(Date.now()));
  } catch {}
  window.dispatchEvent(new Event("catalog-saved"));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel("catalog-updated");
    channel.postMessage("saved");
    channel.close();
  }
}
export default function CustomerCatalogProvider({
  initial,
  children,
}: {
  initial: Snapshot;
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  useEffect(() => {
    let disposed = false,
      loading = false;
    const controller = new AbortController();
    async function refresh() {
      if (loading || document.hidden) return;
      loading = true;
      try {
        const response = await fetch("/api/catalog", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const next: Snapshot = await response.json();
        if (!next.catalog || !Number.isInteger(next.revision)) return;
        if (!disposed)
          setSnapshot((current) =>
            next.revision > current.revision || next.defaults?.updatedAt !== current.defaults?.updatedAt ? next : current,
          );
      } catch {
      } finally {
        loading = false;
      }
    }
    const channel =
      "BroadcastChannel" in window
        ? new BroadcastChannel("catalog-updated")
        : null;
    channel?.addEventListener("message", refresh);
    const storage = (event: StorageEvent) => {
      if (event.key === "catalog-updated") void refresh();
    };
    window.addEventListener("catalog-saved", refresh);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 3000);
    void refresh();
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(timer);
      channel?.close();
      window.removeEventListener("catalog-saved", refresh);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const value = useMemo(() => customerCatalog(snapshot), [snapshot]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
