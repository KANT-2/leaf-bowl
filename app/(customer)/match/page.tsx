import type { Metadata } from "next";
import BowlMatch from "@/components/BowlMatch";
import Breadcrumb from "@/components/Breadcrumb";
import PageHeading from "@/components/PageHeading";
import ProductReviewsPreview from "@/components/ProductReviewsPreview";
import { CUSTOM_BOWL_NAME, CUSTOM_BOWL_PID, CUSTOM_BOWL_REVIEWS_PATH } from "@/modules/reviews/model";

export const metadata: Metadata = {
  title: "내 취향 찾기 — bowl match | leaf & bowl",
  description: "좋아하는 재료에 하트를 보내세요. 스와이프로 완성하는 나만의 샐러드, bowl match.",
};

export default async function MatchPage() {
  return (
    <main className="bm">
      <div className="wrap bm-head">
        <Breadcrumb items={[["홈", "/"], ["내 취향 찾기"]]} />
        <span className="bm-brand">
          bowl match<span aria-hidden="true">♡</span>
        </span>
      </div>
      <section className="intro">
        <div className="eyebrow">A LITTLE CRUSH. A PERFECT BOWL.</div>
        <PageHeading>좋아하는 것만 담아봐요.</PageHeading>
        <p>
          오른쪽은 좋아요, 왼쪽은 다음에.
          <br className="mobile" /> 당신의 취향이 한 그릇이 될 때까지.
        </p>
      </section>
      <BowlMatch />
      <div className="wrap">
        <ProductReviewsPreview
          id={CUSTOM_BOWL_PID}
          title={`${CUSTOM_BOWL_NAME} 리뷰`}
          href={CUSTOM_BOWL_REVIEWS_PATH}
        />
      </div>
      <section className="bottom-strip" aria-hidden="true">
        <span>FRESH INGREDIENTS</span>
        <span>YOUR OWN COMBINATION</span>
        <span>ONE HAPPY BOWL</span>
      </section>
    </main>
  );
}
