"use client";
import { useCustomerCatalog } from "./CustomerCatalogProvider";
import Link from "next/link";
import Breadcrumb from "./Breadcrumb";
import ReviewsView from "./ReviewsView";
export default function CustomerProductReviewsPage({ id }: { id: number }) {
  const { getProduct } = useCustomerCatalog();
  const p = getProduct(id);
  if (!p) {
    return (
      <main className="wrap">
        <p>이 메뉴는 현재 제공되지 않습니다.</p>
        <Link href="/menu">전체 메뉴 보기</Link>
      </main>
    );
  }
  return (
    <main className="wrap pv-wrap">
      <Breadcrumb items={[["홈", "/"], ["고객 리뷰", "/reviews"], [p.name]]} />
      <ReviewsView pid={p.id} />
    </main>
  );
}
