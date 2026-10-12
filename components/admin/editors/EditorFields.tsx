"use client";
import Image from "next/image";
import { Button } from "@/components/admin/button";
import { Input } from "@/components/admin/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/admin/select";
import { request } from "@/features/admin/request";
import { Image as ImageIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
export function Picker({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  label: string;
}) {
  return (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
      <SelectTrigger aria-label={label} className="select-field">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, t]) => (
          <SelectItem value={v || "none"} key={v || "none"}>
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function Photo({ src, name, className = "" }: { src: string; name: string; className?: string }) {
  return src ? (
    <Image unoptimized width={1024} height={1024} className={"photo " + className} src={src} alt={name} />
  ) : (
    <div className={"photo photo-empty " + className}>
      <ImageIcon aria-hidden="true" />
      <span>이미지 없음</span>
    </div>
  );
}

export function Upload({
  value,
  onChange,
  onBusy,
}: {
  value: string;
  onChange: (v: string) => void;
  onBusy?: (v: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const busyCallback = useRef(onBusy);
  const changeCallback = useRef(onChange);
  useEffect(() => {
    busyCallback.current = onBusy;
    changeCallback.current = onChange;
  }, [onBusy, onChange]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (active.current) {
        active.current.abort();
        active.current = null;
        busyCallback.current?.(false);
      }
    };
  }, []);
  return (
    <div>
      <Photo src={value} name="등록 이미지" className="upload-photo" />
      <Input
        type="file"
        aria-label="이미지 업로드"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file || active.current) {
            return;
          }
          e.target.value = "";
          if (file.size > 5 * 1024 * 1024) {
            setError("5MB 이하의 이미지를 선택해주세요.");
            return;
          }
          setError("");
          setBusy(true);
          busyCallback.current?.(true);
          const controller = new AbortController();
          active.current = controller;
          let timedOut = false;
          const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, 30_000);
          try {
            const form = new FormData();
            form.append("file", file);
            const result = await request<{ url: string }>("/api/admin/images", {
              method: "POST",
              body: form,
              signal: controller.signal,
            });
            if (!mounted.current || controller.signal.aborted) {
              return;
            }
            if (
              typeof result.url !== "string" ||
              !/^\/api\/admin\/images\/[a-zA-Z0-9_-]+\.(png|jpg|webp)$/.test(result.url)
            ) {
              throw new Error("업로드 결과를 확인할 수 없습니다. 다시 시도해주세요.");
            }
            changeCallback.current(result.url);
            toast.success("이미지를 올렸습니다. 저장하면 메뉴에 적용됩니다.");
          } catch (e) {
            if (mounted.current) {
              setError(
                controller.signal.aborted
                  ? timedOut
                    ? "업로드 시간이 초과되었습니다. 다시 시도해주세요."
                    : "업로드를 취소했습니다."
                  : (e as Error).message,
              );
            }
          } finally {
            clearTimeout(timer);
            if (active.current === controller) {
              active.current = null;
            }
            if (mounted.current) {
              setBusy(false);
              busyCallback.current?.(false);
            }
          }
        }}
      />
      <div className="meta">{busy ? "이미지를 올리는 중입니다…" : "PNG · JPEG · WebP / 최대 5MB"}</div>
      {busy && (
        <Button type="button" variant="outline" size="sm" onClick={() => active.current?.abort()}>
          업로드 취소
        </Button>
      )}
      {value && (
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onChange("")}>
          이미지 제거
        </Button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
