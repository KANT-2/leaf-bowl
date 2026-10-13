"use client";

import { useState } from "react";
import { useAuth } from "../AuthProvider";
import { useToast } from "../ToastProvider";
import { useCustomerCatalog } from "../CustomerCatalogProvider";

const CATEGORY_ICONS: Record<string, string> = {
  "든든한 단백질": "🍗",
  "플랜트 베이스": "🌱",
  "새로운 조합": "✨",
  기타: "🍽️",
};
const DEFAULT_CATEGORY_ICON = "🍽️";

const ALLERGEN_ICONS: Record<string, string> = {
  닭고기: "🍗",
  토마토: "🍅",
  연어: "🐟",
  새우: "🦐",
  대두: "🫘",
  우유: "🥛",
  쇠고기: "🥩",
  참치: "🐡",
  밀: "🌾",
  계란: "🥚",
  생선: "🐠",
  참깨: "🌿",
  땅콩: "🥜",
  호두: "🌰",
  아몬드: "🌰",
};
const DEFAULT_ALLERGEN_ICON = "🌿";

export default function PreferencesTab() {
  const { user, setPreferences } = useAuth();
  const toast = useToast();
  const { catalog, catalogConfig } = useCustomerCatalog();
  const categories = catalog.categories ?? [];
  const [preferredCategories, setPreferredCategories] = useState(user?.preferredCategories ?? []);
  const [excludedAllergens, setExcludedAllergens] = useState(user?.excludedAllergens ?? []);

  if (!user) {
    return null;
  }

  const dirty =
    preferredCategories.join() !== user.preferredCategories.join() ||
    excludedAllergens.join() !== user.excludedAllergens.join();

  const toggleCategory = (c: string) =>
    setPreferredCategories((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  const toggleAllergen = (a: string) =>
    setExcludedAllergens((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));

  const save = () => {
    setPreferences({ preferredCategories, excludedAllergens });
    toast("취향·알레르기 설정을 저장했어요");
  };

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
              aria-pressed={preferredCategories.includes(c)}
              onClick={() => toggleCategory(c)}
            >
              <span className="chip-icon" aria-hidden="true">
                {CATEGORY_ICONS[c] ?? DEFAULT_CATEGORY_ICON}
              </span>
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
              aria-pressed={excludedAllergens.includes(a)}
              onClick={() => toggleAllergen(a)}
            >
              <span className="chip-icon" aria-hidden="true">
                {ALLERGEN_ICONS[a] ?? DEFAULT_ALLERGEN_ICON}
              </span>
              {excludedAllergens.includes(a) ? "✕ " : ""}
              {a}
            </button>
          ))}
        </div>
      </div>
      <div className="form-actions-stack">
        <button type="button" className="primary full form-btn" disabled={!dirty} onClick={save}>
          취향·알레르기 저장
        </button>
      </div>
    </section>
  );
}
