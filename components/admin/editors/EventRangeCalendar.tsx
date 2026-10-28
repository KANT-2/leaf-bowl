"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/admin/button";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

const isoDate = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const fromIso = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const todayInKorea = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const calendarPlacement = (trigger: HTMLButtonElement | null) => {
  const rect = trigger?.getBoundingClientRect();
  if (!rect) {
    return { above: false, end: false, maxHeight: 420 };
  }
  const below = window.innerHeight - rect.bottom - 8;
  const above = rect.top - 8;
  const opensAbove = below < 420 && above > below;
  const popupWidth = Math.min(340, window.innerWidth - 32);
  return {
    above: opensAbove,
    end: rect.left + popupWidth > window.innerWidth - 16,
    maxHeight: Math.min(420, Math.max(80, (opensAbove ? above : below) - 8)),
  };
};

export default function EventRangeCalendar({
  startDate,
  endDate,
  onChange,
  label = "이벤트 기간",
  maxDate,
}: {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
  label?: string;
  maxDate?: string;
}) {
  const calendarId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ above: false, end: false, maxHeight: 420 });
  const [draftStart, setDraftStart] = useState(startDate);
  const [draftEnd, setDraftEnd] = useState(endDate);
  const [awaitingEnd, setAwaitingEnd] = useState(false);
  const [month, setMonth] = useState(() => {
    const date = fromIso(startDate);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const leading = month.getDay();
  const days = new Date(year, monthIndex + 1, 0).getDate();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    const onResize = () => setPlacement(calendarPlacement(trigger.current));
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open]);

  const select = (date: string) => {
    if (!awaitingEnd) {
      setDraftStart(date);
      setDraftEnd(date);
      setAwaitingEnd(true);
    } else {
      setDraftStart(date < draftStart ? date : draftStart);
      setDraftEnd(date < draftStart ? draftStart : date);
      setAwaitingEnd(false);
    }
  };

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (offset === undefined) {
      return;
    }
    event.preventDefault();
    const next = fromIso(date);
    next.setDate(next.getDate() + offset);
    const nextDate = isoDate(next.getFullYear(), next.getMonth(), next.getDate());
    if (maxDate && nextDate > maxDate) {
      return;
    }
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-event-date="${nextDate}"]`)?.focus());
  };

  return (
    <div
      ref={container}
      className="event-range"
      data-side={placement.above ? "top" : "bottom"}
      data-align={placement.end ? "end" : "start"}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <span>{label}</span>
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        className="event-range-trigger"
        aria-label={`${label}: ${startDate}부터 ${endDate}까지`}
        aria-expanded={open}
        aria-controls={calendarId}
        onClick={() => {
          if (!open) {
            const date = fromIso(startDate);
            setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
            setDraftStart(startDate);
            setDraftEnd(endDate);
            setAwaitingEnd(false);
            setPlacement(calendarPlacement(trigger.current));
          }
          setOpen(!open);
        }}
      >
        <CalendarDays size={18} aria-hidden="true" />
        {startDate === endDate ? startDate : `${startDate} ~ ${endDate}`}
      </Button>
      {open && (
        <div
          id={calendarId}
          className="event-range-calendar"
          style={{ maxHeight: placement.maxHeight }}
          role="group"
          aria-label={`${label} 선택 달력`}
        >
          <div className="event-range-month">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="이전 달"
              onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
            >
              <ChevronLeft size={18} />
            </Button>
            <strong aria-live="polite">
              {year}년 {monthIndex + 1}월
            </strong>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="다음 달"
              onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
            >
              <ChevronRight size={18} />
            </Button>
          </div>
          <p className="meta" role="status">
            {awaitingEnd ? "종료일을 선택하세요. 같은 날도 가능합니다." : "시작일을 선택하세요."}
          </p>
          <div className="event-range-grid">
            {weekdays.map((day) => (
              <span key={day} className="event-range-weekday" aria-hidden="true">
                {day}
              </span>
            ))}
            {Array.from({ length: leading }, (_, index) => (
              <span key={`empty-${index}`} />
            ))}
            {Array.from({ length: days }, (_, index) => {
              const date = isoDate(year, monthIndex, index + 1);
              const selected = date === draftStart || date === draftEnd;
              return (
                <button
                  key={date}
                  type="button"
                  data-event-date={date}
                  data-in-range={date >= draftStart && date <= draftEnd}
                  aria-pressed={selected}
                  disabled={!!maxDate && date > maxDate}
                  aria-label={`${year}년 ${monthIndex + 1}월 ${index + 1}일${date === draftStart && date === draftEnd ? ", 시작일과 종료일" : date === draftStart ? ", 시작일" : date === draftEnd ? ", 종료일" : ""}`}
                  onClick={() => select(date)}
                  onKeyDown={(event) => moveFocus(event, date)}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
          <div className="event-range-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const date = todayInKorea();
                const today = fromIso(date);
                setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                setDraftStart(date);
                setDraftEnd(date);
                setAwaitingEnd(false);
              }}
            >
              오늘
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={() => {
                onChange(draftStart, draftEnd);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              적용
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
