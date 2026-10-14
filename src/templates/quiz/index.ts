import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { esc } from "../../renderer/escape";
import { audioButton, autoText, image, pinyin, vi, zh } from "../../renderer/helpers";
import css from "./style.css?raw";

const LETTERS = ["a", "b", "c", "d"] as const;

const option = z
  .object({
    text: z.string().max(40).default(""),
    image: AssetIdRef.optional(),
  })
  .refine((o) => o.text.trim() || o.image, { message: "Cần chữ hoặc ảnh", path: ["text"] });

const schema = z
  .object({
    mode: z.enum(["choice", "truefalse"]).default("choice"),
    question: z.string().max(120).default(""),
    hanzi: z.string().max(20).default(""),
    pinyin: z.string().max(60).default(""),
    image: AssetIdRef.optional(),
    audio: AssetIdRef.optional(),
    options: z.array(option).min(2, "Cần ít nhất 2 lựa chọn").max(4, "Tối đa 4 lựa chọn"),
    answer: z.enum(LETTERS).default("a"),
    truth: z.enum(["true", "false"]).default("true"),
  })
  .refine((c) => c.question.trim() || c.hanzi.trim() || c.image || c.audio, {
    message: "Cần câu hỏi, chữ Hán, ảnh hoặc âm thanh",
    path: ["question"],
  })
  .refine((c) => c.mode === "truefalse" || LETTERS.indexOf(c.answer) < c.options.length, {
    message: "Đáp án đúng phải là một trong các lựa chọn",
    path: ["answer"],
  });

export type QuizContent = z.output<typeof schema>;

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

export const quiz: SlideTemplate<QuizContent> = {
  type: "quiz",
  label: "Trắc nghiệm",
  category: "qa",
  order: 110,
  schema,
  aiSchemaHint:
    'Câu hỏi cho cả lớp, bấm Tiếp để hiện đáp án. {"mode": "choice" (2–4 lựa chọn) hoặc "truefalse" (Đúng/Sai), "question"?: câu hỏi tiếng Việt, "hanzi"?: chữ Hán làm đề, "pinyin"?, "options": [{"text"}] (2–4, với "choice"), "answer": "a"|"b"|"c"|"d" (với "choice"), "truth": "true"|"false" (với "truefalse")}. Lựa chọn không được lộ đáp án: hỏi nghĩa thì lựa chọn chỉ ghi nghĩa, hỏi chữ Hán thì lựa chọn chỉ ghi chữ Hán (không kèm nghĩa).',
  defaults: () => ({
    mode: "choice",
    question: "Chữ này nghĩa là gì?",
    hanzi: "猫",
    pinyin: "māo",
    options: [{ text: "con chó" }, { text: "con mèo" }, { text: "con cá" }],
    answer: "b",
    truth: "true",
  }),
  limits: {
    question: { maxChars: 60 },
    hanzi: { maxChars: 8 },
    "options.*.text": { maxChars: 20 },
  },
  render(c, ctx) {
    const img = image(ctx, c.image, "ls-quiz-image");
    const prompt =
      (img ? `<div class="ls-quiz-media">${img}</div>` : "") +
      `<div class="ls-quiz-ask">` +
      (c.hanzi ? zh(c.hanzi, "span", "ls-quiz-hanzi") : "") +
      (c.pinyin ? pinyin(c.pinyin, "span", "ls-quiz-pinyin") : "") +
      (c.question ? vi(c.question, "p", "ls-quiz-question") : "") +
      audioButton(ctx, c.audio, `${ctx.slideId}-audio`, "Nghe câu hỏi") +
      `</div>`;

    const choices =
      c.mode === "truefalse"
        ? [
            { label: "", body: `${CHECK}${vi("Đúng", "span", "ls-quiz-text")}`, correct: c.truth === "true", cls: "ls-quiz-true" },
            { label: "", body: `${CROSS}${vi("Sai", "span", "ls-quiz-text")}`, correct: c.truth === "false", cls: "ls-quiz-false" },
          ]
        : c.options.map((o, i) => {
            const optImg = image(ctx, o.image, "ls-quiz-option-image");
            return {
              label: LETTERS[i]!.toUpperCase(),
              body: (optImg ? `<span class="ls-quiz-option-media">${optImg}</span>` : "") + (o.text ? autoText(o.text, "span", "ls-quiz-text") : ""),
              correct: c.answer === LETTERS[i],
              cls: optImg ? "ls-quiz-option--image" : "",
            };
          });

    const options = choices
      .map(
        (o) =>
          `<li class="ls-quiz-option ${o.cls}${o.correct ? " ls-quiz-correct" : ""}"${o.correct ? ' data-ls-reveal data-ls-sound="correct"' : ""}>` +
          (o.label ? `<span class="ls-quiz-letter">${esc(o.label)}</span>` : "") +
          o.body +
          `</li>`,
      )
      .join("");

    return (
      `<div class="ls-quiz" data-mode="${c.mode === "truefalse" ? "truefalse" : "choice"}">` +
      `<div class="ls-quiz-prompt${img ? " ls-quiz-prompt--image" : ""}">${prompt}</div>` +
      `<ol class="ls-quiz-options" data-count="${choices.length}">${options}</ol>` +
      `</div>`
    );
  },
  css,
  editor: [
    {
      kind: "select",
      key: "mode",
      label: "Kiểu câu hỏi",
      options: [
        { value: "choice", label: "Chọn đáp án (2–4 lựa chọn)" },
        { value: "truefalse", label: "Đúng hay Sai" },
      ],
    },
    { kind: "text", key: "question", label: "Câu hỏi (tiếng Việt)", lang: "vi" },
    { kind: "text", key: "hanzi", label: "Chữ Hán làm đề", lang: "zh" },
    { kind: "text", key: "pinyin", label: "Pinyin", lang: "pinyin" },
    { kind: "asset", key: "image", label: "Ảnh làm đề", assetKind: "image", searchFrom: ["question", "hanzi"] },
    { kind: "asset", key: "audio", label: "Âm thanh làm đề (nghe và chọn)", assetKind: "audio", speakFrom: "hanzi" },
    {
      kind: "list",
      key: "options",
      label: "Các lựa chọn",
      itemLabel: "lựa chọn",
      min: 2,
      max: 4,
      newItem: () => ({ text: "" }),
      when: (c) => c.mode !== "truefalse",
      fields: [
        { kind: "text", key: "text", label: "Chữ" },
        { kind: "asset", key: "image", label: "Ảnh", assetKind: "image", searchFrom: ["text"] },
      ],
    },
    {
      kind: "select",
      key: "answer",
      label: "Đáp án đúng",
      options: LETTERS.map((l) => ({ value: l, label: l.toUpperCase() })),
      when: (c) => c.mode !== "truefalse",
    },
    {
      kind: "select",
      key: "truth",
      label: "Đáp án đúng",
      options: [
        { value: "true", label: "Đúng" },
        { value: "false", label: "Sai" },
      ],
      when: (c) => c.mode === "truefalse",
    },
  ],
};

export default quiz;
