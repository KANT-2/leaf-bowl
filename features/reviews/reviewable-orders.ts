"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useCustomerCatalog } from "@/components/CustomerCatalogProvider";
import { useReviews } from "@/components/ReviewsProvider";
import { loadServerOrders } from "@/features/orders/client";
import { dateStr } from "@/modules/reviews/model";

export interface ReviewableOrderItem {
  orderItemId: string;
  pid: number;
  /** 주문 당시 이름 (스냅샷) */
  name: string;
  image: string;
  dateLabel: string;
  t: number;
}

/** 전체 페이지를 다 돌기엔 과하니, 최근 이 만큼만 본다 */
const MAX_PAGES = 10;

/**
 * 로그인한 사용자가 받은(완료) 주문 중 아직 리뷰를 쓰지 않은 샐러드 메뉴 품목.
 * 음료·내 취향 볼은 리뷰 대상이 아니라서 뺀다.
 */
export function useReviewableOrderItems(): { loading: boolean; items: ReviewableOrderItem[] } {
  const { isLoggedIn } = useAuth();
  const { catalog, getProduct } = useCustomerCatalog();
  const { userReviews } = useReviews();
  const [fetched, setFetched] = useState<ReviewableOrderItem[] | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }
    const id = ++requestId.current;
    (async () => {
      const collected: ReviewableOrderItem[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await loadServerOrders(cursor);
        for (const order of result.items) {
          if (order.status !== "completed") {
            continue;
          }
          for (const item of order.items) {
            if (item.productType !== "salad" || !item.productId || !item.id) {
              continue;
            }
            const pid = catalog.products.find((p) => p.id === item.productId)?.customerId;
            const product = pid === undefined ? undefined : getProduct(pid);
            if (pid === undefined || !product) {
              continue;
            }
            collected.push({
              orderItemId: item.id,
              pid,
              name: item.name,
              image: product.imageUrl || "/images/hero-cutout.png",
              dateLabel: dateStr(order.createdAt),
              t: order.createdAt,
            });
          }
        }
        if (!result.nextCursor) {
          break;
        }
        cursor = result.nextCursor;
      }
      if (requestId.current === id) {
        setFetched(collected);
      }
    })().catch(() => {
      if (requestId.current === id) {
        setFetched([]);
      }
    });
  }, [isLoggedIn, catalog, getProduct]);

  const reviewed = useMemo(
    () => new Set(userReviews.filter((r) => r.orderItemId).map((r) => r.orderItemId)),
    [userReviews],
  );
  return {
    loading: isLoggedIn && fetched === null,
    items: isLoggedIn ? (fetched ?? []).filter((it) => !reviewed.has(it.orderItemId)) : [],
  };
}
