"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useAuth } from "../AuthProvider";
import { useCustomerCatalog } from "../CustomerCatalogProvider";
import { recipeStore } from "@/infrastructure/browser/bowl-store";
import { kstDate } from "@/modules/shared/time";
import { money } from "@/modules/shared/format";

const dateLabel = (iso: string) =>
  Number.isFinite(Date.parse(iso)) ? kstDate(Date.parse(iso)).replaceAll("-", ".") : "";

export default function BowlRecipesTab() {
  const { user } = useAuth();
  const { ingredients, DRESSINGS } = useCustomerCatalog();
  const recipes = useSyncExternalStore(recipeStore.subscribe, recipeStore.getSnapshot, recipeStore.getServerSnapshot);
  const mine = recipes.filter((r) => r.ownerEmail === user?.email).sort((a, b) => b.savedAt.localeCompare(a.savedAt));

  const remove = (id: string) => recipeStore.set(recipes.filter((r) => r.id !== id));

  return (
    <section className="surface mypage-section">
      <h2>내 조합</h2>
      {mine.length ? (
        <ul className="order-list">
          {mine.map((r) => {
            const names = r.ingredients.map((id) => ingredients.find((i) => i.id === id)?.name).filter(Boolean);
            const dressingName = DRESSINGS.find((d) => d.id === r.dressingKey)?.name;
            return (
              <li key={r.id} className="order-item">
                <div className="order-item-top">
                  <strong>{r.name}</strong>
                  <span>{money(r.price)}</span>
                </div>
                <p className="meta">{dateLabel(r.savedAt)} 저장</p>
                <p className="meta">
                  {names.join(", ") || "재료 정보 없음"}
                  {dressingName ? ` · ${dressingName}` : ""}
                </p>
                <button type="button" className="ghost-btn" onClick={() => remove(r.id)}>
                  삭제
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty">
          아직 저장한 조합이 없어요.
          <Link className="ghost-btn" href="/match">
            내 취향 찾기
          </Link>
        </div>
      )}
    </section>
  );
}
