import { useEffect, useRef, useState } from "react";
import type { ImageHit } from "../platform/persistence";
import { useServices } from "./services";

interface Props {
  initialQuery: string;
  /** Start with drawings only (clipart), which suit young children. */
  initialClipart?: boolean;
  /** Imports the chosen image; a rejection is shown in the dialog and keeps it open. */
  onPick(hit: ImageHit): Promise<void>;
  onClose(): void;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ImageSearchDialog({ initialQuery, initialClipart = false, onPick, onClose }: Props) {
  const { persistence } = useServices();
  const [query, setQuery] = useState(initialQuery);
  const [clipart, setClipart] = useState(initialClipart);
  const [hits, setHits] = useState<ImageHit[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState("");
  // Results of a superseded search are dropped when they arrive late.
  const searchId = useRef(0);

  async function search(q: string, nextPage: number, drawings = clipart) {
    const term = q.trim();
    if (!term) return;
    const id = ++searchId.current;
    setError(null);
    setLoading(true);
    try {
      const found = await persistence.searchImages(term, nextPage, drawings);
      if (id !== searchId.current) return;
      setSearched(term);
      setPage(nextPage);
      setHits((prev) => {
        if (nextPage === 0) return found;
        const seen = new Set(prev.map((h) => h.url));
        return [...prev, ...found.filter((h) => !seen.has(h.url))];
      });
    } catch (e) {
      if (id === searchId.current) setError(errorText(e));
    } finally {
      if (id === searchId.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (initialQuery.trim()) void search(initialQuery, 0);
    // Only the query the dialog opened with searches automatically.
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !picking && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, picking]);

  async function pick(hit: ImageHit) {
    setError(null);
    setPicking(hit.url);
    try {
      await onPick(hit);
      onClose();
    } catch (e) {
      setError(`Không tải được ảnh này: ${errorText(e)} Hãy chọn ảnh khác.`);
    } finally {
      setPicking(null);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !picking && onClose()}>
      <div className="dialog image-search" role="dialog" aria-modal="true" aria-labelledby="image-search-title">
        <header className="dialog-header">
          <h2 id="image-search-title">Tìm ảnh</h2>
          <button type="button" className="ghost" onClick={onClose} disabled={!!picking} aria-label="Đóng">
            ✕
          </button>
        </header>
        <form
          className="image-search-form"
          onSubmit={(e) => {
            e.preventDefault();
            setHits([]);
            void search(query, 0);
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ví dụ: quả táo hoạt hình"
            aria-label="Từ khoá"
          />
          <button type="submit" className="primary" disabled={!query.trim() || loading}>
            Tìm
          </button>
        </form>
        <label className="image-search-tip">
          <input
            type="checkbox"
            checked={clipart}
            onChange={(e) => {
              setClipart(e.target.checked);
              setHits([]);
              void search(query, 0, e.target.checked);
            }}
          />{" "}
          Chỉ hình vẽ (đơn giản, dễ nhìn cho trẻ nhỏ)
          <span className="muted"> · tìm bằng tiếng Anh thường ra ảnh đúng hơn, ví dụ “orange fruit”</span>
        </label>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <div className="image-results" aria-busy={loading}>
          {hits.map((hit) => (
            <button
              key={hit.url}
              type="button"
              className={`image-hit${picking === hit.url ? " picking" : ""}`}
              title={hit.title}
              disabled={!!picking}
              onClick={() => void pick(hit)}
            >
              <img src={hit.thumbnail} alt={hit.title} />
              {picking === hit.url && <span className="image-hit-status">Đang tải…</span>}
            </button>
          ))}
        </div>

        {loading && <p className="muted">Đang tìm…</p>}
        {!loading && searched && hits.length === 0 && !error && (
          <p className="muted">Không tìm thấy ảnh cho “{searched}”. Thử từ khoá khác.</p>
        )}
        {!loading && hits.length > 0 && (
          <div className="form-actions">
            <button type="button" onClick={() => void search(searched, page + 1)} disabled={!!picking}>
              Xem thêm
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
