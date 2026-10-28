"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/admin/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/admin/select";
import { Textarea } from "@/components/admin/textarea";
import { nextStatuses, STATUS_LABEL, type OrderStatus } from "@/modules/orders/status";

interface Props {
  id: string;
  status: OrderStatus;
  version: number;
  onUpdated: () => void;
}

export default function OrderStatusEditor({ id, status, version, onUpdated }: Props) {
  const options = nextStatuses(status).filter((value) => value !== "canceled");
  const [next, setNext] = useState<OrderStatus | "">(options[0] ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !next) {
      return;
    }

    submitting.current = true;
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
      submitting.current = false;
      setSaving(false);
    }
  }

  if (options.length === 0) {
    return <p className="meta">더 이상 변경할 수 없는 주문 상태입니다.</p>;
  }

  return (
    <section className="delivery-status-editor" aria-label="주문 상태 변경">
      <form onSubmit={submit} className="grid gap-3">
        <label className="grid gap-1 text-sm">
          다음 상태
          <Select value={next} disabled={saving || conflict} onValueChange={(value) => setNext(value as OrderStatus)}>
            <SelectTrigger className="admin-filter-select" aria-label="다음 주문 상태">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((value) => (
                <SelectItem key={value} value={value}>
                  {STATUS_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
