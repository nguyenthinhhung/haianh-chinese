import { z } from "zod";
import type { SlideTemplate } from "../../core/template";
import { esc } from "../../renderer/escape";
import { autoText, splitParts, vi } from "../../renderer/helpers";
import css from "./style.css?raw";

const part = z.object({
  text: z.string().regex(/\S/, "Không được để trống").max(24),
  note: z.string().max(30).default(""),
});

const example = z
  .object({
    hanzi: z.string().max(60).default(""),
    pinyin: z.string().max(160).default(""),
    meaning: z.string().max(120).default(""),
  })
  // An example may be given only in Vietnamese, for the class to translate.
  .refine((e) => /\S/.test(e.hanzi) || /\S/.test(e.meaning), { message: "Cần câu chữ Hán hoặc nghĩa", path: ["hanzi"] });

const schema = z.object({
  heading: z.string().max(60).default(""),
  pattern: z.array(part).min(1, "Cần ít nhất 1 thành phần").max(5, "Tối đa 5 thành phần"),
  explanation: z.string().max(300).default(""),
  examples: z.array(example).max(4, "Tối đa 4 câu ví dụ").default([]),
  stepByStep: z.boolean().default(true),
  /** The class translates the examples: the Vietnamese shows, Next reveals the Chinese. */
  translate: z.boolean().default(false),
});

export type GrammarContent = z.output<typeof schema>;

/**
 * Splits an example at "/" into parts coloured like the pattern's parts, so
 * "我 / 是 / 学生" matches "主语 + 是 + 名词". Text without "/" is one part.
 */
function coloredParts(text: string, lang: "zh-CN" | "zh-Latn-pinyin", cls: string, joiner: string): string {
  const spans = splitParts(text).map((p, i) => `<span class="ls-gr-c${(i % 5) + 1}">${esc(p)}</span>`).join(joiner);
  return `<span class="${cls}" lang="${lang}">${spans}</span>`;
}

export const grammar: SlideTemplate<GrammarContent> = {
  type: "grammar",
  label: "Ngữ pháp",
  description: "Mẫu câu tô màu từng thành phần, kèm ví dụ",
  category: "teach",
  order: 60,
  schema,
  aiSchemaHint:
    'Cấu trúc ngữ pháp có tô màu thành phần. {"heading"?: tiêu đề, "pattern": [{"text": thành phần, ví dụ "主语" hoặc "是", "note"?: giải thích ngắn tiếng Việt}], "explanation"?: giải thích tiếng Việt, "examples": [{"hanzi": câu ví dụ, các thành phần ngăn bằng " / " theo đúng thứ tự pattern, "pinyin": cũng ngăn bằng " / ", "meaning": nghĩa tiếng Việt}] (tối đa 4), "stepByStep"?: true để hiện từng ví dụ khi bấm Tiếp, "translate"?: true để cả lớp dịch câu ví dụ: hiện tiếng Việt, bấm Tiếp hiện câu chữ Hán và pinyin}',
  defaults: () => ({
    heading: "Câu với 是",
    pattern: [
      { text: "A", note: "người / vật" },
      { text: "是", note: "là" },
      { text: "B", note: "danh từ" },
    ],
    explanation: "Dùng 是 để nói ai đó / cái gì đó là gì.",
    examples: [
      { hanzi: "我 / 是 / 学生", pinyin: "wǒ / shì / xué sheng", meaning: "Tôi là học sinh." },
      { hanzi: "他 / 是 / 老师", pinyin: "tā / shì / lǎo shī", meaning: "Anh ấy là giáo viên." },
    ],
    stepByStep: true,
    translate: false,
  }),
  limits: {
    heading: { maxChars: 40 },
    "pattern.*.text": { maxChars: 12 },
    "pattern.*.note": { maxChars: 16 },
    explanation: { maxChars: 140 },
    "examples.*.hanzi": { maxChars: 24 },
    "examples.*.pinyin": { maxChars: 60 },
    "examples.*.meaning": { maxChars: 50 },
  },
  render(c) {
    const pattern = c.pattern
      .map(
        (p, i) =>
          (i > 0 ? `<span class="ls-gr-plus" aria-hidden="true">+</span>` : "") +
          `<span class="ls-gr-part ls-gr-c${(i % 5) + 1}">` +
          autoText(p.text, "span", "ls-gr-text") +
          (p.note ? vi(p.note, "span", "ls-gr-note") : "") +
          `</span>`,
      )
      .join("");
    const chinese = (e: GrammarContent["examples"][number]) =>
      (e.hanzi ? coloredParts(e.hanzi, "zh-CN", "ls-gr-hanzi", "") : "") +
      (e.pinyin ? coloredParts(e.pinyin, "zh-Latn-pinyin", "ls-pinyin ls-gr-pinyin", " ") : "");
    const examples = c.examples
      .map((e) =>
        c.translate
          ? // The Vietnamese is the question; each Next shows one example's Chinese.
            `<li class="ls-gr-example ls-gr-example--translate">` +
            (e.meaning ? vi(e.meaning, "span", "ls-gr-question") : "") +
            (e.hanzi || e.pinyin ? `<span class="ls-gr-answer ls-hide" data-ls-reveal data-ls-sound="correct">${chinese(e)}</span>` : "") +
            `</li>`
          : `<li class="ls-gr-example${c.stepByStep ? " ls-hide" : ""}"${c.stepByStep ? " data-ls-reveal" : ""}>` +
            chinese(e) +
            (e.meaning ? vi(e.meaning, "span", "ls-gr-meaning") : "") +
            `</li>`,
      )
      .join("");
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<div class="ls-gr">` +
      `<div class="ls-gr-pattern">${pattern}</div>` +
      (c.explanation ? vi(c.explanation, "p", "ls-gr-explanation") : "") +
      (examples ? `<ul class="ls-gr-examples">${examples}</ul>` : "") +
      `</div>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    {
      kind: "list",
      key: "pattern",
      label: "Cấu trúc",
      itemLabel: "thành phần",
      min: 1,
      max: 5,
      newItem: () => ({ text: "", note: "" }),
      fields: [
        { kind: "text", key: "text", label: "Thành phần (chữ Hán hoặc tiếng Việt)", lang: "zh", placeholder: "主语 / Chủ ngữ" },
        { kind: "text", key: "note", label: "Giải thích ngắn", lang: "vi", placeholder: "chủ ngữ" },
      ],
    },
    { kind: "text", key: "explanation", label: "Giải thích", lang: "vi", multiline: true },
    {
      kind: "list",
      key: "examples",
      label: "Câu ví dụ (ngăn các thành phần bằng dấu /)",
      itemLabel: "ví dụ",
      min: 0,
      max: 4,
      newItem: () => ({ hanzi: "", pinyin: "", meaning: "" }),
      fields: [
        { kind: "text", key: "hanzi", label: "Câu (chữ Hán)", lang: "zh", placeholder: "我 / 是 / 学生 — để trống nếu chỉ cho dịch" },
        { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin", placeholder: "wǒ / shì / xué sheng" },
        { kind: "text", key: "meaning", label: "Nghĩa", lang: "vi" },
      ],
    },
    { kind: "toggle", key: "translate", label: "Dạng dịch: hiện tiếng Việt, bấm Tiếp hiện câu chữ Hán" },
    { kind: "toggle", key: "stepByStep", label: "Hiện từng ví dụ khi bấm Tiếp", when: (c: GrammarContent) => !c.translate },
  ],
};

export default grammar;
