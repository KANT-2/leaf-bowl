"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ordersStore } from "@/infrastructure/browser/legacy-orders";
import { useCustomerCatalog } from "@/components/CustomerCatalogProvider";
import { useReviewableOrderItems } from "@/features/reviews/reviewable-orders";
import { useReviewWrite } from "@/components/ReviewWrite";
import { useToast } from "@/components/ToastProvider";
import { loadServerOrders, type ServerOrder, type ServerOrderPage } from "@/features/orders/client";
import {
  cancelMemberOrder,
  isCancelable,
  loadMemberOrders,
  MemberAuthError,
  type MemberOrderFilter,
} from "@/features/member/client";
import type { OrderRecord } from "@/modules/orders/customer-record";
import { money } from "@/modules/shared/format";
import { kstDate } from "@/modules/shared/time";
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

const STATUS_FILTERS = {
  all: { label: "전체", statuses: [] },
  active: { label: "진행 중", statuses: ["received", "confirmed", "preparing", "delivering"] },
  completed: { label: "완료", statuses: ["completed"] },
  canceled: { label: "취소", statuses: ["canceled"] },
} as const;
type StatusFilter = keyof typeof STATUS_FILTERS;

const PERIODS = {
  all: "전체 기간",
  "1": "최근 1개월",
  "3": "최근 3개월",
  "6": "최근 6개월",
  custom: "직접 선택",
} as const;
type Period = keyof typeof PERIODS;

interface FilterForm {
  status: StatusFilter;
  period: Period;
  from: string;
  to: string;
}

const ALL_ORDERS: FilterForm = { status: "all", period: "all", from: "", to: "" };

