"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/admin/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/admin/dialog";
import { Input } from "@/components/admin/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/admin/tabs";
import {
  DELIVERY_PAGE_SIZE,
  deliveryDateOptions,
  deliveryGroupLabel,
  filterDeliveryOrders,
  groupDeliveryOrders,
  paginateDeliveryOrders,
  type DeliveryGroupBy,
  type DeliveryOrder,
} from "@/features/admin/delivery-filters";
import { ORDER_STATUSES, STATUS_LABEL, type OrderStatus } from "@/modules/orders/status";

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
  return (
    <section className="surface">
      <div className="section-heading">
        <h2>배달 관리</h2>
        <span className="pill">고객 주문 연동</span>
      </div>
      <p className="muted">
        배달 날짜별로 묶고, 각 날짜 안에서는 최근 접수한 주문부터 표시합니다. 시간은 한국 시간 기준입니다.
      </p>
      <Results />
    </section>
  );
}

function Results() {
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [more, setMore] = useState(false);
  const [pages, setPages] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState<DeliveryGroupBy>("day");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [hour, setHour] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const collected: DeliveryOrder[] = [];
        let cursor: string | null = null;
        for (let p = 0; p < pages; p++) {
          const params = new URLSearchParams({ limit: "50" });
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
  }, [pages, refresh]);
  const { months, days } = deliveryDateOptions(orders, month);
  const filtered = filterDeliveryOrders(orders, { status, query, month, day, hour });
  const filterKey = [status, query, groupBy, month, day, hour].join("|");
  const [pageState, setPageState] = useState({ key: "", page: 1 });
  const paged = paginateDeliveryOrders(filtered, pageState.key === filterKey ? pageState.page : 1);
  const goToPage = (page: number) => setPageState({ key: filterKey, page });
  const groups = groupDeliveryOrders(paged.items, groupBy);
  const countOf = (value: OrderStatus) => orders.filter((order) => order.status === value).length;
  return (
    <>
      <div className="toolbar">
        <div className="review-filter-controls">
          <Tabs value={status} onValueChange={(value) => setStatus(value as OrderStatus | "all")}>
            <TabsList aria-label="주문 상태">
              <TabsTrigger value="all">전체 주문 {orders.length}</TabsTrigger>
              {ORDER_STATUSES.map((value) => (
                <TabsTrigger key={value} value={value}>
                  {STATUS_LABEL[value]} {countOf(value)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <Input
          aria-label="주문 검색"
          placeholder="주문자, 전화, 주소, 메뉴, 주문번호 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>
      <div className="review-calendar-controls">
        <div role="group" aria-label="주문 묶음 보기">
          {(["month", "day"] as const).map((value) => (
            <Button
              type="button"
              key={value}
              variant={groupBy === value ? "default" : "outline"}
              aria-pressed={groupBy === value}
              onClick={() => {
                setGroupBy(value);
                if (value === "month") {
                  setDay("");
                  setHour("");
                }
              }}
            >
              {value === "month" ? "월별 모아보기" : "일별 모아보기"}
            </Button>
          ))}
        </div>
        <label>
          월 선택
          <select
            aria-label="배달 월 선택"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setDay("");
              setHour("");
            }}
          >
            <option value="">전체 월</option>
            {months.map((value) => (
              <option key={value} value={value}>
                {deliveryGroupLabel(value)}
              </option>
            ))}
          </select>
        </label>
        {groupBy === "day" && (
          <label>
            날짜 선택
            <select
              aria-label="배달 날짜 선택"
              value={day}
              onChange={(e) => {
                setDay(e.target.value);
                setHour("");
              }}
            >
              <option value="">전체 날짜</option>
              {days.map((value) => (
                <option key={value} value={value}>
                  {deliveryGroupLabel(value)}
                </option>
              ))}
            </select>
          </label>
        )}
        {groupBy === "day" && day && (
          <label>
            시간 선택
            <select aria-label="배달 시간대 선택" value={hour} onChange={(e) => setHour(e.target.value)}>
              <option value="">전체 시간</option>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={String(h)}>
                  {String(h).padStart(2, "0")}:00–{String(h + 1).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="meta" role="status">
          조회 {filtered.length}건 · {paged.page}/{paged.pageCount}쪽 · 배달 날짜순 · 한국 시간 기준
        </span>
      </div>
      <div className="section-heading">
        <p className="meta" aria-live="polite">
          {loading ? "주문 불러오는 중…" : `불러온 주문 ${orders.length}건 · 30초마다 자동 갱신`}
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
      {!loading && !error && !filtered.length && <p className="muted">선택한 조건에 해당하는 배달 주문이 없습니다.</p>}
      {groups.map(([key, rows]) => (
        <section key={key} className="delivery-day" aria-label={`${deliveryGroupLabel(key)} 배달 주문`}>
          <h3 className="review-calendar-heading">
            {deliveryGroupLabel(key)} 배달<span>{rows.length}건</span>
          </h3>
          <div className="delivery-list-labels" aria-hidden="true">
            <span>배달 예정</span>
            <span>주문 정보</span>
            <span>배달 주소</span>
            <span>상태·금액</span>
            <span>관리</span>
          </div>
          {rows.map((order) => (
            <article key={order.id} className="delivery-order delivery-order-compact">
              <div>
                <strong>배달 예정 {order.desiredSlot}</strong>
                <p className="meta">
                  접수 <time dateTime={order.createdAt}>{receivedTime(order.createdAt)}</time>
                </p>
              </div>
              <div>
                <strong>{order.ordererName}</strong>
                <p className="meta">{order.phone}</p>
                <ul>
                  {order.items.map((item, i) => (
                    <li key={i}>
                      <strong>
                        {item.name} × {item.quantity}
                      </strong>
                      {item.options && <p className="meta">{item.options}</p>}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p>{order.address}</p>
                <p>{order.addressDetail}</p>
              </div>
              <div>
                <span className={"delivery-status delivery-status-" + order.status}>{STATUS_LABEL[order.status]}</span>
                <p>{Number(order.total).toLocaleString("ko-KR")}원</p>
              </div>
              <div className="delivery-manage">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={order.ordererName + " 주문 상세 보기"}
                  onClick={() => setSelectedOrder(order.id)}
                >
                  상세 보기
                </Button>
              </div>
            </article>
          ))}
        </section>
      ))}
      {!!filtered.length && (
        <p className="meta" aria-live="polite">
          총 {filtered.length}건 중 {paged.items.length}건 표시 · 한 페이지 {DELIVERY_PAGE_SIZE}건
        </p>
      )}
      {filtered.length > DELIVERY_PAGE_SIZE && (
        <div className="menu-pagination">
          <nav aria-label="배달 이력 페이지">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={paged.page === 1}
              onClick={() => goToPage(paged.page - 1)}
            >
              이전
            </Button>
            {Array.from({ length: paged.pageCount }, (_, i) => (
              <Button
                key={i}
                type="button"
                variant={paged.page === i + 1 ? "default" : "outline"}
                size="sm"
                aria-label={i + 1 + "페이지"}
                aria-current={paged.page === i + 1 ? "page" : undefined}
                onClick={() => goToPage(i + 1)}
              >
                {i + 1}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={paged.page === paged.pageCount}
              onClick={() => goToPage(paged.page + 1)}
            >
              다음
            </Button>
          </nav>
        </div>
      )}
      <Dialog
        open={!!selectedOrder}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOrder(null);
          }
        }}
      >
        <DialogContent className="editor-dialog">
          <DialogHeader>
            <DialogTitle>배달 주문 상세</DialogTitle>
            <DialogDescription>주문 정보와 처리 이력을 확인하세요.</DialogDescription>
          </DialogHeader>
          {selectedOrder && <OrderDetails key={selectedOrder} id={selectedOrder} />}
        </DialogContent>
      </Dialog>
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

type OrderDetail = DeliveryOrder & {
  cancelReason: string | null;
  history: { toStatus: OrderStatus; reason: string | null; createdAt: string }[];
};
function OrderDetails({ id }: { id: string }) {
  const [data, setData] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setError("");
      setData(null);
      try {
        const response = await fetch(`/api/v1/admin/orders/${encodeURIComponent(id)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            response.status === 401 || response.status === 403
              ? "관리자 로그인이 필요합니다."
              : "주문 상세를 불러오지 못했습니다.",
          );
        }
        const result = await response.json();
        if (!controller.signal.aborted) {
          setData(result);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "조회에 실패했습니다.");
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [id, retry]);
  if (error) {
    return (
      <div role="alert">
        <p className="error">{error}</p>
        <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
          다시 시도
        </Button>
      </div>
    );
  }
  if (!data) {
    return <p role="status">주문 상세 불러오는 중…</p>;
  }
  return (
    <div className="delivery-detail">
      <p className="meta">주문번호 {data.id}</p>
      <p>
        <strong>{data.ordererName}</strong> · {data.phone}
      </p>
      <p>
        배달 예정 {data.desiredDate} {data.desiredSlot}
      </p>
      <p>접수 {receivedTime(data.createdAt)}</p>
      <p>
        배달 주소: {data.address} {data.addressDetail}
      </p>
      <p>
        <span className={"delivery-status delivery-status-" + data.status}>{STATUS_LABEL[data.status]}</span> · 결제
        금액 {Number(data.total).toLocaleString("ko-KR")}원
      </p>
      <h3>주문 메뉴</h3>
      <ul>
        {data.items.map((item, index) => (
          <li key={index}>
            <strong>
              {item.name} × {item.quantity}
            </strong>
            {item.options && <p className="meta">{item.options}</p>}
          </li>
        ))}
      </ul>
      {data.cancelReason && <p>취소 사유: {data.cancelReason}</p>}
      <h3>처리 이력</h3>
      <ul>
        {data.history.map((entry, index) => (
          <li key={index}>
            {receivedTime(entry.createdAt)} · {STATUS_LABEL[entry.toStatus]}
            {entry.reason && ` · ${entry.reason}`}
          </li>
        ))}
      </ul>
      {!data.history.length && <p className="meta">등록된 처리 이력이 없습니다.</p>}
    </div>
  );
}
