"use client";

import { useTransition } from "react";
import StatusFeedback from "@/components/controls/StatusFeedback";

export default function EventError({ retry }: { retry: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <main className="wrap ev-wrap">
      <StatusFeedback title="이벤트를 불러오지 못했어요" error>
        <p>잠시 후 다시 시도해주세요.</p>
        <button className="ghost-btn ev-reset" type="button" disabled={pending} onClick={() => startTransition(retry)}>
          {pending ? "다시 불러오는 중…" : "다시 시도"}
        </button>
      </StatusFeedback>
    </main>
  );
}
