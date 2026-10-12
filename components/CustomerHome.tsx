"use client";
import Link from "next/link";
import HeroCarousel from "@/components/HeroCarousel";
import MatchFloat from "@/components/MatchFloat";
import ProductCard from "@/components/ProductCard";
import ReviewRotator from "@/components/ReviewRotator";
import { useCustomerCatalog } from "./CustomerCatalogProvider";
import { MATCH_URL } from "@/features/customer/routes";

export default function CustomerHome() {
  const { revision, heroSlides: slides, visibleProducts: PRODUCTS } = useCustomerCatalog();
  return (
    <main>
      <HeroCarousel key={revision} slides={slides} />

      <section className="section wrap" id="best">
        <div className="section-title">
          <div>
            <div className="eyebrow">YOUR NEXT FAVORITE</div>
            <h2>
              Best bowls<span>자꾸 생각나는 한 그릇</span>
            </h2>
          </div>
          <Link href="/menu">전체 메뉴 보기 ↗</Link>
        </div>
        <div className="product-grid">
          {PRODUCTS.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <section className="section reviews wrap" id="reviews" aria-labelledby="reviewsTitle">
        <ReviewRotator />
      </section>

      <section className="match-banner wrap">
        <div>
          <div className="eyebrow">A BOWL THAT’S SO YOU</div>
          <h2>내 취향대로, 한 번 더 새롭게.</h2>
          <p>좋아하는 재료에 하트를 보내고 나만의 샐러드를 만들어보세요.</p>
        </div>
        <Link className="primary" href={MATCH_URL}>
          bowl match 시작하기 ♡
        </Link>
      </section>

      <section className="allergy wrap">
        <strong>알레르기 안내</strong>
        <p>
          메뉴별 주요 알레르기 유발 재료를 옵션 화면에서 확인해주세요. 같은 조리 공간에서 우유, 대두, 밀, 계란, 견과류,
          새우, 생선 등을 취급하며 교차 접촉이 발생할 수 있습니다. 알레르기가 있다면 실제 주문 전 매장에 확인해주세요.
        </p>
      </section>

      <MatchFloat />
    </main>
  );
}
