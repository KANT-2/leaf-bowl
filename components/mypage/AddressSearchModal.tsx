"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 주소를 직접 입력할 수 있도록 예시를 보여주는 보조 화면.
 * 입력한 문구를 그대로 주소 필드에 전달한다.
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
        <h2>주소 직접 입력</h2>
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
          placeholder="도로명과 건물번호를 입력하세요"
          aria-label="도로명 주소 직접 입력"
        />
        <button type="submit" className="primary">
          이 주소 사용
        </button>
      </form>
      <div className="address-search-tip">
        <h3>주소 입력 안내</h3>
        <p>현재 주소 검색은 제공되지 않습니다. 주소를 직접 확인해 입력해 주세요.</p>
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
