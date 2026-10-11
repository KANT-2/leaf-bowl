"use client";

import { useEffect, useState } from "react";
import { BarChart3, RefreshCw, Trophy, ShoppingBag } from "lucide-react";
import { Button } from "./button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./table";
import type { SalesProductType, SalesPeriod, SalesReport, SalesRow } from "@/modules/reports/sales";
import { redirectIfAdminUnauthorized } from "@/features/admin/session-client";
import styles from "./SalesRanking.module.css";

const periods: { value: SalesPeriod; label: string }[] = [
  { value: "all", label: "전체 기간" },
  { value: "today", label: "오늘" },
  { value: "7d", label: "최근 7일" },
  { value: "30d", label: "최근 30일" },
];
const number = (value: number) => value.toLocaleString("ko-KR");

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );

function MenuPhoto({ row, size = 52 }: { row: SalesRow; size?: number }) {
  const [failed, setFailed] = useState(false);
  const photoStyle = { width: size, height: size, maxWidth: "100%", objectFit: "contain" as const, flexShrink: 0 };
  // Explicit dimensions keep uploaded images bounded even before styles load.
  return row.image && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={styles.photo}
      width={size}
      height={size}
      style={photoStyle}
      src={row.image}
      alt=""
      onError={() => setFailed(true)}
    />
  ) : (
    <span className={styles.photo} style={photoStyle}>
      <ShoppingBag size={24} aria-hidden="true" />
    </span>
  );
}

