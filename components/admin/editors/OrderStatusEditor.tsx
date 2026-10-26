"use client";

import { useState } from "react";
import { Button } from "@/components/admin/button";
import { Textarea } from "@/components/admin/textarea";
import { nextStatuses, STATUS_LABEL, type OrderStatus } from "@/modules/orders/status";

interface Props {
  id: string;
  status: OrderStatus;
  version: number;
  onUpdated: () => void;
}

export default function OrderStatusEditor({ id, status, version, onUpdated }: Props) {
  const options = nextStatuses(status);
  const [next, setNext] = useState<OrderStatus | "">(options[0] ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !next) {
      return;
    }

    setSaving(true);
    setMessage("");
    setConflict(false);

    try {
      const response = await fetch(`/api/v1/admin/orders/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: next,
          version,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });

      if (response.status === 409) {
        setConflict(true);
        setMessage("주문 정보가 변경되었습니다. 최신 정보를 다시 조회해주세요.");
        return;
      }

      if (!response.ok) {
        setMessage(response.status === 401 ? "관리자 로그인이 필요합니다." : "주문 상태를 변경하지 못했습니다.");
        return;
      }

      onUpdated();
    } catch {
      setMessage("서버 연결에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (options.length === 0) {
    return <p className="meta">더 이상 변경할 수 없는 주문 상태입니다.</p>;
  }

  return (
    <section className="mt-5 border-t pt-4" aria-label="주문 상태 변경">
      <h3 className="mb-3 font-semibold">주문 상태 변경</h3>

      <p className="meta mb-3">
        현재 상태: {STATUS_LABEL[status]} · 버전 {version}
      </p>

      <form onSubmit={submit} className="grid gap-3">
        <label className="grid gap-1 text-sm">
          다음 상태
          <select
            className="h-10 rounded-md border border-input bg-background px-3"
            value={next}
            disabled={saving || conflict}
            onChange={(event) => setNext(event.target.value as OrderStatus)}
          >
            {options.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          변경 사유 (선택)
          <Textarea
            value={reason}
            maxLength={200}
            rows={3}
            disabled={saving || conflict}
            placeholder="변경 사유를 입력해주세요."
            onChange={(event) => setReason(event.target.value)}
          />
        </label>

        <Button type="submit" disabled={saving || conflict || !next}>
          {saving ? "저장 중…" : "상태 변경 저장"}
        </Button>

        {message && (
          <p role="alert" className="text-sm">
            {message}
          </p>
        )}

        {conflict && (
          <Button type="button" variant="outline" onClick={onUpdated}>
            최신 주문 다시 조회
          </Button>
        )}
      </form>
    </section>
  );
}
