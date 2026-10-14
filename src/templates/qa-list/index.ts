import { z } from "zod";
import type { SlideTemplate } from "../../core/template";
import { autoText, pinyin, vi } from "../../renderer/helpers";
import css from "./style.css?raw";

const item = z.object({
  question: z.string().regex(/\S/, "Không được để trống").max(80),
  pinyin: z.string().max(200).default(""),
  answer: z.string().max(80).default(""),
  answerPinyin: z.string().max(200).default(""),
});

const schema = z.object({
  heading: z.string().max(60).default(""),
  items: z.array(item).min(1, "Cần ít nhất 1 câu hỏi").max(6, "Tối đa 6 câu hỏi"),
});

export type QaListContent = z.output<typeof schema>;

export const qaList: SlideTemplate<QaListContent> = {
  type: "qa-list",
  label: "Hỏi đáp",
  description: "Danh sách câu hỏi; bấm Tiếp hiện từng đáp án",
  category: "qa",
  order: 105,
  schema,
  aiSchemaHint:
    'Câu hỏi về bài khoá hoặc hội thoại vừa học; giáo viên hỏi, cả lớp trả lời, mỗi lần bấm Tiếp hiện đáp án một câu. {"heading"?: tiêu đề, "items": [{"question": câu hỏi (chữ Hán hoặc tiếng Việt), "pinyin"?: pinyin của câu hỏi chữ Hán, "answer": đáp án ngắn, "answerPinyin"?: pinyin của đáp án chữ Hán}] (1–6)}',
  defaults: () => ({
    heading: "Trả lời câu hỏi",
    items: [
      { question: "这是什么？", pinyin: "zhè shì shén me?", answer: "这是苹果。", answerPinyin: "zhè shì píng guǒ." },
      { question: "你喜欢吃什么？", pinyin: "nǐ xǐ huan chī shén me?", answer: "我喜欢吃香蕉。", answerPinyin: "wǒ xǐ huan chī xiāng jiāo." },
    ],
  }),
  limits: {
    heading: { maxChars: 40 },
    "items.*.question": { maxChars: 30 },
    "items.*.answer": { maxChars: 30 },
  },
  render(c) {
    // Answer i is step i + 1; a question without an answer is just asked.
    const rows = c.items
      .map(
        (it, i) =>
          `<li class="ls-qa-item">` +
          `<div class="ls-qa-question">${autoText(it.question, "span", "ls-qa-text")}` +
          (it.pinyin ? pinyin(it.pinyin, "span", "ls-qa-pinyin") : "") +
          `</div>` +
          (it.answer
            ? `<div class="ls-qa-answer ls-hide" data-ls-reveal="${i + 1}" data-ls-sound="correct">` +
              autoText(it.answer, "span", "ls-qa-text") +
              (it.answerPinyin ? pinyin(it.answerPinyin, "span", "ls-qa-pinyin") : "") +
              `</div>`
            : "") +
          `</li>`,
      )
      .join("");
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<ol class="ls-qa" data-count="${c.items.length}">${rows}</ol>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    {
      kind: "list",
      key: "items",
      label: "Câu hỏi",
      itemLabel: "câu",
      min: 1,
      max: 6,
      newItem: () => ({ question: "", pinyin: "", answer: "", answerPinyin: "" }),
      fields: [
        { kind: "text", key: "question", label: "Câu hỏi", lang: "zh", placeholder: "他是谁？ hoặc câu tiếng Việt" },
        { kind: "text", key: "pinyin", label: "Pinyin câu hỏi", lang: "pinyin" },
        { kind: "text", key: "answer", label: "Đáp án", lang: "zh" },
        { kind: "text", key: "answerPinyin", label: "Pinyin đáp án", lang: "pinyin" },
      ],
    },
  ],
};

export default qaList;