export default function SalesRanking() {
  const [combinationSalad, setCombinationSalad] = useState("");
  const [productType, setProductType] = useState<SalesProductType>("salad");
  const productLabel = { salad: "샐러드", drink: "음료", dressing: "드레싱" }[productType];
  const metric = productType === "dressing" ? "선택" : "판매";
  const [period, setPeriod] = useState<SalesPeriod>("all");
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      setReport(null);
      try {
        const response = await fetch(`/api/admin/sales?period=${period}&type=${productType}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        redirectIfAdminUnauthorized(response);
        if (!response.ok) {
          throw Error("판매 내역을 불러오지 못했습니다. 다시 시도해주세요.");
        }
        const result: SalesReport = await response.json();
        if (!controller.signal.aborted) {
          setReport(result);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "판매 내역을 불러오지 못했습니다.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load();
      }
    }, 60000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [period, productType, refresh]);
  const selectedSalad = report?.combinations.some((row) => row.saladId === combinationSalad) ? combinationSalad : "";
  const combinations = report?.combinations.filter((row) => !selectedSalad || row.saladId === selectedSalad) ?? [];
  const leaders = report?.rows.filter((row) => row.rank !== null && row.rank <= 3) ?? [];
  const rankedRows = report?.rows.filter((row) => row.rank !== null) ?? [];
  const rankCounts = new Map<number | null, number>();
  for (const row of rankedRows) {
    rankCounts.set(row.rank, (rankCounts.get(row.rank) ?? 0) + 1);
  }
  const tiedRanks = new Set([...rankCounts].filter(([, count]) => count > 1).map(([rank]) => rank));

  return (
    <div className={styles.page}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PRODUCT SALES OVERVIEW</div>
          <h1>제품 판매 현황</h1>
          <p className="muted">샐러드·음료 판매량과 드레싱 선택량을 확인하세요.</p>
        </div>
        <Button variant="outline" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>
          <RefreshCw size={16} aria-hidden="true" />
          새로고침
        </Button>
      </div>
      <div
        className={styles.periods}
        role="group"
        aria-label="제품 분류"
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}
      >
        {(["salad", "drink", "dressing"] as const).map((type) => (
          <Button
            key={type}
            variant={productType === type ? "default" : "outline"}
            aria-pressed={productType === type}
            onClick={() => setProductType(type)}
          >
            {{ salad: "샐러드", drink: "음료", dressing: "드레싱" }[type]}
          </Button>
        ))}
      </div>
      <div className={styles.toolbar}>
        <div className={styles.periods} role="group" aria-label="제품 판매 현황 조회 기간">
          {periods.map((item) => (
            <Button
              key={item.value}
              variant={period === item.value ? "default" : "outline"}
              aria-pressed={period === item.value}
              onClick={() => setPeriod(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <span className="meta">한국 시간 기준 · 1분마다 자동 갱신</span>
      </div>
      <p className={styles.note}>
        {productType === "dressing"
          ? "결제 확정 주문에서 무료·유료 드레싱의 선택 수량을 집계합니다."
          : "결제 확정 주문의 제품 판매 수량을 집계합니다. 음료는 단품과 옵션 선택을 포함합니다."}{" "}
        취소·환불 수량은 제외하며, 같은 수량은 공동 순위로 표시합니다.
      </p>
      <div aria-live="polite" aria-busy={loading}>
        {loading || (report !== null && report.productType !== productType) ? (
          <section className="surface empty">제품 판매 현황을 불러오는 중입니다…</section>
        ) : error ? (
          <section className="surface empty">
            <p role="alert" className="error">
              {error}
            </p>
            <Button variant="outline" onClick={() => setRefresh((value) => value + 1)}>
              다시 시도
            </Button>
          </section>
        ) : (
          report && (
            <>
              {!report.connected && (
                <section className={styles.connection}>
                  <BarChart3 size={28} aria-hidden="true" />
                  <div>
                    <h2>판매 데이터 연결을 기다리고 있습니다</h2>
                    <p>실제 주문 내역이 연결되면 판매·선택 수량과 순위가 자동으로 표시됩니다.</p>
                  </div>
                </section>
              )}
              <div className={styles.summary}>
                <section className="surface">
                  <span className="meta">
                    {productLabel} {metric} 수량
                  </span>
                  <strong>
                    {report.connected ? number(report.totalQuantity) : "—"}
                    <small>개</small>
                  </strong>
                </section>
                <section className="surface">
                  <span className="meta">{productLabel} 포함 주문</span>
                  <strong>
                    {report.connected ? number(report.orderCount) : "—"}
                    <small>건</small>
                  </strong>
                </section>
                <section className="surface">
                  <span className="meta">
                    {metric}된 {productLabel} 종류
                  </span>
                  <strong>
                    {report.connected ? number(report.rows.filter((row) => row.quantity > 0).length) : "—"}
                    <small>종</small>
                  </strong>
                </section>
              </div>
              <section aria-labelledby="sales-top-title">
                <div className={styles.sectionTitle}>
                  <h2 id="sales-top-title">
                    <Trophy size={20} aria-hidden="true" />
                    {metric} TOP 3
                  </h2>
                  <span className="meta">{metric} 수량 기준</span>
                </div>
                {leaders.length ? (
                  <div className={styles.leaders}>
                    {leaders.map((row) => (
                      <article key={row.productId} className={`surface ${styles.leader}`}>
                        <span className={styles.rank}>
                          {tiedRanks.has(row.rank) ? "공동 " : ""}
                          {row.rank}위
                        </span>
                        <MenuPhoto row={row} size={120} />
                        <h3>{row.name}</h3>
                        {row.archived && <span className="meta">삭제된 메뉴</span>}
                        <strong>
                          {number(row.quantity)}
                          <small>개 {metric}</small>
                        </strong>
                        <span className="meta">
                          {productLabel} 전체 {metric}의 {row.share.toFixed(1)}%
                        </span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="surface empty">
                    {report.connected
                      ? "선택한 기간에 판매·선택된 제품이 없습니다."
                      : "판매 데이터가 연결되면 상위 메뉴가 표시됩니다."}
                  </div>
                )}
              </section>
              <section aria-labelledby="sales-all-title">
                <div className={styles.sectionTitle}>
                  <h2 id="sales-all-title">
                    <BarChart3 size={20} aria-hidden="true" />
                    {productLabel}별 {metric} 현황
                  </h2>
                  <span className="meta">{report.rows.length}개 제품</span>
                </div>
                <div className={`surface ${styles.table}`}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>순위</TableHead>
                        <TableHead>{productLabel}</TableHead>
                        <TableHead className="text-right">{metric} 수량</TableHead>
                        <TableHead className="text-right">{metric} 비중</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.rows.map((row) => (
                        <TableRow key={row.productId}>
                          <TableCell>
                            <span className={row.rank !== null && row.rank <= 3 ? styles.tableRank : ""}>
                              {row.rank === null ? "—" : `${tiedRanks.has(row.rank) ? "공동 " : ""}${row.rank}위`}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className={styles.menu}>
                              <MenuPhoto row={row} />
                              <div>
                                <strong>{row.name}</strong>
                                {row.archived && <div className="meta">삭제된 메뉴 · 판매 기록 유지</div>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className={`text-right ${styles.quantity}`}>
                            {report.connected ? `${number(row.quantity)}개` : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {report.connected ? `${row.share.toFixed(1)}%` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {!report.rows.length && <p className="empty">등록된 {productLabel} 제품이 없습니다.</p>}
                </div>
              </section>
              {productType === "salad" && (
                <section aria-labelledby="sales-combinations-title">
                  <div className={styles.sectionTitle}>
                    <h2 id="sales-combinations-title">샐러드·드레싱 조합</h2>
                  </div>
                  <p className="muted" style={{ marginBottom: 16 }}>
                    각 샐러드가 어떤 드레싱과 함께 팔렸는지 확인하세요. 비중은 해당 샐러드의 순판매 수량 기준입니다.
                  </p>
                  <label className="field" style={{ maxWidth: 360, marginBottom: 16 }}>
                    샐러드 선택
                    <select
                      value={selectedSalad}
                      onChange={(e) => setCombinationSalad(e.target.value)}
                      style={{ padding: 10, border: "1px solid #d5dfcc", borderRadius: 8 }}
                    >
                      <option value="">전체 샐러드</option>
                      {report.rows
                        .filter((row) => row.quantity > 0)
                        .map((row) => (
                          <option key={row.productId} value={row.productId}>
                            {row.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className={`surface ${styles.table}`}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>샐러드</TableHead>
                          <TableHead>드레싱</TableHead>
                          <TableHead className="text-right">조합 판매 수량</TableHead>
                          <TableHead className="text-right">샐러드 내 비중</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {combinations.map((row) => (
                          <TableRow key={JSON.stringify([row.saladId, row.selection, row.dressingId])}>
                            <TableCell>{row.saladName}</TableCell>
                            <TableCell>{row.dressingName}</TableCell>
                            <TableCell className="text-right">{number(row.quantity)}개</TableCell>
                            <TableCell className="text-right">{row.share.toFixed(1)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {!combinations.length && (
                      <p className="empty">
                        {report.connected
                          ? "선택한 기간에 판매된 조합이 없습니다."
                          : "주문 데이터가 연결되면 조합별 판매 현황이 표시됩니다."}
                      </p>
                    )}
                  </div>
                  {combinations.some((row) => row.selection === "unknown") && (
                    <p className="meta" style={{ marginTop: 12 }}>
                      ‘선택 정보 없음’은 주문에 드레싱 기록이 없는 판매입니다. ‘드레싱 없이’ 주문과 구분합니다.
                    </p>
                  )}
                </section>
              )}
              {report.updatedAt && <p className={styles.updated}>판매 데이터 갱신: {dateTime(report.updatedAt)}</p>}
            </>
          )
        )}
      </div>
    </div>
  );
}
