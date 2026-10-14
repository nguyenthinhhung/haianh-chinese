import { useMemo, useState } from "react";
import { AGE_PROFILES, ageRangeLabel } from "../core/ages";
import { markReviewed } from "../core/autoImages";
import { addAsset, setSettings, setSlideField, setTheme } from "../core/document";
import { checkLimits, getIn, type Path } from "../core/fields";
import type { LessonDocument, Slide } from "../core/schema";
import { hanziToPinyin, pinyinFits, pinyinPairs } from "../core/pinyin";
import type { AnySlideTemplate, EditorField, EditorFieldSpec } from "../core/template";
import type { ImportedAsset } from "../platform/persistence";
import { ImageSearchDialog } from "./ImageSearchDialog";
import { prefersClipart } from "./useImageFill";
import type { LessonSession } from "./useLessonSession";
import { useServices } from "./services";

const LANG_ATTR = { zh: "zh-CN", vi: "vi", pinyin: "zh-Latn-pinyin" } as const;

type Messages = Map<string, { errors: string[]; warnings: string[] }>;

const pathKey = (path: Path) => path.join(".");

/** Schema errors and soft-limit warnings for a slide, keyed by content path. */
function slideMessages(template: AnySlideTemplate, content: unknown): Messages {
  const map: Messages = new Map();
  const at = (path: Path) => {
    const key = pathKey(path);
    if (!map.has(key)) map.set(key, { errors: [], warnings: [] });
    return map.get(key)!;
  };
  const parsed = template.schema.safeParse(content);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) at(issue.path as Path).errors.push(issue.message);
  }
  for (const w of checkLimits(content, template.limits)) at(w.path).warnings.push(w.message);
  return map;
}

interface FieldProps {
  field: EditorField;
  /** The fields next to this one (the slide's, or a list item's), to find its pinyin partner. */
  siblings: EditorFieldSpec;
  path: Path;
  content: unknown;
  messages: Messages;
  session: LessonSession;
  slide: Slide;
}

function FieldMessages({ messages, path }: { messages: Messages; path: Path }) {
  const m = messages.get(pathKey(path));
  if (!m) return null;
  return (
    <>
      {m.errors.map((e) => (
        <p key={e} className="field-error">
          {e}
        </p>
      ))}
      {m.warnings.map((w) => (
        <p key={w} className="field-warning">
          {w}
        </p>
      ))}
    </>
  );
}

/** First URL in dropped data: a link list, an `<img>` in dropped HTML, or plain text. */
function droppedUrl(data: DataTransfer): string | null {
  const uri = data
    .getData("text/uri-list")
    .split(/\r?\n/)
    .find((l) => l && !l.startsWith("#"));
  if (uri) return uri.trim();
  const html = data.getData("text/html");
  if (html) {
    // DOMParser builds an inert document: nothing in it loads or runs.
    const src = new DOMParser().parseFromString(html, "text/html").querySelector("img")?.getAttribute("src");
    if (src) return src;
  }
  const text = data.getData("text/plain").trim();
  return /^(https?:|data:image\/)/.test(text) ? text : null;
}

