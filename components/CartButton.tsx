"use client";

import { useCart } from "./CartProvider";

export default function CartButton() {
  const { count, open } = useCart();
  return (
    <button
      type="button"
      className="cart-button"
      aria-label={`장바구니 열기, ${count}개 담김`}
      onClick={(e) => open(e.currentTarget)}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M6 7h12l2 14H4L6 7Z" />
        <path d="M9 8V5a3 3 0 0 1 6 0v3" />
      </svg>
      <span className="cart-text">장바구니</span>
      <span className="cart-count">{count}</span>
    </button>
  );
}
