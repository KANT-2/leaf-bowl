"use client";

import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useReviews } from "./ReviewsProvider";
import { useToast } from "./ToastProvider";
import {useCustomerCatalog} from "./CustomerCatalogProvider";
import { createReviewSubmission } from "@/lib/review-submission";
import { shrinkImage } from "@/lib/image";
import { RATE_LABELS, REVIEW_PHOTO_MAX, type Review } from "@/lib/reviews";

const len = (s: string) => [...s].length;

interface OpenOptions {
  /** 등록이 끝난 뒤 부르는 함수 (목록 정렬·스크롤 정리 등) */
  onAdded?: (review: Review) => void;
}

interface ReviewWriteContextValue {
  /** 리뷰 쓰기 모달을 연다. pid 가 null 이면 모달 안에서 메뉴를 고른다. */
  openWrite: (pid: number | null, options?: OpenOptions) => void;
}

const ReviewWriteContext = createContext<ReviewWriteContextValue | null>(null);

export function useReviewWrite(): ReviewWriteContextValue {
  const ctx = useContext(ReviewWriteContext);
  if (!ctx) throw new Error("useReviewWrite must be used inside <ReviewWriteProvider>");
  return ctx;
}

/** 어느 페이지에서든 같은 리뷰 쓰기 모달을 열 수 있게 레이아웃에 한 번 둔다. */
export default function ReviewWriteProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<{ pid: number | null; key: number } | null>(null);
  const onAdded = useRef<OpenOptions["onAdded"]>(undefined);

  const openWrite = useCallback((pid: number | null, options?: OpenOptions) => {
    onAdded.current = options?.onAdded;
    setTarget({ pid, key: Date.now() });
  }, []);

  const value = useMemo(() => ({ openWrite }), [openWrite]);

  return (
    <ReviewWriteContext.Provider value={value}>
      {children}
      {target && (
        <WriteDialog
          key={target.key}
          fixedPid={target.pid}
          onAdded={(r) => onAdded.current?.(r)}
          onClosed={() => setTarget(null)}
        />
      )}
    </ReviewWriteContext.Provider>
  );
}

interface DialogProps {
  fixedPid: number | null;
  onAdded: (review: Review) => void;
  onClosed: () => void;
}

/**
 * 리뷰 쓰기 모달. PC 는 가운데 창, 모바일은 아래에서 올라오는 시트.
 * 작성 중에 닫으려 하면(×, Esc, 바깥 클릭) 한 번 확인한다.
 */
