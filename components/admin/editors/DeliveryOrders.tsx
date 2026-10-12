"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/admin/button";
import { Input } from "@/components/admin/input";
import { STATUS_LABEL, type OrderStatus } from "@/modules/orders/status";
import { kstDate } from "@/modules/shared/time";

interface DeliveryOrder {
  id: string;
  status: OrderStatus;
  ordererName: string;
  phone: string;
  address: string;
  addressDetail: string;
  desiredDate: string;
  desiredSlot: string;
  createdAt: string;
  total: string;
  items: { name: string; options: string; quantity: number }[];
}
const receivedTime = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));

export default function DeliveryOrders() {
  const [date, setDate] = useState("");
  return (
    <section className="surface">
      <div className="section-heading">
        <h2>배달 관리</h2>
        <span className="pill">고객 주문 연동</span>
      </div>
      <p className="muted">
        배달 날짜별로 묶고, 각 날짜 안에서는 최근 접수한 주문부터 표시합니다. 시간은 한국 시간 기준입니다.
      </p>
      <div className="delivery-filters">
        <Button type="button" variant={date ? "outline" : "default"} onClick={() => setDate("")}>
          전체 날짜
        </Button>
        <Button type="button" variant="outline" onClick={() => setDate(kstDate(Date.now()))}>
          오늘 배달
        </Button>
        <label className="field">
          배달 날짜
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <OrderList key={date} date={date} />
    </section>
  );
}

function OrderList({ date }: { date: string }) {
  const [hour, setHour] = useState("");
  return (
    <>
      {date && (
        <div className="delivery-hours" role="group" aria-label="배달 시간대 선택">
          <Button type="button" variant={hour === "" ? "default" : "outline"} onClick={() => setHour("")}>
            전체 시간
          </Button>
          {Array.from({ length: 24 }, (_, h) => (
            <Button
              key={h}
              type="button"
              variant={hour === String(h) ? "default" : "outline"}
              aria-pressed={hour === String(h)}
              onClick={() => setHour(String(h))}
            >
              {String(h).padStart(2, "0")}:00–{String(h + 1).padStart(2, "0")}:00
            </Button>
          ))}
        </div>
      )}
      <Results key={hour} date={date} hour={hour} />
    </>
  );
}

function Results({ date, hour }: { date: string; hour: string }) {
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [more, setMore] = useState(false);
  const [pages, setPages] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const collected: DeliveryOrder[] = [];
        let cursor: string | null = null;
        for (let p = 0; p < pages; p++) {
          const params = new URLSearchParams({ limit: "50" });
          if (date) {
            params.set("deliveryDate", date);
          }
          if (hour !== "") {
            params.set("deliveryHour", hour);
          }
          if (cursor) {
            params.set("cursor", cursor);
          }
          const response = await fetch(`/api/v1/admin/orders?${params}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(
              response.status === 401 || response.status === 403
                ? "관리자 로그인이 필요합니다."
                : "배달 주문을 불러오지 못했습니다. 다시 시도해주세요.",
            );
          }
          const data = await response.json();
          collected.push(...data.items);
          cursor = data.nextCursor;
          if (!cursor) {
            break;
          }
        }
        if (controller.signal.aborted) {
          return;
        }
        setOrders(collected);
        setMore(!!cursor);
        setUpdated(receivedTime(new Date().toISOString()));
        setError("");
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "조회에 실패했습니다.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(load, 30000);
        }
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [date, hour, pages, refresh]);
  const groups = new Map<string, DeliveryOrder[]>();
  for (const order of orders) {
    groups.set(order.desiredDate, [...(groups.get(order.desiredDate) ?? []), order]);
  }
  return (
    <>
      <div className="section-heading">
        <p className="meta" aria-live="polite">
          {loading ? "주문 불러오는 중…" : `${orders.length}건 표시 · 30초마다 자동 갱신`}
          {updated && ` · 갱신 ${updated}`}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setRefresh((v) => v + 1);
          }}
        >
          새로고침
        </Button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && !orders.length && <p className="muted">선택한 조건에 해당하는 배달 주문이 없습니다.</p>}
      {[...groups].map(([day, rows]) => (
        <section key={day} className="delivery-day" aria-label={`${day} 배달 주문`}>
          <div className="section-heading">
            <h3>{day.replaceAll("-", ".")} 배달</h3>
            <span className="pill">{rows.length}건</span>
          </div>
          {rows.map((order) => (
            <article key={order.id} className="delivery-order">
              <div className="section-heading">
                <strong>
                  {order.ordererName} · {order.phone}
                </strong>
                <span className="pill">{STATUS_LABEL[order.status]}</span>
              </div>
              <p>
                <strong>배달 예정 {order.desiredSlot}</strong>
              </p>
              <p className="meta">
                접수 <time dateTime={order.createdAt}>{receivedTime(order.createdAt)}</time> · 주문번호 {order.id}
              </p>
              <p>
                배달 주소: {order.address} {order.addressDetail}
              </p>
              <ul>
                {order.items.map((item, i) => (
                  <li key={i}>
                    <strong>
                      {item.name} × {item.quantity}
                    </strong>
                    {item.options && <span className="meta"> · {item.options}</span>}
                  </li>
                ))}
              </ul>
              <p>결제 금액 {Number(order.total).toLocaleString("ko-KR")}원</p>
            </article>
          ))}
        </section>
      ))}
      {more && (
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            setPages((v) => v + 1);
          }}
        >
          이전 주문 더 보기
        </Button>
      )}
    </>
  );
}
