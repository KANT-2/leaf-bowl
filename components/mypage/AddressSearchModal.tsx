"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 주소 검색 모달(디자인만). 실제 주소 검색 API(카카오 우편번호 등) 연동 전까지는
 * 입력한 문구를 그대로 도로명 주소로 돌려준다.
 */
export default function AddressSearchModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (address: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) {
      return;
    }
    if (open && !d.open) {
      setQuery("");
      d.showModal();
    }
    if (!open && d.open) {
      d.close();
    }
  }, [open]);

  return (
    <dialog ref={ref} className="address-search-dialog" onClose={onClose}>
      <div className="dialog-top">
        <h2>우편번호 찾기</h2>
        <button type="button" className="close" aria-label="닫기" onClick={() => ref.current?.close()}>
          ×
        </button>
      </div>
      <form
        className="address-search-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!query.trim()) {
            return;
          }
          onSelect(query.trim());
          ref.current?.close();
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="도로명, 건물명, 번지 검색"
          aria-label="주소 검색"
        />
        <button type="submit" className="primary" aria-label="검색">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="10" cy="10" r="6" />
            <path d="m15 15 5 5" />
          </svg>
        </button>
      </form>
      <div className="address-search-tip">
        <h3>우편번호 통합검색 Tip</h3>
        <ul>
          <li>
            도로명 + <strong>건물번호</strong> (예: 송파대로 570)
          </li>
          <li>
            동/읍/면/리 + <strong>번지</strong> (예: 신천동 7-30)
          </li>
          <li>건물명, 아파트명 (예: 반포자이아파트)</li>
        </ul>
      </div>
    </dialog>
  );
}
