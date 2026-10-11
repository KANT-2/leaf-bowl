"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ordersStore } from "@/lib/orders";
import { money } from "@/lib/products";
import { deliveryWindowKST } from "@/lib/delivery-time";

function formatDay(day: string) {
  const [y, m, d] = day.split("-");
  return y && m && d ? `${y}.${m}.${d}` : day;
}

export default function OrdersTab() {
  const orders = useSyncExternalStore(ordersStore.subscribe, ordersStore.getSnapshot, ordersStore.getServerSnapshot);

  return (
    <section className="surface mypage-section">
      <h2>주문 내역</h2>
      {orders.length ? (
        <ul className="order-list">
          {orders.map((o) => {
            const delivery = o.desiredStartAt && o.desiredEndAt
              ? deliveryWindowKST(o.desiredStartAt, o.desiredEndAt)
              : null;
            return (
            <li key={o.id} className="order-item">
              <div className="order-item-top">
                <strong>{formatDay(delivery?.day ?? o.day ?? "")} · {delivery?.timeLabel ?? o.timeLabel}</strong>
                <span>{money(o.total)}</span>
              </div>
              <p className="meta">{o.address}</p>
              <ul className="order-item-lines">
                {o.items.map((it, i) => (
                  <li key={i}>
                    {it.name}
                    {it.options && <span> · {it.options}</span>}
                    <span> × {it.qty}</span>
                  </li>
                ))}
              </ul>
            </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty">
          아직 주문 내역이 없어요.
          <Link className="ghost-btn" href="/menu">
            메뉴 보러 가기
          </Link>
        </div>
      )}
    </section>
  );
}
