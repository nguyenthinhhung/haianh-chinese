import { z } from "zod";
import { AssetIdRef } from "../../core/schema";
import type { RenderContext, SlideTemplate } from "../../core/template";
import { autoText, image, stableShuffle, vi } from "../../renderer/helpers";
import css from "./style.css?raw";

const GROUPS = ["1", "2", "3"] as const;

const card = z
  .object({
    text: z.string().max(20).default(""),
    image: AssetIdRef.optional(),
    group: z.enum(GROUPS).default("1"),
  })
  .refine((c) => c.text.trim() || c.image, { message: "Cần chữ hoặc ảnh", path: ["text"] });

const schema = z
  .object({
    heading: z.string().max(60).default(""),
    groups: z
      .array(z.object({ name: z.string().regex(/\S/, "Không được để trống").max(20) }))
      .min(2, "Cần ít nhất 2 nhóm")
      .max(3, "Tối đa 3 nhóm"),
    cards: z.array(card).min(2, "Cần ít nhất 2 thẻ").max(12, "Tối đa 12 thẻ"),
  })
  .refine((c) => c.cards.every((k) => Number(k.group) <= c.groups.length), {
    message: "Có thẻ thuộc nhóm không tồn tại",
    path: ["cards"],
  });

export type SortGroupsContent = z.output<typeof schema>;
type Card = SortGroupsContent["cards"][number];

function cardBody(ctx: RenderContext, k: Card): string {
  const img = image(ctx, k.image, "ls-sg-image");
  return (img ? `<span class="ls-sg-media">${img}</span>` : "") + (k.text ? autoText(k.text, "span", "ls-sg-text") : "");
}

export const sortGroups: SlideTemplate<SortGroupsContent> = {
  type: "sort-groups",
  label: "Phân nhóm",
  description: "Đưa các thẻ vào đúng nhóm (2–3 nhóm)",
  category: "qa",
  order: 160,
  schema,
  aiSchemaHint:
    'Trẻ nói mỗi thẻ thuộc nhóm nào; mỗi lần bấm Tiếp đưa một thẻ vào đúng nhóm. {"heading"?: tiêu đề, "groups": [{"name": tên nhóm}] (2–3), "cards": [{"text": chữ Hán hoặc tiếng Việt, "group": "1"|"2"|"3" theo thứ tự nhóm}] (2–12)}',
  defaults: () => ({
    heading: "Hoa quả hay con vật?",
    groups: [{ name: "水果 hoa quả" }, { name: "动物 con vật" }],
    cards: [
      { text: "苹果", group: "1" },
      { text: "猫", group: "2" },
      { text: "香蕉", group: "1" },
      { text: "狗", group: "2" },
      { text: "西瓜", group: "1" },
      { text: "鱼", group: "2" },
    ],
  }),
  limits: { heading: { maxChars: 40 }, "groups.*.name": { maxChars: 14 }, "cards.*.text": { maxChars: 6 } },
  render(c, ctx) {
    // Card i is step i + 1: it fades from the pool as its copy lands in the group.
    const pool = stableShuffle(c.cards.length, ctx.slideId)
      .map((i) => `<li class="ls-sg-card" data-ls-reveal="${i + 1}">${cardBody(ctx, c.cards[i]!)}</li>`)
      .join("");
    const groups = c.groups
      .map((g, gi) => {
        const members = c.cards
          .map((k, i) =>
            Number(k.group) === gi + 1
              ? `<li class="ls-sg-card ls-sg-placed ls-hide" data-ls-reveal="${i + 1}" data-ls-sound="correct">${cardBody(ctx, k)}</li>`
              : "",
          )
          .join("");
        return (
          `<section class="ls-sg-group ls-sg-g${gi + 1}">` +
          autoText(g.name, "h3", "ls-sg-name") +
          `<ul class="ls-sg-members">${members}</ul>` +
          `</section>`
        );
      })
      .join("");
    return (
      (c.heading ? vi(c.heading, "h2", "ls-heading") : "") +
      `<div class="ls-sg" data-count="${c.cards.length}" data-ls-complete>` +
      `<ul class="ls-sg-pool">${pool}</ul>` +
      `<div class="ls-sg-groups" data-groups="${c.groups.length}">${groups}</div>` +
      `</div>`
    );
  },
  css,
  blankHeading: "Phân nhóm",
  editor: [
    { kind: "text", key: "heading", label: "Tiêu đề", lang: "vi" },
    {
      kind: "list",
      key: "groups",
      label: "Nhóm",
      itemLabel: "nhóm",
      min: 2,
      max: 3,
      newItem: () => ({ name: "" }),
      fields: [{ kind: "text", key: "name", label: "Tên nhóm" }],
    },
    {
      kind: "list",
      key: "cards",
      label: "Thẻ",
      itemLabel: "thẻ",
      min: 2,
      max: 12,
      newItem: () => ({ text: "", group: "1" }),
      fields: [
        { kind: "text", key: "text", label: "Chữ" },
        { kind: "asset", key: "image", label: "Ảnh", assetKind: "image", searchFrom: ["text"] },
        {
          kind: "select",
          key: "group",
          label: "Thuộc nhóm",
          options: GROUPS.map((g) => ({ value: g, label: `Nhóm ${g}` })),
        },
      ],
    },
  ],
};

export default sortGroups;
