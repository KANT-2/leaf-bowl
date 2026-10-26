"use client";
import { useCustomerCatalog } from "../CustomerCatalogProvider";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MemberAuthError } from "@/features/member/client";
import { useAuth } from "../AuthProvider";
import { useToast } from "../ToastProvider";
import AddressSearchModal from "./AddressSearchModal";
import { type Address } from "@/modules/profile/types";

/** 서버 규칙(backend customers.domain.address.MAX_ADDRESSES)과 같은 값 */
const MAX_ADDRESSES = 5;

function AddressForm({
  initial,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial?: Partial<Omit<Address, "id">>;
  onSubmit: (input: Omit<Address, "id">) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const { catalogConfig } = useCustomerCatalog();
  const [label, setLabel] = useState(initial?.label ?? "");
  const [recipientName, setRecipientName] = useState(initial?.recipientName ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [detail, setDetail] = useState(initial?.detail ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [requestNote, setRequestNote] = useState(initial?.requestNote ?? catalogConfig.deliveryRequestPresets[0]);
  const [customNote, setCustomNote] = useState(
    initial?.requestNote && !catalogConfig.deliveryRequestPresets.includes(initial.requestNote)
      ? initial.requestNote
      : "",
  );
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [searchOpen, setSearchOpen] = useState(false);

  const isCustom = requestNote === "직접 입력";

  return (
    <>
      <form
        className="mypage-form address-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!recipientName.trim() || !address.trim()) {
            return;
          }
          onSubmit({
            label: label.trim() || "배송지",
            recipientName: recipientName.trim(),
            address: address.trim(),
            detail: detail.trim(),
            phone: phone.trim(),
            requestNote: isCustom ? customNote.trim() : requestNote,
            isDefault,
          });
        }}
      >
        <label className="field">
          <span>배송지 별칭</span>
          <input value={label} maxLength={20} placeholder="집, 회사 등" onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="field">
          <span>받는 사람</span>
          <input required value={recipientName} maxLength={30} onChange={(e) => setRecipientName(e.target.value)} />
        </label>
        <label className="field">
          <span>주소</span>
          <div className="address-input-row">
            <input required value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
            <button type="button" className="ghost-btn address-search-btn" onClick={() => setSearchOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="10" cy="10" r="6" />
                <path d="m15 15 5 5" />
              </svg>
              주소 검색
            </button>
          </div>
        </label>
        <label className="field">
          <span>상세 주소</span>
          <input value={detail} maxLength={100} onChange={(e) => setDetail(e.target.value)} />
        </label>
        <label className="field">
          <span>연락처</span>
          <input value={phone} maxLength={20} placeholder="010-0000-0000" onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="field">
          <span>배송 요청사항</span>
          <select value={requestNote} onChange={(e) => setRequestNote(e.target.value)}>
            {catalogConfig.deliveryRequestPresets.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value="직접 입력">직접 입력</option>
          </select>
        </label>
        {isCustom && (
          <label className="field">
            <span>요청사항 직접 입력</span>
            <input value={customNote} maxLength={60} onChange={(e) => setCustomNote(e.target.value)} />
          </label>
        )}
        <label className="check-line">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          기본 배송지로 선택
        </label>
        <div className="form-actions-stack">
          <button type="submit" className="primary full form-btn">
            저장
          </button>
          {(onCancel || onDelete) && (
            <div className="form-actions-row">
              {onCancel && (
                <button type="button" className="text-btn" onClick={onCancel}>
                  취소
                </button>
              )}
              {onDelete && (
                <button type="button" className="text-btn text-btn-danger" onClick={onDelete}>
                  삭제
                </button>
              )}
            </div>
          )}
        </div>
      </form>
      <AddressSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(picked) => setAddress(picked)}
      />
    </>
  );
}

export default function AddressTab() {
  const { user, refreshAddresses, addAddress, updateAddress, removeAddress, setDefaultAddress } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving">("loading");
  const [error, setError] = useState("");

  const handleError = (cause: unknown) => {
    if (cause instanceof MemberAuthError) {
      toast(cause.message);
      router.replace("/login?next=/mypage");
      return;
    }
    setError(cause instanceof Error ? cause.message : "요청을 처리하지 못했습니다. 다시 시도해주세요.");
  };

  // 다른 기기에서 바꾼 배송지도 보이도록, 탭을 열 때 서버에 저장된 목록을 다시 불러온다
  useEffect(() => {
    let alive = true;
    refreshAddresses()
      .catch((cause) => alive && handleError(cause))
      .finally(() => alive && setStatus("ready"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 탭을 열 때 한 번만 불러온다
  }, []);

  /** 서버에 저장하고, 성공하면 닫고 알린다. 실패하면 폼을 그대로 두고 이유를 보여준다. */
  const save = async (action: () => Promise<void>, done: string, after?: () => void) => {
    setError("");
    setStatus("saving");
    try {
      await action();
      after?.();
      toast(done);
    } catch (cause) {
      handleError(cause);
    } finally {
      setStatus("ready");
    }
  };

  if (!user) {
    return null;
  }

  const busy = status !== "ready";

  return (
    <section className="surface mypage-section" aria-busy={busy}>
      <div className="section-heading">
        <h2>주소록·배송지 관리</h2>
        <button
          type="button"
          className="ghost-btn"
          disabled={busy || (!adding && user.addresses.length >= MAX_ADDRESSES)}
          onClick={() => {
            setEditingId(null);
            setAdding((v) => !v);
          }}
        >
          {adding ? "닫기" : "+ 배송지 추가"}
        </button>
      </div>
      <p className="meta">
        배송지는 최대 {MAX_ADDRESSES}개까지 저장할 수 있어요. ({user.addresses.length}/{MAX_ADDRESSES})
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {status === "loading" && <p aria-live="polite">저장된 배송지를 불러오고 있어요.</p>}
      {adding && (
        <AddressForm
          onSubmit={(input) =>
            save(
              () => addAddress(input),
              "배송지를 추가했어요",
              () => setAdding(false),
            )
          }
          onCancel={() => setAdding(false)}
        />
      )}
      {user.addresses.length ? (
        <ul className="address-list">
          {user.addresses.map((a) =>
            editingId === a.id ? (
              <li key={a.id} className="address-item">
                <AddressForm
                  initial={a}
                  onSubmit={(input) =>
                    save(
                      () => updateAddress(a.id, input),
                      "배송지를 수정했어요",
                      () => setEditingId(null),
                    )
                  }
                  onCancel={() => setEditingId(null)}
                  onDelete={() =>
                    save(
                      () => removeAddress(a.id),
                      "배송지를 삭제했어요",
                      () => setEditingId(null),
                    )
                  }
                />
              </li>
            ) : (
              <li key={a.id} className="address-item">
                <div className="address-item-top">
                  <strong>
                    {a.recipientName}
                    {a.label && <span className="address-label-tag">{a.label}</span>}
                  </strong>
                  {a.isDefault ? (
                    <span className="address-default-tag">기본 배송지</span>
                  ) : (
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={busy}
                      onClick={() => save(() => setDefaultAddress(a.id), "기본 배송지를 바꿨어요")}
                    >
                      기본으로 설정
                    </button>
                  )}
                </div>
                <p>
                  {a.address}
                  {a.detail ? `, ${a.detail}` : ""}
                </p>
                {a.phone && <p className="meta">{a.phone}</p>}
                {a.requestNote && <p className="meta">배송 요청: {a.requestNote}</p>}
                <div className="row-actions">
                  <button type="button" className="ghost-btn" disabled={busy} onClick={() => setEditingId(a.id)}>
                    수정
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      ) : status !== "loading" ? (
        <p className="empty">저장한 배송지가 없어요. 배송지를 추가해주세요.</p>
      ) : null}
    </section>
  );
}
