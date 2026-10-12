"use client";
import Link from "next/link";
import { useState } from "react";
import EventPicture from "./EventPicture";
import { eventStatusLabel, type CustomerEvent, type EventStatus } from "@/modules/events/schema";

type Filter = "all" | EventStatus;

const dot = (day: string) => day.replaceAll("-", ".");

function Banner({ event }: { event: CustomerEvent }) {
  if (!event.image) {
    return (
      <div className="ev-photo ev-photo-empty" aria-hidden="true">
        <span>leaf &amp; bowl</span>
      </div>
    );
  }
  // 목록 칸은 가로로 긴 비율이라, 세로로 긴 모바일 배너를 쓰면 위아래가 잘린다. 모바일에서도 PC 이미지를 쓴다.
  return <EventPicture event={event} className="ev-photo" sizes="(max-width: 700px) 100vw, 560px" />;
}

function Row({ event }: { event: CustomerEvent }) {
  const body = (
    <>
      <Banner event={event} />
      <div className="ev-info">
        <span className={`ev-badge is-${event.status}`}>{eventStatusLabel[event.status]}</span>
        <h2>{event.title}</h2>
        {event.description && <p>{event.description}</p>}
        <span className="ev-date">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
          </svg>
          <time dateTime={event.startDate}>{dot(event.startDate)}</time>
          <span aria-hidden="true">–</span>
          <time dateTime={event.endDate}>{dot(event.endDate)}</time>
        </span>
      </div>
      {event.href && (
        <svg className="ev-arrow" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 5 7 7-7 7" />
        </svg>
      )}
    </>
  );
  return (
    <li className={`ev-row${event.status === "ended" ? " is-ended" : ""}`}>
      {event.href ? (
        <Link className="ev-card" href={event.href}>
          {body}
        </Link>
      ) : (
        <div className="ev-card">{body}</div>
      )}
    </li>
  );
}

export default function CustomerEvents({ events }: { events: CustomerEvent[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  // 예정 이벤트가 있을 때만 '예정' 탭을 보여준다.
  const filters: Filter[] = events.some((e) => e.status === "scheduled")
    ? ["all", "ongoing", "scheduled", "ended"]
    : ["all", "ongoing", "ended"];
  const q = query.trim().toLowerCase();
  const shown = events.filter(
    (e) => (filter === "all" || e.status === filter) && (!q || e.title.toLowerCase().includes(q)),
  );
  return (
    <section className="ev" aria-labelledby="ev-title">
      <header className="ev-head">
        <h1 id="ev-title">이달의 이벤트</h1>
        <span className="ev-eyebrow">THIS MONTH’S EVENT</span>
      </header>
      <div className="ev-toolbar">
        <div className="ev-filters" role="group" aria-label="이벤트 상태">
          {filters.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "전체" : eventStatusLabel[f]}
            </button>
          ))}
        </div>
        <label className="ev-search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이벤트 제목 검색"
            aria-label="이벤트 제목 검색"
          />
        </label>
        <span className="ev-count" role="status" aria-live="polite">
          총 {shown.length}건
        </span>
      </div>
      {shown.length ? (
        <ul className="ev-list">
          {shown.map((event) => (
            <Row key={event.id} event={event} />
          ))}
        </ul>
      ) : (
        <p className="ev-empty">
          {events.length
            ? "조건에 맞는 이벤트가 없어요."
            : "지금 준비 중인 이벤트가 없어요. 곧 새로운 소식으로 찾아올게요."}
        </p>
      )}
    </section>
  );
}
