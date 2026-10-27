import type { Metadata } from "next";
import Breadcrumb from "@/components/Breadcrumb";
import ReviewsView from "@/components/ReviewsView";
import { CUSTOM_BOWL_NAME, CUSTOM_BOWL_PID } from "@/modules/reviews/model";

export const metadata: Metadata = { title: `${CUSTOM_BOWL_NAME} 리뷰 — leaf & bowl` };

export default function CustomBowlReviewsPage() {
  return (
    <main className="wrap pv-wrap">
      <Breadcrumb items={[["홈", "/"], ["고객 리뷰", "/reviews"], [CUSTOM_BOWL_NAME]]} />
      <ReviewsView pid={CUSTOM_BOWL_PID} />
    </main>
  );
}
