import { z } from "zod";
import type { SlideTemplate } from "../../core/template";
import { esc } from "../../renderer/escape";
import { pinyin, vi } from "../../renderer/helpers";
import css from "./style.css?raw";

const item = z.object({
  /** The sentence or A/B dialogue to complete ("____" marks the gap), or a sentence to translate. */
  prompt: z.string().regex(/\S/, "Không được để trống").max(160),
  /** The word or pattern to use, shown in brackets as in the textbook: (肯定). */
  hint: z.string().max(24).default(""),
  answer: z.string().max(120).default(""),
  answerPinyin: z.string().max(300).default(""),
});

const schema = z.object({
  heading: z.string().max(60).default(""),
  items: z.array(item).min(1, "Cần ít nhất 1 câu").max(5, "Tối đa 5 câu"),
});

export type SentencePracticeContent = z.output<typeof schema>;

const HAN = /\p{Script=Han}/u;
const LATIN = /\p{Script=Latin}/u;

/** One line of a prompt: Chinese or Vietnamese, with each run of underscores drawn as a gap. */
function promptLine(line: string): string {
  const lang = HAN.test(line) && !LATIN.test(line.replace(/^[AB][：:]/, "")) ? "zh-CN" : "vi";
  const body = line
    .split(/_{2,}|＿{2,}/)
    .map(esc)
    .join(`<span class="ls-sp-gap"></span>`);
  return `<span class="ls-sp-line" lang="${lang}">${body}</span>`;
}

export const sentencePractice: SlideTemplate<SentencePracticeContent> = {
  type: "sentence-practice",
  label: "Luyện câu (练一练)",
  description: "Hoàn thành câu/đối thoại với từ gợi ý, hoặc dịch câu",
  category: "qa",
  order: 135,
  schema,
  aiSchemaHint:
    'Luyện dùng từ hoặc điểm ngữ pháp vừa học, như "练一练" trong giáo trình HSK: hoàn thành câu, hoàn thành đối thoại với từ cho sẵn, hoặc dịch câu Việt–Trung. Cả lớp nói, giáo viên bấm Tiếp hiện đáp án mẫu từng câu. {"heading"?: ví dụ "练一练：完成对话", "items": [{"prompt": câu hoặc đối thoại cần hoàn thành, chỗ trống viết "____", đối thoại thì mỗi lượt một dòng "A：…" "B：…"; hoặc câu tiếng Việt cần dịch, "hint"?: từ phải dùng (ví dụ "肯定"), "answer": đáp án mẫu (câu chữ Hán đầy đủ hoặc phần điền vào), "answerPinyin"?: pinyin của đáp án}] (1–5)}',
  defaults: () => ({
    heading: "练一练：完成对话",
    items: [
      { prompt: "A：快点儿，不早了，咱们别迟到了。\nB：你放心，____。", hint: "肯定", answer: "我们肯定来得及的", answerPinyin: "wǒmen kěndìng láidejí de" },
      { prompt: "Tôi đặc biệt thích bóng rổ.", hint: "尤其", answer: "我尤其喜欢打篮球。", answerPinyin: "wǒ yóuqí xǐhuan dǎ lánqiú." },
    ],
  }),
  limits: {
    heading: { maxChars: 40 },
    "items.*.prompt": { maxChars: 60 },
    "items.*.answer": { maxChars: 40 },
  },
  render(c) {
    let step = 0;
    const items = c.items
      .map((it) => {
        const prompt = it.prompt
          .split(/\n+/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map(promptLine)
          .join("");
        const hint = it.hint ? `<span class="ls-sp-hint" lang="zh-CN">（${esc(it.hint)}）</span>` : "";
        const answer = it.answer
          ? `<div class="ls-sp-answer ls-hide" data-ls-reveal="${++step}" data-ls-sound="correct">` +
            `<span class="ls-sp-answer-text" lang="${HAN.test(it.answer) ? "zh-CN" : "vi"}">${esc(it.answer)}</span>` +
            (it.answerPinyin ? pinyin(it.answerPinyin, "span", "ls-sp-answer-pinyin") : "") +
            `</div>`
          : "";
        return `<li class="ls-sp-item"><div class="ls-sp-prompt">${prompt}${hint}</div>${answer}</li>`;
      })
      .join("");
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<ol class="ls-sp" data-count="${c.items.length}">${items}</ol>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    {
      kind: "list",
      key: "items",
      label: "Câu",
      itemLabel: "câu",
      min: 1,
      max: 5,
      newItem: () => ({ prompt: "", hint: "", answer: "", answerPinyin: "" }),
      fields: [
        {
          kind: "text",
          key: "prompt",
          label: "Đề (chỗ trống viết ____; đối thoại mỗi lượt một dòng; hoặc câu tiếng Việt cần dịch)",
          lang: "zh",
          multiline: true,
        },
        { kind: "text", key: "hint", label: "Từ phải dùng", lang: "zh", placeholder: "肯定" },
        { kind: "text", key: "answer", label: "Đáp án mẫu", lang: "zh" },
        { kind: "text", key: "answerPinyin", label: "Pinyin đáp án", lang: "pinyin" },
      ],
    },
  ],
};

export default sentencePractice;