function WriteDialog({ fixedPid, onAdded, onClosed }: DialogProps) {
  const { addReview } = useReviews();
  const {visibleProducts: PRODUCTS, getProduct}=useCustomerCatalog();
  const [saving,setSaving]=useState(false);
  const submission = useRef<ReturnType<typeof createReviewSubmission> | null>(null);
  const pending = useRef(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const dialog = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLSelectElement>(null);
  const firstStar = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  const [pid, setPid] = useState<number | null>(fixedPid);
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [nick, setNick] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [asking, setAsking] = useState(false);

  const dirty = stars > 0 || !!nick.trim() || !!title.trim() || !!text.trim() || photos.length > 0;
  const product = pid === null ? null : getProduct(pid);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    d.showModal();
    (fixedPid === null ? menuRef.current : firstStar.current)?.focus();
    return () => d.close();
  }, [fixedPid]);

  useEffect(() => {
    if (asking) keepRef.current?.focus();
  }, [asking]);

  const close = () => dialog.current?.close();

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = REVIEW_PHOTO_MAX - photos.length;
    const list = [...files].slice(0, room);
    if (files.length > room) toast(`사진은 ${REVIEW_PHOTO_MAX}장까지 올릴 수 있어요`);
    setReading(true);
    const done: string[] = [];
    for (const f of list) {
      try {
        done.push(await shrinkImage(f));
      } catch {
        toast("읽을 수 없는 사진이 있어요. JPG·PNG 사진을 올려주세요");
      }
    }
    setPhotos((cur) => [...cur, ...done].slice(0, REVIEW_PHOTO_MAX));
    setReading(false);
    if (fileRef.current) fileRef.current.value = "";
  };
  const requestClose = () => {
    if (saving) return;
    if (dirty) setAsking(true);
    else close();
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if(pending.current)return;
    const tTitle = title.trim();
    const tText = text.trim();
    const tNick = nick.trim();
    if (pid === null || !getProduct(pid)) {
      setMsg("리뷰를 남길 메뉴를 선택해주세요.");
      menuRef.current?.focus();
      return;
    }
    if (!stars) {
      setMsg("별점을 선택해주세요.");
      firstStar.current?.focus();
      return;
    }
    if (len(tTitle) < 2) {
      setMsg("제목을 2자 이상 입력해주세요.");
      titleRef.current?.focus();
      return;
    }
    if (len(tText) < 10) {
      setMsg("내용을 10자 이상 입력해주세요.");
      textRef.current?.focus();
      return;
    }
    submission.current ??= createReviewSubmission();
    const review = submission.current({
      pid,
      author: tNick ? [...tNick][0] + "**" : "익명",
      stars, title: tTitle, text: tText, via: "delivery",
    }, photos);
    pending.current = true;
    setSaving(true);
    try {
      await addReview(review, photos);
      toast("리뷰가 등록되었어요");
      close();
      onAdded(review);
    } catch {setMsg("리뷰를 저장하지 못했습니다. 다시 시도해주세요.");}
    finally {pending.current = false; setSaving(false);}
  };

  const painted = hover || stars;

  return (
    <dialog
      ref={dialog}
      className="rw"
      aria-labelledby="rwTitle"
      // 개발 모드의 effect 재실행(닫았다 다시 열기)으로 늦게 오는 close 이벤트는 무시한다.
      onClose={() => {
        if (!dialog.current?.open) onClosed();
      }}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <form className="rw-body" onSubmit={submit} noValidate>
        <div className="rw-head">
          <div>
            <span className="eyebrow">WRITE A REVIEW</span>
            <h2 id="rwTitle">{product ? `${product.name}, 어떠셨나요?` : "어떤 메뉴를 드셨나요?"}</h2>
          </div>
          <button type="button" className="rw-close" aria-label="리뷰 쓰기 닫기" onClick={requestClose}>
            ×
          </button>
        </div>

        {fixedPid === null && (
          <label className="field">
            <span>메뉴</span>
            <select
              ref={menuRef}
              value={pid ?? ""}
              onChange={(e) => setPid(e.target.value === "" ? null : Number(e.target.value))}
            >
              <option value="">메뉴를 선택해주세요</option>
              {PRODUCTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset className="rate">
          <legend>별점</legend>
          <div className="rate-row" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className={n <= painted ? "on" : ""} onMouseEnter={() => setHover(n)}>
                <input
                  ref={n === 1 ? firstStar : undefined}
                  type="radio"
                  name="stars"
                  value={n}
                  checked={stars === n}
                  onChange={() => setStars(n)}
                />
                <span aria-hidden="true">★</span>
                <span className="sr-only">{n}점</span>
              </label>
            ))}
          </div>
          <em>{stars ? RATE_LABELS[stars] : "선택해주세요"}</em>
        </fieldset>

        <label className="field">
          <span>
            닉네임 <small>첫 글자만 보이고 나머지는 **로 가려져요</small>
          </span>
          <input
            name="nick"
            maxLength={10}
            placeholder="예: 샐러드러버"
            autoComplete="nickname"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
          />
        </label>
        <label className="field">
          <span>제목</span>
          <input
            ref={titleRef}
            name="title"
            maxLength={30}
            placeholder="한 줄로 요약해주세요 (2~30자)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span>
            내용 <small>{len(text)} / 300</small>
          </span>
          <textarea
            ref={textRef}
            name="text"
            rows={4}
            maxLength={300}
            placeholder="맛, 양, 드레싱 조합 등 어떤 점이 좋았나요? (10자 이상)"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>

        <div className="field rw-photos">
          <span>
            사진 <small>선택 · 최대 {REVIEW_PHOTO_MAX}장</small>
          </span>
          <div className="rw-photo-list">
            {photos.map((src, k) => (
              <div className="rw-photo" key={k}>
                <Image src={src} alt={`첨부 사진 ${k + 1}`} width={80} height={80} unoptimized />
                <button
                  type="button"
                  aria-label={`첨부 사진 ${k + 1} 빼기`}
                  onClick={() => setPhotos((cur) => cur.filter((_, i) => i !== k))}
                >
                  ×
                </button>
              </div>
            ))}
            {photos.length < REVIEW_PHOTO_MAX && (
              <button type="button" className="rw-photo-add" disabled={reading || saving} onClick={() => fileRef.current?.click()}>
                <span aria-hidden="true">＋</span>
                {reading ? "불러오는 중" : "사진 추가"}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void addPhotos(e.target.files)} />
        </div>

        <div className="rw-foot">
          {asking ? (
            <div className="rw-confirm" role="alertdialog" aria-label="작성 취소 확인">
              <p>작성 중인 내용이 사라져요. 닫을까요?</p>
              <div>
                <button type="button" ref={keepRef} className="ghost-btn" onClick={() => setAsking(false)}>
                  계속 쓰기
                </button>
                <button type="button" className="rw-discard" onClick={close}>
                  닫기
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="rv-msg" role="alert">
                {msg}
              </p>
              <button className="primary" type="submit" disabled={saving || reading}>
                {saving ? "저장 중…" : "리뷰 등록하기"}
              </button>
            </>
          )}
        </div>
      </form>
    </dialog>
  );
}
