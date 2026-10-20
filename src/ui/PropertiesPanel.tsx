import { useMemo, useState } from "react";
import { blankContent } from "../core/blank";
import { fillFromLessonWords, setSettings, setSlideContent, setSlideField, setTheme } from "../core/document";
import { lessonWordEntries } from "../core/lessonWords";
import { SHORTCUTS } from "./shortcuts";
import { checkLimits, type Path } from "../core/fields";
import { formFromLesson } from "../core/lessonForm";
import type { LessonDocument, Slide } from "../core/schema";
import type { AnySlideTemplate } from "../core/template";
import { addMessage, FormFields, type FormTarget, type Messages } from "./FormFields";
import { saveForm } from "./lessonForms";
import { ThemeOptions } from "./ThemeOptions";
import type { LessonSession } from "./useLessonSession";
import { useServices } from "./services";

/** Schema errors and soft-limit warnings for a slide, keyed by content path. */
function slideMessages(template: AnySlideTemplate, content: unknown): Messages {
  const map: Messages = new Map();
  const parsed = template.schema.safeParse(content);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) addMessage(map, issue.path as Path, "error", issue.message);
  }
  for (const w of checkLimits(content, template.limits)) addMessage(map, w.path, "warning", w.message);
  return map;
}

/**
 * Quick ways to fill a slide: the lesson's words from other slides, the
 * template's sample, or nothing at all. Each is one step to undo.
 */
function SlideFill({ session, slide }: { session: LessonSession; slide: Slide }) {
  const { templates } = useServices();
  const template = templates.require(slide.type);
  const [note, setNote] = useState<string | null>(null);
  const undo = `${SHORTCUTS.undo} để hoàn tác.`;

  function takeLessonWords() {
    const words = lessonWordEntries(session.doc, templates, slide.id);
    if (!words.length) return setNote("Các slide khác trong bài chưa có từ nào để lấy.");
    let added = 0;
    session.update((d) => {
      const r = fillFromLessonWords(d, templates, slide.id, words);
      added = r.added;
      return r.doc;
    });
    setNote(added ? `Đã thêm ${added} từ trong bài; bỏ bớt từ không dùng ở danh sách bên dưới. ${undo}` : "Các từ trong bài đều đã có ở slide này (hoặc danh sách đã đầy).");
  }

  return (
    <div className="slide-fill">
      <div className="slide-fill-buttons">
        {template.fromWords && (
          <button type="button" onClick={takeLessonWords} title="Điền các từ đã có ở những slide khác trong bài, kèm pinyin, nghĩa, ảnh">
            Lấy từ trong bài
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            session.update((d) => setSlideContent(d, slide.id, template.defaults()));
            setNote(`Đã điền nội dung mẫu. ${undo}`);
          }}
          title="Điền ví dụ mẫu để xem dạng slide này trông thế nào"
        >
          Nội dung mẫu
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            session.update((d) => setSlideContent(d, slide.id, blankContent(template)));
            setNote(`Đã xoá nội dung slide. ${undo}`);
          }}
          title="Xoá hết chữ, ảnh, âm thanh của slide này để soạn lại từ đầu"
        >
          Xoá nội dung
        </button>
      </div>
      {note && <p className="slide-fill-note muted">{note}</p>}
    </div>
  );
}

function SlideProperties({ session, slide }: { session: LessonSession; slide: Slide }) {
  const { templates } = useServices();
  const template = templates.require(slide.type);
  const messages = useMemo(() => slideMessages(template, slide.content), [template, slide.content]);
  const target: FormTarget = {
    id: slide.id,
    content: slide.content,
    set: (d, path, value) => setSlideField(d, slide.id, path, value),
  };
  return (
    <div className="props-section">
      <h3>{template.label}</h3>
      {/* Keyed by slide, so a note about one slide does not stay on the next. */}
      <SlideFill key={slide.id} session={session} slide={slide} />
      <FormFields fields={template.editor} target={target} session={session} messages={messages} />
    </div>
  );
}

function LessonProperties({ session }: { session: LessonSession }) {
  const doc: LessonDocument = session.doc;
  return (
    <div className="props-section">
      <div className="field">
        <label className="field-label" htmlFor="lesson-theme">
          Theme
        </label>
        <select id="lesson-theme" value={doc.theme.id} onChange={(e) => session.update((d) => setTheme(d, e.target.value))}>
          <ThemeOptions />
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
      <SaveAsForm doc={doc} />
    </div>
  );
}

/**
 * Saves this lesson's order and kinds of slides as the teacher's form, so the
 * AI makes every later lesson the same way.
 */
function SaveAsForm({ doc }: { doc: LessonDocument }) {
  const { templates } = useServices();
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<{ name: string; parts: number } | "failed" | null>(null);

  function save() {
    const form = formFromLesson(name, doc, templates);
    setSaved(saveForm(form, templates) ? { name: form.name, parts: form.steps.length } : "failed");
  }

  return (
    <div className="field form-save">
      <span className="field-label">Khung bài</span>
      <p className="muted">
        Lưu thứ tự và loại slide của bài này (kèm tiêu đề và ghi chú) làm khung. Khi <strong>Tạo bài bằng AI</strong>, chọn khung ở mục
        Dạng bài để mọi bài soạn theo cùng một khung; sau đó tự chèn thêm phần riêng cho từng lớp.
      </p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên khung, ví dụ: Khung HSK1" aria-label="Tên khung bài" />
      <button type="button" disabled={!name.trim() || !doc.slides.length} onClick={save}>
        Lưu làm khung bài
      </button>
      {saved && saved !== "failed" && (
        <span className="muted">
          Đã lưu khung “{saved.name}” ({saved.parts} phần).
        </span>
      )}
      {saved === "failed" && <span className="field-error">Không lưu được khung bài trên máy này.</span>}
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
