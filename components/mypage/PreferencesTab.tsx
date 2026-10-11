"use client";

import { useAuth } from "../AuthProvider";
import { useCustomerCatalog } from "../CustomerCatalogProvider";

export default function PreferencesTab() {
  const { user, setPreferences } = useAuth();
  const { catalog, catalogConfig } = useCustomerCatalog();
  const categories = catalog.categories ?? [];

  if (!user) {
    return null;
  }

  const toggleCategory = (c: string) =>
    setPreferences({
      preferredCategories: user.preferredCategories.includes(c)
        ? user.preferredCategories.filter((x) => x !== c)
        : [...user.preferredCategories, c],
    });

  const toggleAllergen = (a: string) =>
    setPreferences({
      excludedAllergens: user.excludedAllergens.includes(a)
        ? user.excludedAllergens.filter((x) => x !== a)
        : [...user.excludedAllergens, a],
    });

  return (
    <section className="surface mypage-section">
      <h2>취향·알레르기</h2>
      <div className="pref-group">
        <h3>선호하는 메뉴 분류</h3>
        <div className="allergy-chips">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={user.preferredCategories.includes(c)}
              onClick={() => toggleCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="pref-group">
        <h3>제외할 알레르기 재료</h3>
        <p className="meta">메뉴 목록에서 이 재료가 들어간 메뉴를 자동으로 숨겨드려요.</p>
        <div className="allergy-chips">
          {catalogConfig.allergenOrder.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={user.excludedAllergens.includes(a)}
              onClick={() => toggleAllergen(a)}
            >
              {user.excludedAllergens.includes(a) ? "✕ " : ""}
              {a}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
