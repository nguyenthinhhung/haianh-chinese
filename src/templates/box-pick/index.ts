import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { SlideTemplate } from "../../core/template";
import { autoText, image, vi } from "../../renderer/helpers";
import interaction from "./interaction.js?raw";
import css from "./style.css?raw";

const REWARDS = ["1", "2", "3", "5", "bomb", "swap"] as const;
type Reward = (typeof REWARDS)[number];

const REWARD_LABEL: Record<Reward, string> = {
  "1": "+1 điểm",
  "2": "+2 điểm",
  "3": "+3 điểm",
  "5": "+5 điểm",
  bomb: "💣 Bom! Mất hết điểm",
  swap: "🔄 Đổi điểm với đội dẫn đầu",
};

const box = z
  .object({
    text: z.string().max(80).default(""),
    image: AssetIdRef.optional(),
    reward: z.enum(REWARDS).default("1"),
  })
  .refine((b) => b.text.trim() || b.image, { message: "Cần câu hỏi hoặc ảnh", path: ["text"] });

const schema = z.object({
  heading: z.string().max(60).default(""),
  boxes: z.array(box).min(4, "Cần ít nhất 4 ô").max(16, "Tối đa 16 ô"),
});

export type BoxPickContent = z.output<typeof schema>;

const sample = (text: string, reward: Reward) => ({ text, reward });

export const boxPick: SlideTemplate<BoxPickContent> = {
  type: "box-pick",
  label: "Hộp bí mật",
  description: "Đội gọi số mở hộp: câu hỏi, điểm thưởng hoặc bom",
  category: "game",
  order: 230,
  schema,
  aiSchemaHint:
    'Trò hộp bí mật chơi theo đội: lưới ô đánh số, đội gọi số, ô mở ra một câu hỏi rồi một phần thưởng cộng thẳng vào bảng điểm. {"heading"?: tiêu đề, "boxes": [{"text": câu hỏi hoặc từ cần đọc, "reward": "1"|"2"|"3"|"5" (điểm) | "bomb" (mất hết điểm) | "swap" (đổi điểm với đội dẫn đầu)}] (4–16 ô)}',
  defaults: () => ({
    heading: "Hộp bí mật",
    boxes: [
      sample("Đọc: 苹果", "1"),
      sample("“Con mèo” tiếng Trung là gì?", "2"),
      sample("Đọc: 谢谢", "1"),
      sample("Đếm từ 1 đến 5 bằng tiếng Trung", "3"),
      sample("Đọc: 你好", "bomb"),
      sample("“Xin chào” tiếng Trung là gì?", "2"),
      sample("Đọc: 香蕉", "swap"),
      sample("Hát một câu bài hát tiếng Trung", "5"),
      sample("Đọc: 再见", "1"),
    ],
  }),
  limits: { heading: { maxChars: 40 }, "boxes.*.text": { maxChars: 40 } },
  render(c, ctx) {
    const boxes = c.boxes
      .map((b, i) => {
        const img = image(ctx, b.image, "ls-bp-image");
        const reward = (REWARDS as readonly string[]).includes(b.reward) ? (b.reward as Reward) : "1";
        return (
          `<li><button type="button" class="ls-bp-box" data-n="${i + 1}" data-reward="${reward}">` +
          `<span class="ls-bp-number">${i + 1}</span>` +
          `<span class="ls-bp-content">${img ? `<span class="ls-bp-media">${img}</span>` : ""}${b.text ? autoText(b.text, "span", "ls-bp-text") : ""}</span>` +
          vi(REWARD_LABEL[reward], "span", "ls-bp-reward") +
          `</button></li>`
        );
      })
      .join("");
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<div class="ls-bp">` +
      `<ul class="ls-bp-grid" data-count="${c.boxes.length}">${boxes}</ul>` +
      `<div class="ls-bp-panel" hidden><div class="ls-bp-panel-team"></div><div class="ls-bp-panel-body"></div><div class="ls-bp-panel-reward"></div></div>` +
      `</div>`
    );
  },
  css,
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    {
      kind: "list",
      key: "boxes",
      label: "Ô (gọi số để mở; điểm cộng cho đội đang có lượt)",
      itemLabel: "ô",
      min: 4,
      max: 16,
      newItem: () => ({ text: "", reward: "1" }),
      fields: [
        { kind: "text", key: "text", label: "Câu hỏi / từ" },
        { kind: "asset", key: "image", label: "Ảnh", assetKind: "image", searchFrom: ["text"] },
        {
          kind: "select",
          key: "reward",
          label: "Phần thưởng",
          options: REWARDS.map((r) => ({ value: r, label: REWARD_LABEL[r] })),
        },
      ],
    },
  ],
  interaction: { source: interaction },
};

export default boxPick;