function dataUrlBytes(url: string): Uint8Array | null {
  const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(url);
  return m ? Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0)) : null;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function AssetField({ field, path, content, session, slide }: FieldProps & { field: Extract<EditorField, { kind: "asset" }> }) {
  const { persistence, themes } = useServices();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const assetId = getIn(content, path) as string | undefined;
  const asset = assetId ? session.doc.assets.find((a) => a.id === assetId) : undefined;
  const isImage = field.assetKind === "image";

  const sibling = (key: string) => {
    const v = getIn(content, [...path.slice(0, -1), key]);
    return typeof v === "string" ? v.trim() : "";
  };
  const searchQuery = (field.searchFrom ?? []).map(sibling).find(Boolean) ?? "";
  const speakText = field.speakFrom ? sibling(field.speakFrom) : "";

  function attach(imported: ImportedAsset, source?: string) {
    session.update((d) => {
      const added = addAsset(d, { file: imported.file, kind: field.assetKind, mime: imported.mime, ...(source ? { source } : {}) });
      // The same file may already be in the lesson, still marked; the teacher chose it now.
      return markReviewed(setSlideField(added.doc, slide.id, path, added.assetId), [added.assetId]);
    });
  }

  async function run(label: string, action: () => Promise<ImportedAsset | null>, source?: string) {
    setError(null);
    setBusy(label);
    try {
      const imported = await action();
      if (imported) attach(imported, source);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const importBytes = (bytes: Uint8Array) => run("Đang thêm ảnh…", () => persistence.importImageBytes(session.dir, bytes));

  function onPaste(e: React.ClipboardEvent) {
    if (!isImage || busy) return;
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (!file) return;
    e.preventDefault();
    void file.arrayBuffer().then((b) => importBytes(new Uint8Array(b)));
  }

  function onDrop(e: React.DragEvent) {
    if (!isImage) return;
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
    if (file) {
      void file.arrayBuffer().then((b) => importBytes(new Uint8Array(b)));
      return;
    }
    const url = droppedUrl(e.dataTransfer);
    const bytes = url ? dataUrlBytes(url) : null;
    if (bytes) void importBytes(bytes);
    else if (url && /^https?:/.test(url)) void run("Đang tải ảnh…", () => persistence.importImageUrl(session.dir, [url]), url);
    else setError("Không nhận được ảnh. Thử chuột phải vào ảnh → Sao chép hình ảnh, rồi bấm vào đây và Ctrl+V.");
  }

  return (
    <div
      className={`asset-field${isImage ? " asset-drop" : ""}${dragOver ? " drag-over" : ""}`}
      tabIndex={isImage ? 0 : undefined}
      onPaste={onPaste}
      onDragOver={(e) => {
        if (!isImage) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {asset && isImage && <img className="asset-thumb" src={persistence.assetUrl(session.dir, asset.file)} alt="" />}
      {asset?.needsReview && (
        <p className="asset-review">
          <span>Ảnh tự chọn, chưa duyệt.</span>
          <button type="button" onClick={() => session.update((d) => markReviewed(d, [asset.id]))}>
            Giữ ảnh này
          </button>
        </p>
      )}
      {asset && !isImage && <audio controls preload="none" src={persistence.assetUrl(session.dir, asset.file)} />}
      {asset?.source && (
        <p className="asset-source muted" title={asset.source}>
          Nguồn: {hostOf(asset.source)}
        </p>
      )}
      <div className="asset-actions">
        {isImage && (
          <button type="button" className="primary" disabled={!!busy} onClick={() => setSearching(true)}>
            {asset?.needsReview ? "Đổi ảnh…" : "Tìm ảnh…"}
          </button>
        )}
        {field.speakFrom && (
          <button
            type="button"
            className="primary"
            disabled={!!busy || !speakText}
            title={speakText ? `Đọc “${speakText}” bằng giọng Google Dịch` : "Nhập chữ Hán trước"}
            onClick={() => void run("Đang tạo giọng đọc…", () => persistence.speakChinese(session.dir, speakText))}
          >
            🔊 Tạo giọng đọc
          </button>
        )}
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void run("Đang mở file…", () => persistence.importAsset(session.dir, field.assetKind))}
        >
          {asset ? "Thay bằng file…" : "Chọn file…"}
        </button>
        {asset && (
          <button type="button" disabled={!!busy} onClick={() => session.update((d) => setSlideField(d, slide.id, path, undefined))}>
            Bỏ
          </button>
        )}
      </div>
      {isImage && <p className="asset-hint muted">{busy ?? "hoặc dán ảnh (Ctrl+V) / kéo ảnh vào đây"}</p>}
      {!isImage && busy && <p className="asset-hint muted">{busy}</p>}
      {error && <p className="field-error">{error}</p>}
      {searching && (
        <ImageSearchDialog
          initialQuery={asset?.query ?? searchQuery}
          initialClipart={prefersClipart(session.doc, themes)}
          onClose={() => setSearching(false)}
          onPick={async (hit) => {
            // Many sites refuse downloads from apps; Bing's copy is the fallback.
            const imported = await persistence.importImageUrl(session.dir, [hit.url, hit.thumbnailUrl]);
            attach(imported, hit.sourcePage ?? hit.url);
          }}
        />
      )}
    </div>
  );
}

function ListField(props: FieldProps & { field: Extract<EditorField, { kind: "list" }> }) {
  const { field, path, content, session, slide } = props;
  const items = (getIn(content, path) as unknown[] | undefined) ?? [];
  const setItems = (next: unknown[]) => session.update((d) => setSlideField(d, slide.id, path, next));

  const move = (from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setItems(next);
  };

  return (
    <div className="list-field">
      {items.map((_, i) => (
        <fieldset key={i} className="list-item">
          <legend>
            {field.itemLabel} {i + 1}
          </legend>
          <div className="list-item-actions">
            <button type="button" title="Lên" disabled={i === 0} onClick={() => move(i, i - 1)}>
              ↑
            </button>
            <button type="button" title="Xuống" disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
              ↓
            </button>
            <button
              type="button"
              title={`Xoá ${field.itemLabel}`}
              disabled={items.length <= field.min}
              onClick={() => setItems(items.filter((_, k) => k !== i))}
            >
              ✕
            </button>
          </div>
          {field.fields.map((sub) => (
            <Field key={sub.key} {...props} field={sub} siblings={field.fields} path={[...path, i, sub.key]} />
          ))}
        </fieldset>
      ))}
      <button
        type="button"
        className="add-item"
        disabled={items.length >= field.max}
        onClick={() => setItems([...items, field.newItem()])}
      >
        + Thêm {field.itemLabel}
      </button>
      <FieldMessages messages={props.messages} path={path} />
    </div>
  );
}

function Field(props: FieldProps) {
  const { field, siblings, path, content, session, slide, messages } = props;
  if (field.when && !field.when(getIn(content, path.slice(0, -1)))) return null;
  const value = getIn(content, path);
  const id = `f-${slide.id}-${pathKey(path)}`;
  const set = (v: unknown) => session.update((d) => setSlideField(d, slide.id, path, v), { coalesce: id });
  const sibling = (key: string) => [...path.slice(0, -1), key];
  const pair = pinyinPairs(siblings).find((p) => p.hanzi === field.key || p.pinyin === field.key);
  let fill: React.ReactNode = null;

  let control: React.ReactNode;
  switch (field.kind) {
    case "text": {
      let onChange = (text: string) => set(text);
      if (pair?.hanzi === field.key) {
        // Pinyin follows the characters while it is empty or still what was filled in for them.
        onChange = (text: string) => {
          const old = getIn(content, sibling(pair.pinyin));
          const follows = !old || old === hanziToPinyin(typeof value === "string" ? value : "");
          session.update((d) => {
            const next = setSlideField(d, slide.id, path, text);
            return follows ? setSlideField(next, slide.id, sibling(pair.pinyin), hanziToPinyin(text)) : next;
          }, { coalesce: id });
        };
      } else if (pair?.pinyin === field.key) {
        const hanzi = getIn(content, sibling(pair.hanzi));
        const suggested = typeof hanzi === "string" ? hanziToPinyin(hanzi) : "";
        // Offered only when the pinyin is missing or cannot be right, not for every difference in style.
        const current = typeof value === "string" ? value : "";
        if (suggested && suggested !== current && (!current.trim() || !pinyinFits(hanzi as string, current))) {
          fill = (
            <button type="button" className="ghost field-fill" title={`Điền "${suggested}" theo chữ Hán`} onClick={() => set(suggested)}>
              Tự điền
            </button>
          );
        }
      }
      const common = {
        id,
        value: typeof value === "string" ? value : "",
        placeholder: field.placeholder,
        lang: field.lang ? LANG_ATTR[field.lang] : undefined,
        className: field.lang === "zh" ? "input-zh" : undefined,
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
      };
      control = field.multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} />;
      break;
    }
    case "toggle":
      return (
        <div className="field field-toggle">
          <label>
            <input type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} /> {field.label}
          </label>
          <FieldMessages messages={messages} path={path} />
        </div>
      );
    case "select":
      control = (
        <select id={id} value={String(value ?? "")} onChange={(e) => set(e.target.value)}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case "asset":
      control = <AssetField {...props} field={field} />;
      break;
    case "list":
      return (
        <div className="field">
          <span className="field-label">{field.label}</span>
          <ListField {...props} field={field} />
        </div>
      );
  }

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {field.label}
        {fill}
      </label>
      {control}
      <FieldMessages messages={messages} path={path} />
    </div>
  );
}

function SlideProperties({ session, slide }: { session: LessonSession; slide: Slide }) {
  const { templates } = useServices();
  const template = templates.require(slide.type);
  const messages = useMemo(() => slideMessages(template, slide.content), [template, slide.content]);
  return (
    <div className="props-section">
      <h3>{template.label}</h3>
      {template.editor.map((field) => (
        <Field
          key={field.key}
          field={field}
          siblings={template.editor}
          path={[field.key]}
          content={slide.content}
          messages={messages}
          session={session}
          slide={slide}
        />
      ))}
    </div>
  );
}

function LessonProperties({ session }: { session: LessonSession }) {
  const { themes } = useServices();
  const doc: LessonDocument = session.doc;
  return (
    <div className="props-section">
      <div className="field">
        <label className="field-label" htmlFor="lesson-theme">
          Theme
        </label>
        <select id="lesson-theme" value={doc.theme.id} onChange={(e) => session.update((d) => setTheme(d, e.target.value))}>
          {themes
            .list()
            .map((t) => ({ t, youngest: AGE_PROFILES.findIndex((a) => t.ages.includes(a.id)) }))
            .sort((a, b) => a.youngest - b.youngest)
            .map(({ t }) => (
            <option key={t.id} value={t.id}>
              {t.label} ({ageRangeLabel(t.ages)})
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="lesson-font">
          Kiểu chữ Hán
        </label>
        <select
          id="lesson-font"
          value={doc.settings.hanziFont}
          onChange={(e) => session.update((d) => setSettings(d, { hanziFont: e.target.value as "sans" | "kai" }))}
        >
          <option value="sans">Chữ in (Hei)</option>
          <option value="kai">Chữ Khải (楷体)</option>
        </select>
      </div>
      <div className="field field-toggle">
        <label>
          <input
            type="checkbox"
            checked={doc.settings.sound}
            onChange={(e) => session.update((d) => setSettings(d, { sound: e.target.checked }))}
          />{" "}
          Âm thanh phản hồi
        </label>
      </div>
      <div className="field field-toggle">
        <label title="Tắt cho lớp đã đọc được chữ Hán; slide luyện thanh điệu vẫn giữ pinyin.">
          <input
            type="checkbox"
            checked={doc.settings.pinyin}
            onChange={(e) => session.update((d) => setSettings(d, { pinyin: e.target.checked }))}
          />{" "}
          Hiện pinyin
        </label>
      </div>
      <div className="field field-toggle">
        <label>
          <input
            type="checkbox"
            checked={doc.settings.animations}
            onChange={(e) => session.update((d) => setSettings(d, { animations: e.target.checked }))}
          />{" "}
          Hiệu ứng chuyển động
        </label>
      </div>
    </div>
  );
}

export function PropertiesPanel({ session, slide }: { session: LessonSession; slide: Slide | undefined }) {
  const [tab, setTab] = useState<"slide" | "lesson">("slide");
  return (
    <aside className="properties" aria-label="Thuộc tính">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "slide"} onClick={() => setTab("slide")}>
          Slide
        </button>
        <button role="tab" aria-selected={tab === "lesson"} onClick={() => setTab("lesson")}>
          Bài học
        </button>
      </div>
      <div className="props-body">
        {tab === "lesson" ? (
          <LessonProperties session={session} />
        ) : slide ? (
          <SlideProperties session={session} slide={slide} />
        ) : (
          <p className="muted">Chưa chọn slide.</p>
        )}
      </div>
    </aside>
  );
}
