import { useEffect, useMemo, useState } from "react";
import { markReviewed, picturesToReview } from "../core/autoImages";
import { addAsset, setSlideField } from "../core/document";
import { ImageSearchDialog } from "./ImageSearchDialog";
import { useServices } from "./services";
import type { LessonSession } from "./useLessonSession";

interface Props {
  session: LessonSession;
  /** Whether swapping starts with drawings only. */
  clipart: boolean;
  onShowSlide(slideId: string): void;
  onClose(): void;
}

/**
 * Every picture filled in automatically on one screen: keep it, or swap it
 * for another result of the same search.
 */
export function ImageReviewDialog({ session, clipart, onShowSlide, onClose }: Props) {
  const { persistence, templates } = useServices();
  const items = useMemo(() => picturesToReview(session.doc, templates), [session.doc, templates]);
  const [swapping, setSwapping] = useState<(typeof items)[number] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !swapping && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, swapping]);

  const assets = new Map(session.doc.assets.map((a) => [a.id, a]));

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog image-review" role="dialog" aria-modal="true" aria-labelledby="image-review-title">
        <header className="dialog-header">
          <h2 id="image-review-title">Duyệt ảnh tự chọn</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </header>
        {items.length === 0 ? (
          <p className="muted">Không còn ảnh nào cần duyệt.</p>
        ) : (
          <p className="muted">
            Ảnh do ứng dụng tự chọn từ kết quả tìm kiếm đầu tiên. Bấm <strong>Đổi</strong> để chọn ảnh khác, hoặc{" "}
            <strong>Giữ</strong> nếu ảnh đã đúng.
          </p>
        )}
        <ul className="review-grid">
          {items.map((item) => {
            const asset = assets.get(item.assetId)!;
            return (
              <li key={`${item.slideId}:${item.path.join(".")}`} className="review-card">
                <img src={persistence.assetUrl(session.dir, asset.file)} alt={item.anchor} />
                <button type="button" className="link review-word" onClick={() => onShowSlide(item.slideId)} title="Mở slide này">
                  Slide {item.slideIndex + 1} · <span lang="zh-CN">{item.anchor}</span>
                </button>
                <div className="review-actions">
                  <button type="button" onClick={() => setSwapping(item)}>
                    Đổi…
                  </button>
                  <button type="button" onClick={() => session.update((d) => markReviewed(d, [item.assetId]))}>
                    Giữ
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Đóng
          </button>
          {items.length > 0 && (
            <button
              type="button"
              className="primary"
              onClick={() => session.update((d) => markReviewed(d, items.map((i) => i.assetId)))}
            >
              Giữ tất cả ({items.length})
            </button>
          )}
        </div>
      </div>
      {swapping && (
        <ImageSearchDialog
          initialQuery={assets.get(swapping.assetId)?.query ?? swapping.anchor}
          initialClipart={clipart}
          onClose={() => setSwapping(null)}
          onPick={async (hit) => {
            const imported = await persistence.importImageUrl(session.dir, [hit.url, hit.thumbnailUrl]);
            session.update((d) => {
              const added = addAsset(d, { file: imported.file, kind: "image", mime: imported.mime, source: hit.sourcePage ?? hit.url });
              // The same file may already be in the lesson, still marked; the teacher chose it now.
              return markReviewed(setSlideField(added.doc, swapping.slideId, swapping.path, added.assetId), [added.assetId]);
            });
          }}
        />
      )}
    </div>
  );
}
