"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../AuthProvider";
import { useBowlRecipes } from "@/features/bowls/use-bowl-recipes";
import { MemberAuthError } from "@/features/member/client";
import { kstDate } from "@/modules/shared/time";
import { money } from "@/modules/shared/format";

const dateLabel = (iso: string) =>
  Number.isFinite(Date.parse(iso)) ? kstDate(Date.parse(iso)).replaceAll("-", ".") : "";

export default function BowlRecipesTab() {
  const { isLoggedIn } = useAuth();
  const router = useRouter();
  const recipes = useBowlRecipes(isLoggedIn);

  const remove = async (id: string) => {
    try {
      await recipes.remove(id);
    } catch (cause) {
      if (cause instanceof MemberAuthError) {
        router.replace("/login?next=/mypage");
      }
    }
  };

  const time = (iso: string) => dateLabel(iso);

  return (
    <section className="surface mypage-section">
      <h2>내 조합</h2>
      {recipes.loading && <p aria-live="polite">저장한 조합을 불러오고 있어요.</p>}
      {recipes.error && (
        <div role="alert" className="form-error">
          <p>{recipes.error}</p>
          <button type="button" className="ghost-btn" disabled={recipes.loading} onClick={() => void recipes.refresh()}>
            다시 불러오기
          </button>
        </div>
      )}
      {recipes.deleteError && (
        <p role="alert" className="form-error">
          {recipes.deleteError}
        </p>
      )}
      {recipes.loaded && recipes.items.length ? (
        <ul className="order-list">
          {recipes.items.map((r) => {
            const names = r.ingredients.map((ingredient) => ingredient.name);
            return (
              <li key={r.id} className="order-item">
                <div className="order-item-top">
                  <strong>{r.name}</strong>
                  <span>{money(r.price)}</span>
                </div>
                <p className="meta">{time(r.saved_at)} 저장</p>
                <p className="meta">
                  {names.join(", ") || "재료 정보 없음"} · {r.dressing_name}
                </p>
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={!!recipes.deletingId || recipes.saving}
                  onClick={() => void remove(r.id)}
                >
                  {recipes.deletingId === r.id ? "삭제 중…" : "삭제"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : recipes.loaded && !recipes.error ? (
        <div className="empty">
          아직 저장한 조합이 없어요.
          <Link className="ghost-btn" href="/match">
            내 취향 찾기
          </Link>
        </div>
      ) : null}
    </section>
  );
}
