"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/admin/button";
import { Input } from "@/components/admin/input";
import {
  eventSchema,
  eventStatus,
  eventStatusLabel,
  type EventSnapshot,
  type ManagedEvent,
  type EventStatus,
} from "@/modules/events/schema";
import { kstDate } from "@/modules/shared/time";
import { Photo, Upload } from "./EditorFields";

async function api(init?: RequestInit): Promise<EventSnapshot> {
  const response = await fetch("/api/admin/events", { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.message || body.error || "이벤트를 불러오지 못했습니다.");
  }
  return body;
}

export default function EventManager() {
  const [snapshot, setSnapshot] = useState<EventSnapshot | null>(null);
  const [draft, setDraft] = useState<ManagedEvent | null>(null);
  const [filter, setFilter] = useState<"all" | EventStatus>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const load = async () => {
    setBusy(true);
    setError("");
    try {
      setSnapshot(await api());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    api({ signal: controller.signal })
      .then(setSnapshot)
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
        }
      });
    return () => controller.abort();
  }, []);
  const save = async (events: ManagedEvent[]) => {
    if (!snapshot) {
      return false;
    }
    setBusy(true);
    setError("");
    try {
      setSnapshot(
        await api({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events, revision: snapshot.revision }),
        }),
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const update = (patch: Partial<ManagedEvent>) => setDraft((value) => value && { ...value, ...patch });
  const events = snapshot?.events ?? [];
  const filtered = events.filter(
    (event) =>
      (filter === "all" || eventStatus(event) === filter) &&
      (event.title + " " + event.description).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THIS MONTH’S EVENT</div>
          <h1>이달의 이벤트 관리</h1>
          <p className="muted">이벤트 이미지와 기간을 관리하세요. 현재 고객 화면에는 연결되지 않습니다.</p>
        </div>
        <Button
          disabled={!snapshot || busy || uploading || !!draft}
          onClick={() => {
            setError("");
            setDraft({
              id: crypto.randomUUID(),
              title: "",
              description: "",
              startDate: kstDate(Date.now()),
              endDate: kstDate(Date.now()),
              image: "",
              mobileImage: "",
              alt: "",
              href: "",
              visible: true,
            });
          }}
        >
          + 이벤트 추가
        </Button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="event-toolbar">
        <div>
          {(["all", "ongoing", "scheduled", "ended"] as const).map((value) => (
            <Button key={value} variant={filter === value ? "default" : "secondary"} onClick={() => setFilter(value)}>
              {value === "all" ? "전체" : eventStatusLabel[value]}
            </Button>
          ))}
        </div>
        <Input
          aria-label="이벤트 검색"
          placeholder="이벤트 제목·내용 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button variant="secondary" disabled={busy || uploading} onClick={load}>
          최신 목록 불러오기
        </Button>
      </div>
      {draft && (
        <section className="surface">
          <h2>{events.some((event) => event.id === draft.id) ? "이벤트 수정" : "이벤트 추가"}</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const result = eventSchema.safeParse(draft);
              if (!result.success) {
                setError(result.error.issues[0]?.message || "입력 내용을 확인해주세요.");
                return;
              }
              const next = events.some((event) => event.id === draft.id)
                ? events.map((event) => (event.id === draft.id ? result.data : event))
                : [...events, result.data];
              if (await save(next)) {
                setDraft(null);
              }
            }}
          >
            <fieldset disabled={busy || uploading} className="event-form-grid">
              <label>
                이벤트 제목
                <Input
                  required
                  maxLength={200}
                  value={draft.title}
                  onChange={(e) => update({ title: e.target.value })}
                />
              </label>
              <label>
                노출 설정
                <select value={String(draft.visible)} onChange={(e) => update({ visible: e.target.value === "true" })}>
                  <option value="true">노출</option>
                  <option value="false">숨김</option>
                </select>
              </label>
              <label>
                시작일
                <Input
                  required
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => update({ startDate: e.target.value })}
                />
              </label>
              <label>
                종료일
                <Input
                  required
                  type="date"
                  min={draft.startDate}
                  value={draft.endDate}
                  onChange={(e) => update({ endDate: e.target.value })}
                />
              </label>
              <label className="event-wide">
                소개 내용
                <textarea
                  maxLength={2000}
                  value={draft.description}
                  onChange={(e) => update({ description: e.target.value })}
                />
              </label>
              <div>
                PC 이벤트 이미지
                <Upload value={draft.image} onChange={(image) => update({ image })} onBusy={setUploading} />
              </div>
              <div>
                모바일 이벤트 이미지
                <Upload
                  value={draft.mobileImage}
                  onChange={(mobileImage) => update({ mobileImage })}
                  onBusy={setUploading}
                />
                <p className="meta">미등록 시 PC 이미지를 사용할 수 있습니다.</p>
              </div>
              <label>
                이미지 설명
                <Input maxLength={300} value={draft.alt} onChange={(e) => update({ alt: e.target.value })} />
              </label>
              <label>
                이동 주소 (선택)
                <Input placeholder="/menu" value={draft.href} onChange={(e) => update({ href: e.target.value })} />
              </label>
            </fieldset>
            <p className="meta">기간은 한국 시간 기준이며 종료일까지 진행 중으로 표시됩니다.</p>
            <div className="event-actions">
              <Button type="submit" disabled={busy || uploading}>
                {busy ? "저장 중…" : "이벤트 저장"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || uploading}
                onClick={() => {
                  setDraft(null);
                  setError("");
                }}
              >
                취소
              </Button>
            </div>
          </form>
        </section>
      )}
      <section className="surface">
        <p className="meta">총 {filtered.length}건 · 위에서부터 표시 순서</p>
        {!snapshot ? (
          <p>{error ? "목록을 다시 불러와주세요." : "이벤트를 불러오는 중입니다…"}</p>
        ) : !filtered.length ? (
          <p className="muted">등록된 이벤트가 없습니다.</p>
        ) : (
          filtered.map((event) => {
            const index = events.findIndex((item) => item.id === event.id);
            return (
              <article className="admin-event-row" key={event.id}>
                <Photo src={event.image} name={event.alt || event.title} />
                <div>
                  <span className="badge">
                    {eventStatusLabel[eventStatus(event)]} · {event.visible ? "노출" : "숨김"}
                  </span>
                  <h3>{event.title}</h3>
                  <p>
                    {event.startDate} ~ {event.endDate}
                  </p>
                  <p className="muted">{event.description}</p>
                  <div className="event-actions">
                    <Button variant="secondary" disabled={busy || !!draft} onClick={() => setDraft({ ...event })}>
                      수정
                    </Button>
                    <Button
                      variant="secondary"
                      aria-label={`${event.title} 위로 이동`}
                      disabled={busy || !!draft || index === 0}
                      onClick={() => {
                        const next = [...events];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        void save(next);
                      }}
                    >
                      위로
                    </Button>
                    <Button
                      variant="secondary"
                      aria-label={`${event.title} 아래로 이동`}
                      disabled={busy || !!draft || index === events.length - 1}
                      onClick={() => {
                        const next = [...events];
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        void save(next);
                      }}
                    >
                      아래로
                    </Button>
                    <Button variant="ghost" disabled={busy || !!draft} onClick={() => setDeleting(event.id)}>
                      삭제
                    </Button>
                  </div>
                  {deleting === event.id && (
                    <div role="alert">
                      <p>이 이벤트를 삭제할까요?</p>
                      <Button
                        disabled={busy}
                        onClick={async () => {
                          if (await save(events.filter((item) => item.id !== event.id))) {
                            setDeleting(null);
                          }
                        }}
                      >
                        삭제 확인
                      </Button>
                      <Button variant="ghost" disabled={busy} onClick={() => setDeleting(null)}>
                        취소
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
    </>
  );
}
