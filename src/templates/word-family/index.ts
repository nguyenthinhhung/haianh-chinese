import { z } from "zod";
import type { SlideTemplate } from "../../core/template";
import { esc } from "../../renderer/escape";
import { autoText, pinyin, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const item = z.object({
  /** "combine": the two known words the new one is made from. */
  a: z.string().max(8).default(""),
  b: z.string().max(8).default(""),
  word: z.string().regex(/\S/, "Không được để trống").max(8),
  pinyin: z.string().max(40).default(""),
  meaning: z.string().max(40).default(""),
  example: z.string().max(40).default(""),
});

const schema = z.object({
  heading: z.string().max(60).default(""),
  /** "shared": words sharing one character (扩展 同字词); "combine": two old words make a new one (旧字新词). */
  mode: z.enum(["shared", "combine"]).default("shared"),
  character: z.string().max(2).default(""),
  items: z.array(item).min(1, "Cần ít nhất 1 từ").max(6, "Tối đa 6 từ"),
});

export type WordFamilyContent = z.output<typeof schema>;

/** The word with every occurrence of the shared character marked. */
function marked(word: string, character: string): string {
  if (!character) return zh(word, "span", "ls-wf-word");
  const parts = word.split(character).map(esc);
  return `<span class="ls-wf-word" lang="zh-CN">${parts.join(`<b class="ls-wf-mark">${esc(character)}</b>`)}</span>`;
}

export const wordFamily: SlideTemplate<WordFamilyContent> = {
  type: "word-family",
  label: "Mở rộng từ (旧字新词 / 扩展)",
  description: "Từ chung một chữ, hoặc ghép hai từ cũ thành từ mới",
  category: "teach",
  order: 34,
  schema,
  aiSchemaHint:
    'Mở rộng vốn từ như giáo trình: "shared" là các từ có chung một chữ (扩展 同字词 của HSK 4, ví dụ 准: 准时/准备/标准, mỗi từ kèm câu ví dụ); "combine" là ghép hai từ đã học thành từ mới (旧字新词 của HSK 3, ví dụ 旅游 + 客人 → 游客). Bấm Tiếp hiện từng từ. {"heading"?: ví dụ "扩展：同字词" hoặc "旧字新词", "mode": "shared" hoặc "combine", "character"?: chữ chung (với "shared"), "items": [{"a"?, "b"?: hai từ cũ (với "combine"), "word": từ (mới), "pinyin", "meaning": nghĩa tiếng Việt, "example"?: câu ví dụ chữ Hán}] (1–6)}',
  defaults: () => ({
    heading: "扩展：同字词",
    mode: "shared",
    character: "准",
    items: [
      { a: "", b: "", word: "准时", pinyin: "zhǔnshí", meaning: "đúng giờ", example: "请大家准时参加。" },
      { a: "", b: "", word: "准备", pinyin: "zhǔnbèi", meaning: "chuẩn bị", example: "请提前做好准备。" },
      { a: "", b: "", word: "标准", pinyin: "biāozhǔn", meaning: "tiêu chuẩn", example: "美女的标准一直在变。" },
    ],
  }),
  limits: {
    heading: { maxChars: 30 },
    "items.*.example": { maxChars: 24 },
  },
  render(c) {
    const shared = c.mode === "shared";
    const items = c.items
      .map((it, i) => {
        const source = !shared && (it.a || it.b) ? `${zh(it.a, "span", "ls-wf-source")}<span class="ls-wf-op">+</span>${zh(it.b, "span", "ls-wf-source")}<span class="ls-wf-op">→</span>` : "";
        return (
          `<li class="ls-wf-item">` +
          source +
          `<div class="ls-wf-card ls-hide" data-ls-reveal="${i + 1}">` +
          (it.pinyin ? pinyin(it.pinyin, "span", "ls-wf-pinyin") : "") +
          marked(it.word, shared ? c.character.trim() : "") +
          (it.meaning ? vi(it.meaning, "span", "ls-wf-meaning") : "") +
          (it.example ? zh(it.example, "span", "ls-wf-example") : "") +
          `</div>` +
          `</li>`
        );
      })
      .join("");
    return (
      (c.heading ? autoText(c.heading, "h2", "ls-heading") : "") +
      `<div class="ls-wf ls-wf--${shared ? "shared" : "combine"}">` +
      (shared && c.character.trim() ? zh(c.character.trim(), "div", "ls-wf-character") : "") +
      `<ol class="ls-wf-items" data-count="${c.items.length}">${items}</ol></div>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "zh" },
    {
      kind: "select",
      key: "mode",
      label: "Kiểu",
      options: [
        { value: "shared", label: "Từ có chung một chữ (扩展 同字词)" },
        { value: "combine", label: "Ghép hai từ cũ thành từ mới (旧字新词)" },
      ],
    },
    { kind: "text", key: "character", label: "Chữ chung", lang: "zh", placeholder: "准", when: (c: WordFamilyContent) => c.mode === "shared" },
    {
      kind: "list",
      key: "items",
      label: "Từ",
      itemLabel: "từ",
      min: 1,
      max: 6,
      newItem: () => ({ a: "", b: "", word: "", pinyin: "", meaning: "", example: "" }),
      fields: [
        { kind: "text", key: "a", label: "Từ cũ thứ nhất (khi ghép từ)", lang: "zh" },
        { kind: "text", key: "b", label: "Từ cũ thứ hai (khi ghép từ)", lang: "zh" },
        { kind: "text", key: "word", label: "Từ", lang: "zh" },
        { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
        { kind: "text", key: "meaning", label: "Nghĩa", lang: "vi" },
        { kind: "text", key: "example", label: "Câu ví dụ", lang: "zh" },
      ],
    },
  ],
};

export default wordFamily;
