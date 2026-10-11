"use client";
import Image from "next/image";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/admin/alert-dialog";
import { Button } from "@/components/admin/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/admin/dialog";
import { Input } from "@/components/admin/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/admin/tabs";
import {
  reviewDateTime,
  reviewMenuLabel,
  type Catalog,
  type Review,
} from "@/lib/admin/catalog";
import { exampleReviews } from "@/lib/admin/reviews";
import { RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";

export default function ReviewManager({
  catalog,
  busy,
  onSave,
}: {
  catalog: Catalog;
  busy: boolean;
  onSave: (catalog: Catalog) => Promise<void>;
}) {
  const [reviewPage, setReviewPage] = useState(1);
  const [permanentId, setPermanentId] = useState<string | null>(null);
  const [permanentError, setPermanentError] = useState("");
  const [deletedReviewPage, setDeletedReviewPage] = useState(1);
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(""),
    [detailId, setDetailId] = useState<string | null>(null),
    [imageIndex, setImageIndex] = useState(0),
    [reviewFilter, setReviewFilter] = useState(() => {
      if (typeof window === "undefined") return "all";
      const filter = new URL(window.location.href).searchParams.get(
        "reviewType",
      );
      return filter === "text" || filter === "photo" ? filter : "all";
    });
  function selectReviewFilter(value: string) {
    setReviewFilter(value);
    setReviewPage(1);
    const url = new URL(window.location.href);
    url.searchParams.set("reviewType", value);
    window.history.replaceState(window.history.state, "", url);
  }
  const reviews: Review[] = catalog.reviews ?? exampleReviews;
  const detail = reviews.find((r) => r.id === detailId);
  const visible = reviews.filter((r) => !r.deleted),
    removed = reviews.filter((r) => r.deleted),
    filtered = visible.filter(
      (r) =>
        (reviewFilter === "all" ||
          (reviewFilter === "photo"
            ? !!r.images?.length
            : !r.images?.length)) &&
        [r.title, r.body, r.author, reviewMenuLabel(r)].some((t) =>
          t.toLowerCase().includes(query.toLowerCase()),
        ),
    );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 8));
  const currentPage = Math.min(reviewPage, pageCount);
  const pagedReviews = filtered.slice((currentPage - 1) * 8, currentPage * 8);
  const deletedPageCount = Math.max(1, Math.ceil(removed.length / 8));
  const currentDeletedPage = Math.min(deletedReviewPage, deletedPageCount);
  const pagedDeletedReviews = removed.slice(
    (currentDeletedPage - 1) * 8,
    currentDeletedPage * 8,
  );
  async function change(id: string, deleted: boolean) {
    setError("");
    try {
      await onSave({
        ...catalog,
        reviews: reviews.map((r) => (r.id === id ? { ...r, deleted } : r)),
      });
      setSelected(null);
      setReviewPage(currentPage);
      setDeletedReviewPage(currentDeletedPage);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const permanentReview = removed.find((r) => r.id === permanentId);
  async function permanentlyDelete() {
    if (!permanentReview || busy) return;
    setPermanentError("");
    try {
      await onSave({
        ...catalog,
        reviews: reviews.filter((r) => r.id !== permanentReview.id),
      });
      setPermanentId(null);
      setDeletedReviewPage(
        Math.min(
          currentDeletedPage,
          Math.max(1, Math.ceil((removed.length - 1) / 8)),
        ),
      );
    } catch (e) {
      setPermanentError((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CUSTOMER VOICES</div>
          <h1>고객 리뷰 관리</h1>
          <p className="muted">리뷰를 확인하고 부적절한 내용을 삭제하세요.</p>
        </div>
      </div>
      <div className="toolbar">
        <div className="review-filter-controls">
          <Tabs value={reviewFilter} onValueChange={selectReviewFilter}>
            <TabsList aria-label="리뷰 종류">
              <TabsTrigger value="all">전체 리뷰 {visible.length}</TabsTrigger>
              <TabsTrigger value="text">
                글 리뷰 {visible.filter((r) => !r.images?.length).length}
              </TabsTrigger>
              <TabsTrigger value="photo">
                사진 리뷰 {visible.filter((r) => !!r.images?.length).length}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <span className="meta">
            노출 중 {visible.length}개 · 삭제된 리뷰 {removed.length}개
          </span>
        </div>
        <Input
          aria-label="리뷰 검색"
          placeholder="작성자, 메뉴, 리뷰 내용 검색"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setReviewPage(1);
          }}
          style={{ maxWidth: 320 }}
        />
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <section className="surface">
        {pagedReviews.map((r) => (
          <article
            className="managed-review review-clickable"
            key={r.id}
            onClick={() => {
              setDetailId(r.id);
              setImageIndex(0);
            }}
          >
            <div className="section-heading">
              <div>
                <strong>{r.author}</strong>
                <span className="meta"> · {reviewDateTime(r)}</span>
                <div
                  className="review-rating"
                  aria-label={"별점 " + r.rating + "점"}
                >
                  {"★".repeat(r.rating)}
                  {"☆".repeat(5 - r.rating)} <span>{r.rating}.0</span>
                </div>
              </div>
              <Button
                variant="outline"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(r.id);
                }}
              >
                <Trash2 size={15} />
                리뷰 삭제
              </Button>
            </div>
            <h3>
              <button
                type="button"
                className="review-detail-trigger"
                aria-label={r.title + " 리뷰 상세 보기"}
              >
                {r.title}
              </button>
            </h3>
            <p className="review-excerpt">{r.body}</p>
            <div className="section-heading">
              <span className="meta">{reviewMenuLabel(r)}</span>
              <span className="meta">
                {r.images?.length ? "사진 " + r.images.length + "장 · " : ""}
                상세 보기 ↗
              </span>
            </div>
          </article>
        ))}
        {!filtered.length && (
          <div className="empty">
            {query
              ? "검색 결과가 없습니다."
              : reviewFilter === "photo"
                ? "사진 리뷰가 없습니다."
                : reviewFilter === "text"
                  ? "글 리뷰가 없습니다."
                  : "노출 중인 리뷰가 없습니다."}
          </div>
        )}
      </section>
      {filtered.length > 8 && (
        <div className="menu-pagination">
          <nav aria-label="리뷰 목록 페이지">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setReviewPage(currentPage - 1)}
            >
              이전
            </Button>
            {Array.from({ length: pageCount }, (_, i) => (
              <Button
                key={i}
                type="button"
                variant={currentPage === i + 1 ? "default" : "outline"}
                size="sm"
                aria-label={i + 1 + "페이지"}
                aria-current={currentPage === i + 1 ? "page" : undefined}
                onClick={() => setReviewPage(i + 1)}
              >
                {i + 1}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={currentPage === pageCount}
              onClick={() => setReviewPage(currentPage + 1)}
            >
              다음
            </Button>
          </nav>
        </div>
      )}
      {removed.length > 0 && (
        <details className="surface deleted-reviews">
          <summary>삭제된 리뷰 {removed.length}개 · 복원 가능</summary>
          {pagedDeletedReviews.map((r) => (
            <div className="trash-row" key={r.id}>
              <div>
                <strong>{r.title}</strong>
                <div className="meta">
                  {r.author} · {reviewMenuLabel(r)}
                </div>
                <p>{r.body}</p>
              </div>
              <div className="row-actions">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => change(r.id, false)}
                >
                  <RotateCcw size={15} />
                  복원
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    setPermanentError("");
                    setPermanentId(r.id);
                  }}
                >
                  <Trash2 size={15} />
                  영구 삭제
                </Button>
              </div>
            </div>
          ))}
          {removed.length > 8 && (
            <div className="menu-pagination">
              <nav aria-label="삭제된 리뷰 목록 페이지">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={currentDeletedPage === 1}
                  onClick={() => setDeletedReviewPage(currentDeletedPage - 1)}
                >
                  이전
                </Button>
                {Array.from({ length: deletedPageCount }, (_, i) => (
                  <Button
                    key={i}
                    type="button"
                    variant={
                      currentDeletedPage === i + 1 ? "default" : "outline"
                    }
                    size="sm"
                    aria-label={i + 1 + "페이지"}
                    aria-current={
                      currentDeletedPage === i + 1 ? "page" : undefined
                    }
                    onClick={() => setDeletedReviewPage(i + 1)}
                  >
                    {i + 1}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={currentDeletedPage === deletedPageCount}
                  onClick={() => setDeletedReviewPage(currentDeletedPage + 1)}
                >
                  다음
                </Button>
              </nav>
            </div>
          )}
        </details>
      )}
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <DialogContent className="editor-dialog review-detail-dialog">
          <DialogHeader>
            <DialogTitle>{detail?.title || "리뷰 상세"}</DialogTitle>
            <DialogDescription>
              {detail?.author} · {detail ? reviewDateTime(detail) : ""}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <>
              <section
                aria-label="리뷰 첨부 이미지"
                className="review-attachments"
              >
                {detail.images?.length ? (
                  <>
                    <h3>첨부 사진 {detail.images.length}장</h3>
                    <div className="review-image-stage">
                      <Image
                        unoptimized
                        width={1024}
                        height={1024}
                        className="review-large-image"
                        src={detail.images[imageIndex] || detail.images[0]}
                        alt={"리뷰 첨부 사진 " + (imageIndex + 1)}
                      />
                      {detail.images.length > 1 && (
                        <>
                          <button
                            type="button"
                            className="review-photo-arrow previous"
                            aria-label="이전 리뷰 사진"
                            disabled={imageIndex === 0}
                            onClick={() =>
                              setImageIndex((i) => Math.max(0, i - 1))
                            }
                          >
                            ←
                          </button>
                          <button
                            type="button"
                            className="review-photo-arrow next"
                            aria-label="다음 리뷰 사진"
                            disabled={imageIndex === detail.images.length - 1}
                            onClick={() =>
                              setImageIndex((i) =>
                                Math.min(detail.images!.length - 1, i + 1),
                              )
                            }
                          >
                            →
                          </button>
                          <span
                            className="review-photo-counter"
                            aria-live="polite"
                          >
                            {imageIndex + 1} / {detail.images.length}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="review-image-thumbnails">
                      {detail.images.map((src, i) => (
                        <button
                          key={i}
                          type="button"
                          className={imageIndex === i ? "selected" : ""}
                          aria-label={"첨부 사진 " + (i + 1) + " 크게 보기"}
                          aria-pressed={imageIndex === i}
                          onClick={() => setImageIndex(i)}
                        >
                          <Image
                            unoptimized
                            width={1024}
                            height={1024}
                            src={src}
                            alt={"첨부 사진 " + (i + 1)}
                          />
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="meta">첨부된 사진이 없습니다.</p>
                )}
              </section>
              <div
                className="review-rating"
                aria-label={"별점 " + detail.rating + "점"}
              >
                {"★".repeat(detail.rating)}
                {"☆".repeat(5 - detail.rating)} <span>{detail.rating}.0</span>
              </div>
              <div className="meta">
                {reviewMenuLabel(detail)}
                {detail.deleted ? " · 삭제된 리뷰" : ""}
              </div>
              <p className="review-full-body">{detail.body}</p>
              <div className="form-footer">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDetailId(null)}
                >
                  닫기
                </Button>
                {!detail.deleted && (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setDetailId(null);
                      setSelected(detail.id);
                    }}
                  >
                    <Trash2 size={15} />
                    리뷰 삭제
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!permanentReview}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setPermanentId(null);
            setPermanentError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 리뷰를 영구 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              “{permanentReview?.title}” 리뷰를 저장된 목록에서 완전히
              삭제합니다. 영구 삭제하면 복원할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {permanentError && (
            <p className="error" role="alert">
              {permanentError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void permanentlyDelete()}
            >
              {busy ? "삭제 중…" : "영구 삭제"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 리뷰를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              삭제하면 고객 미리보기에서 제외됩니다. 삭제된 리뷰 목록에서 다시
              복원할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
            <Button
              disabled={busy}
              onClick={() => selected && change(selected, true)}
            >
              리뷰 삭제
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
