import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { audioButton, autoText, pinyin, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const question = z.object({
  question: z.string().regex(/\S/, "Không được để trống").max(80),
  answer: z.string().max(80).default(""),
});

const schema = z.object({
  heading: z.string().max(60).default(""),
  /** The recording: the textbook's track, any file, or the script read aloud. */
  track: AssetIdRef.optional(),
  /** What is said; at most what the read-aloud service accepts. */
  script: z.string().max(200).default(""),
  scriptPinyin: z.string().max(500).default(""),
  scriptMeaning: z.string().max(300).default(""),
  questions: z.array(question).max(4, "Tối đa 4 câu hỏi").default([]),
  /** The script appears after the answers, as the last step. */
  showScript: z.boolean().default(true),
});

export type ListeningContent = z.output<typeof schema>;

/** Lines of the script, kept as the teacher broke them (one per speaker turn). */
const lines = (text: string) =>
  text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

export const listening: SlideTemplate<ListeningContent> = {
  type: "listening",
  label: "Nghe",
  description: "Nghe file của giáo trình, trả lời, rồi hiện lời",
  category: "qa",
  order: 107,
  schema,
  aiSchemaHint:
    'Bài nghe ngắn: cả lớp nghe rồi trả lời; mỗi lần bấm Tiếp hiện đáp án một câu, cuối cùng hiện lời bài nghe. Ứng dụng tự đọc "script" thành file nghe nếu giáo viên chưa có file. {"heading"?: tiêu đề, "script": lời bài nghe bằng chữ Hán (tối đa 200 ký tự; hội thoại thì mỗi lượt lời một dòng, có "A：" "B："), "scriptPinyin"?: pinyin của lời, cùng cách xuống dòng, "scriptMeaning"?: nghĩa tiếng Việt, "questions": [{"question": câu hỏi về nội dung nghe (chữ Hán hoặc tiếng Việt), "answer": đáp án ngắn}] (1–4), "showScript"?: true}',
  defaults: () => ({
    heading: "Nghe và trả lời",
    script: "A：你去哪儿？\nB：我去商店。",
    scriptPinyin: "A: nǐ qù nǎr?\nB: wǒ qù shāng diàn.",
    scriptMeaning: "A: Bạn đi đâu?\nB: Mình đi cửa hàng.",
    questions: [{ question: "B 去哪儿？", answer: "商店" }],
    showScript: true,
  }),
  limits: {
    heading: { maxChars: 40 },
    "questions.*.question": { maxChars: 30 },
    "questions.*.answer": { maxChars: 24 },
  },
  render(c, ctx) {
    const play = audioButton(ctx, c.track, `${ctx.slideId}-track`, "Nghe");
    // Answer i is step i + 1; the script, if shown, is the step after the last answer.
    const answered = c.questions.filter((q) => q.answer).length;
    const questions = c.questions
      .map((q, i) => {
        const step = c.questions.slice(0, i + 1).filter((x) => x.answer).length;
        return (
          `<li class="ls-ln-item">${autoText(q.question, "span", "ls-ln-question")}` +
          (q.answer
            ? `<span class="ls-ln-answer ls-hide" data-ls-reveal="${step}" data-ls-sound="correct">${autoText(q.answer)}</span>`
            : "") +
          `</li>`
        );
      })
      .join("");
    const pinyinLines = lines(c.scriptPinyin);
    const meaningLines = lines(c.scriptMeaning);
    const script =
      c.showScript && c.script.trim()
        ? `<div class="ls-ln-script ls-hide" data-ls-reveal="${answered + 1}">` +
          lines(c.script)
            .map(
              (l, i) =>
                `<p class="ls-ln-line">${zh(l, "span", "ls-ln-hanzi")}` +
                (pinyinLines[i] ? pinyin(pinyinLines[i]!, "span", "ls-ln-pinyin") : "") +
                (meaningLines[i] ? vi(meaningLines[i]!, "span", "ls-ln-meaning") : "") +
                `</p>`,
            )
            .join("") +
          `</div>`
        : "";
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<div class="ls-ln${c.questions.length ? "" : " ls-ln--no-questions"}">` +
      `<div class="ls-ln-player">${play || `<span class="ls-ln-missing" lang="vi">Chưa có file nghe</span>`}</div>` +
      (questions ? `<ol class="ls-ln-questions" data-count="${c.questions.length}">${questions}</ol>` : "") +
      script +
      `</div>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    // Unlike a quiz option's sound, this recording is the activity itself, so
    // a missing one is read aloud from the script.
    { kind: "asset", key: "track", label: "File nghe (bài nghe của giáo trình, hoặc tạo giọng đọc từ lời)", assetKind: "audio", speakFrom: "script", autoAudio: true },
    { kind: "text", key: "script", label: "Lời bài nghe (chữ Hán, mỗi lượt lời một dòng)", lang: "zh", multiline: true },
    { kind: "text", key: "scriptPinyin", label: "Pinyin của lời", lang: "pinyin", multiline: true },
    { kind: "text", key: "scriptMeaning", label: "Nghĩa của lời", lang: "vi", multiline: true },
    {
      kind: "list",
      key: "questions",
      label: "Câu hỏi",
      itemLabel: "câu",
      min: 0,
      max: 4,
      newItem: () => ({ question: "", answer: "" }),
      fields: [
        { kind: "text", key: "question", label: "Câu hỏi", lang: "zh" },
        { kind: "text", key: "answer", label: "Đáp án", lang: "zh" },
      ],
    },
    { kind: "toggle", key: "showScript", label: "Hiện lời bài nghe ở bước cuối" },
  ],
};

export default listening;