/** 한국 시간 오늘에서 n개월 전 날짜. 그 달에 없는 날(3/31 → 2/31)은 말일로 맞춘다. */
function monthsBefore(today: string, months: number) {
  const [y, m, d] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 - months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 - months, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

function toOrderFilter(form: FilterForm, now = Date.now()): MemberOrderFilter {
  const statuses = STATUS_FILTERS[form.status].statuses;
  if (form.period === "all") {
    return { statuses };
  }
  if (form.period === "custom") {
    return { statuses, from: form.from || undefined, to: form.to || undefined };
  }
  const today = kstDate(now);
  return { statuses, from: monthsBefore(today, Number(form.period)), to: today };
}

function formatDay(day: string) {
  const [y, m, d] = day.split("-");
  return y && m && d ? `${y}.${m}.${d}` : day;
}

/** 커서로 이어 읽는 주문 목록 (회원·비회원 API 가 같은 모양이다) */
function usePagedOrders(load: (cursor?: string) => Promise<ServerOrderPage>, onAuthError?: () => void) {
  const [orders, setOrders] = useState<ServerOrder[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const authError = useRef(onAuthError);
  useEffect(() => {
    authError.current = onAuthError;
  });

  const fail = useCallback((cause: unknown) => {
    if (cause instanceof MemberAuthError) {
      authError.current?.();
    }
    setError(cause instanceof Error ? cause.message : "주문을 불러오지 못했습니다.");
  }, []);

  useEffect(() => {
    let active = true;
    load()
      .then((page) => {
        if (active) {
          setOrders(page.items);
          setCursor(page.nextCursor);
          setError("");
        }
      })
      .catch((cause) => active && fail(cause))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [load, fail, reload]);

  async function more() {
    if (!cursor || loading) {
      return;
    }
    setLoading(true);
    try {
      const page = await load(cursor);
      setOrders((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
      setError("");
    } catch (cause) {
      fail(cause);
    } finally {
      setLoading(false);
    }
  }

  const retry = () => {
    setLoading(true);
    setReload((value) => value + 1);
  };
  return { orders, setOrders, cursor, loading, error, more, retry };
}

function OrderCard({
  order,
  imageFor,
  reviewablePids,
  onReview,
  action,
}: {
  order: ServerOrder | OrderRecord;
  imageFor: (productId?: string | null) => string;
  reviewablePids?: Map<string, number>;
  onReview?: (pid: number) => void;
  action?: React.ReactNode;
}) {
  const delivery =
    order.desiredStartAt && order.desiredEndAt ? deliveryWindowKST(order.desiredStartAt, order.desiredEndAt) : null;
  return (
    <li className="order-item">
      <div className="order-item-top">
        <strong>
          {formatDay(delivery?.day ?? order.day ?? "")} · {delivery?.timeLabel ?? order.timeLabel}
        </strong>
        <span>{money(order.total)}</span>
      </div>
      <p className="meta">{order.address}</p>
      <p className="meta">
        {"status" in order ? (statusLabels[String(order.status)] ?? String(order.status)) : "주문 완료"}
      </p>
      <ul className="order-item-lines">
        {order.items.map((it, i) => {
          const pid = it.id ? reviewablePids?.get(it.id) : undefined;
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
                {pid !== undefined && onReview && (
                  <button type="button" className="ghost-btn" onClick={() => onReview(pid)}>
                    리뷰 쓰기
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {action}
    </li>
  );
}

function LoadError({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div role="alert">
      <p>{error}</p>
      <button className="ghost-btn" onClick={retry}>
        다시 불러오기
      </button>
    </div>
  );
}

function OrderFilterForm({ onSearch }: { onSearch: (filter: MemberOrderFilter, filtered: boolean) => void }) {
  const [form, setForm] = useState<FilterForm>(ALL_ORDERS);
  const [error, setError] = useState("");

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.period === "custom" && form.from && form.to && form.from > form.to) {
      setError("시작일이 종료일보다 늦을 수 없습니다.");
      return;
    }
    setError("");
    onSearch(toOrderFilter(form), form.status !== "all" || form.period !== "all");
  };

  return (
    <>
      <form className="order-filter" onSubmit={search}>
        <label className="field">
          <span>주문 상태</span>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as StatusFilter })}>
            {Object.entries(STATUS_FILTERS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>주문 기간</span>
          <select value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as Period })}>
            {Object.entries(PERIODS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {form.period === "custom" && (
          <>
            <label className="field">
              <span>시작일</span>
              <input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
            </label>
            <label className="field">
              <span>종료일</span>
              <input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
            </label>
          </>
        )}
        <button type="submit" className="ghost-btn">
          조회
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** 회원 주문 (FastAPI). 조건이 바뀌면 key 로 새로 그려서 목록·커서를 처음부터 다시 읽는다. */
function MemberOrders({
  filter,
  filtered,
  imageFor,
}: {
  filter: MemberOrderFilter;
  filtered: boolean;
  imageFor: (productId?: string | null) => string;
}) {
  const router = useRouter();
  const toast = useToast();
  const load = useCallback((cursor?: string) => loadMemberOrders(cursor, filter), [filter]);
  // 토큰이 만료되면 다시 로그인하게 한다
  const member = usePagedOrders(load, () => router.replace("/login?next=/mypage"));
  const [canceling, setCanceling] = useState<string | null>(null);
  async function cancel(order: ServerOrder) {
    if (canceling || !window.confirm("이 주문을 취소할까요?")) {
      return;
    }
    setCanceling(order.id);
    try {
      const result = await cancelMemberOrder(order.id);
      member.setOrders((current) => current.map((o) => (o.id === order.id ? { ...o, status: result.status } : o)));
      toast("주문을 취소했어요");
    } catch (cause) {
      if (cause instanceof MemberAuthError) {
        router.replace("/login?next=/mypage");
      }
      toast(cause instanceof Error ? cause.message : "주문을 취소하지 못했습니다.");
      member.retry(); // 그 사이 상태가 바뀌었을 수 있으니 최신 상태를 다시 읽는다
    } finally {
      setCanceling(null);
    }
  }

  return (
    <>
      {member.error && <LoadError error={member.error} retry={member.retry} />}
      {member.loading && <p aria-live="polite">주문 내역을 불러오고 있어요.</p>}
      {member.orders.length ? (
        <ul className="order-list">
          {member.orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              imageFor={imageFor}
              action={
                isCancelable(o.status) && (
                  <button type="button" className="ghost-btn" disabled={canceling === o.id} onClick={() => cancel(o)}>
                    {canceling === o.id ? "취소하는 중…" : "주문 취소"}
                  </button>
                )
              }
            />
          ))}
        </ul>
      ) : !member.loading && !member.error ? (
        filtered ? (
          <div className="empty">조건에 맞는 주문이 없어요.</div>
        ) : (
          <div className="empty">
            아직 주문 내역이 없어요.
            <Link className="ghost-btn" href="/menu">
              메뉴 보러 가기
            </Link>
          </div>
        )
      ) : null}
      {member.cursor && (
        <button className="ghost-btn" disabled={member.loading} onClick={member.more}>
          주문 더 보기
        </button>
      )}
    </>
  );
}

export default function OrdersTab() {
  const { openWrite } = useReviewWrite();
  const { catalog } = useCustomerCatalog();
  const { items: reviewable } = useReviewableOrderItems();
  const reviewablePids = useMemo(() => new Map(reviewable.map((it) => [it.orderItemId, it.pid])), [reviewable]);
  const imageFor = (productId?: string | null) =>
    (productId && catalog.products.find((p) => p.id === productId)?.image) || FALLBACK_IMAGE;
  // 같은 조건으로 다시 조회해도 새로 읽도록 횟수(n)를 key 로 쓴다
  const [search, setSearch] = useState({ filter: {} as MemberOrderFilter, filtered: false, n: 0 });

  // 이 브라우저에서 비회원으로 접수한 주문 (Next.js 세션·이전 기록). 리뷰 작성은 이 주문 기준이다
  const guest = usePagedOrders(loadServerOrders);
  const legacy = useSyncExternalStore(ordersStore.subscribe, ordersStore.getSnapshot, ordersStore.getServerSnapshot);
  const guestOrders = [...guest.orders, ...legacy.filter((o) => !guest.orders.some((server) => server.id === o.id))];

  return (
    <>
      <section className="surface mypage-section">
        <h2>주문 내역</h2>
        <OrderFilterForm onSearch={(filter, filtered) => setSearch(({ n }) => ({ filter, filtered, n: n + 1 }))} />
        <MemberOrders key={search.n} filter={search.filter} filtered={search.filtered} imageFor={imageFor} />
      </section>

      {(guestOrders.length > 0 || guest.error) && (
        <section className="surface mypage-section">
          <h2>이 브라우저의 비회원 주문</h2>
          {guest.error && <LoadError error={guest.error} retry={guest.retry} />}
          <ul className="order-list">
            {guestOrders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                imageFor={imageFor}
                reviewablePids={reviewablePids}
                onReview={openWrite}
              />
            ))}
          </ul>
          {guest.cursor && (
            <button className="ghost-btn" disabled={guest.loading} onClick={guest.more}>
              주문 더 보기
            </button>
          )}
        </section>
      )}
    </>
  );
}
