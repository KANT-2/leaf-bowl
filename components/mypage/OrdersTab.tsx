"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ordersStore } from "@/infrastructure/browser/legacy-orders";
import { useCustomerCatalog } from "@/components/CustomerCatalogProvider";
import { useReviewableOrderItems } from "@/features/reviews/reviewable-orders";
import { useReviewWrite } from "@/components/ReviewWrite";
import { loadServerOrders, type ServerOrder } from "@/features/orders/client";
import { money } from "@/modules/shared/format";
import { deliveryWindowKST } from "@/modules/delivery/time";

const FALLBACK_IMAGE = "/images/hero-cutout.png";
const statusLabels: Record<string, string> = {
  received: "접수",
  confirmed: "확인",
  preparing: "준비 중",
  delivering: "배달 중",
  completed: "완료",
  canceled: "취소",
};

function formatDay(day: string) {
  const [y, m, d] = day.split("-");
  return y && m && d ? `${y}.${m}.${d}` : day;
}

export default function OrdersTab() {
  const { openWrite } = useReviewWrite();
  const { catalog } = useCustomerCatalog();
  const { items: reviewable } = useReviewableOrderItems();
  const reviewablePids = useMemo(() => new Map(reviewable.map((it) => [it.orderItemId, it.pid])), [reviewable]);
  const imageFor = (productId?: string | null) =>
    (productId && catalog.products.find((p) => p.id === productId)?.image) || FALLBACK_IMAGE;
  const legacy = useSyncExternalStore(ordersStore.subscribe, ordersStore.getSnapshot, ordersStore.getServerSnapshot);
  const [serverOrders, setServerOrders] = useState<ServerOrder[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    loadServerOrders()
      .then((page) => {
        if (active) {
          setServerOrders(page.items);
          setCursor(page.nextCursor);
          setError("");
        }
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "주문을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [reload]);
  const orders = [...serverOrders, ...legacy.filter((order) => !serverOrders.some((server) => server.id === order.id))];
  async function more() {
    if (!cursor || loading) {
      return;
    }
    setLoading(true);
    try {
      const page = await loadServerOrders(cursor);
      setServerOrders((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "주문을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="surface mypage-section">
      <h2>주문 내역</h2>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            className="ghost-btn"
            onClick={() => {
              setLoading(true);
              setReload((value) => value + 1);
            }}
          >
            다시 불러오기
          </button>
        </div>
      )}
      {loading && <p aria-live="polite">주문 내역을 불러오고 있어요.</p>}
      {orders.length ? (
        <ul className="order-list">
          {orders.map((o) => {
            const delivery =
              o.desiredStartAt && o.desiredEndAt ? deliveryWindowKST(o.desiredStartAt, o.desiredEndAt) : null;
            return (
              <li key={o.id} className="order-item">
                <div className="order-item-top">
                  <strong>
                    {formatDay(delivery?.day ?? o.day ?? "")} · {delivery?.timeLabel ?? o.timeLabel}
                  </strong>
                  <span>{money(o.total)}</span>
                </div>
                <p className="meta">{o.address}</p>
                <p className="meta">
                  {"status" in o ? (statusLabels[String(o.status)] ?? String(o.status)) : "주문 완료"}
                </p>
                <ul className="order-item-lines">
                  {o.items.map((it, i) => {
                    const pid = it.id ? reviewablePids.get(it.id) : undefined;
                    return (
                      <li key={i} className="order-line">
                        <div className="order-line-image">
                          <Image src={imageFor(it.productId)} alt="" width={96} height={96} unoptimized />
                        </div>
                        <div className="order-line-info">
                          <div>
                            {it.name}
                            {it.options && <span> · {it.options}</span>}
                            <span> × {it.qty}</span>
                          </div>
                          {pid !== undefined && (
                            <button type="button" className="ghost-btn" onClick={() => openWrite(pid)}>
                              리뷰 쓰기
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      ) : !loading && !error ? (
        <div className="empty">
          아직 주문 내역이 없어요.
          <Link className="ghost-btn" href="/menu">
            메뉴 보러 가기
          </Link>
        </div>
      ) : null}
      {cursor && (
        <button className="ghost-btn" disabled={loading} onClick={more}>
          주문 더 보기
        </button>
      )}
    </section>
  );
}
