"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useCustomerCatalog } from "@/components/CustomerCatalogProvider";
import { useReviews } from "@/components/ReviewsProvider";
import { loadServerOrders, type ServerOrderPage } from "@/features/orders/client";
import { loadMemberOrders } from "@/features/member/client";
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

type LoadOrders = (cursor?: string) => Promise<ServerOrderPage>;

/** 이 브라우저의 비회원 세션 주문과 회원 주문(FastAPI). 회원 주문은 완료 상태만 서버에서 거른다 */
const SOURCES: LoadOrders[] = [loadServerOrders, (cursor) => loadMemberOrders(cursor, { statuses: ["completed"] })];

/**
 * 로그인한 사용자가 받은(완료) 주문(회원 주문 + 이 브라우저의 비회원 주문) 중 아직 리뷰를 쓰지 않은 샐러드 메뉴 품목.
 * 음료·내 취향 볼은 리뷰 대상이 아니라서 뺀다.
 */
export function useReviewableOrderItems(): { loading: boolean; items: ReviewableOrderItem[] } {
  const { isLoggedIn } = useAuth();
  const { catalog, getProduct } = useCustomerCatalog();
  const { reviewedOrderItemIds } = useReviews();
  const [fetched, setFetched] = useState<ReviewableOrderItem[] | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }
    const id = ++requestId.current;
    const collect = async (load: LoadOrders, collected: ReviewableOrderItem[]) => {
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await load(cursor);
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
    };
    (async () => {
      const collected: ReviewableOrderItem[] = [];
      for (const load of SOURCES) {
        try {
          await collect(load, collected);
        } catch {
          // 한쪽 주문을 읽지 못해도 다른 쪽 주문의 리뷰는 쓸 수 있게 한다
        }
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

  return {
    loading: isLoggedIn && fetched === null,
    items: isLoggedIn ? (fetched ?? []).filter((it) => !reviewedOrderItemIds.has(it.orderItemId)) : [],
  };
}
