"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { notifyCatalogSaved } from "@/components/CustomerCatalogProvider";
import type { Catalog, Snapshot } from "@/lib/admin/catalog";
import { request } from "@/lib/admin/request";

export function useAdminCatalog(pollReviews: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const accept = useCallback(
    (next: Snapshot) =>
      setSnapshot((current) =>
        !current || next.revision >= current.revision ? next : current,
      ),
    [],
  );
  const load = useCallback(async () => {
    setLoadError("");
    try {
      accept(await request("/api/admin/catalog"));
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "데이터를 불러오지 못했습니다.",
      );
    }
  }, [accept]);
  useEffect(() => {
    const controller = new AbortController();
    void request("/api/admin/catalog", { signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) accept(next);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      });
    return () => controller.abort();
  }, [accept]);
  useEffect(() => {
    if (!pollReviews || busy) return;
    const controller = new AbortController();
    let pending = false;
    const timer = setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await request("/api/admin/catalog", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) accept(next);
      } catch {
        /* 다음 주기에 재확인한다. */
      } finally {
        pending = false;
      }
    }, 3000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [pollReviews, busy, accept]);
  const save = async (
    catalog: Catalog,
    successMessage = "변경 내용을 저장했습니다.",
  ) => {
    if (!snapshot || saving.current)
      throw Error("다른 저장이 끝난 뒤 다시 시도해주세요.");
    saving.current = true;
    setBusy(true);
    try {
      accept(
        await request("/api/admin/catalog", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ catalog, revision: snapshot.revision }),
        }),
      );
      notifyCatalogSaved();
      toast.success(successMessage);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const action = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "요청을 처리하지 못했습니다.",
      );
    }
  };
  return { snapshot, busy, loadError, load, save, action };
}
