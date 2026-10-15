import type { RenderContext } from "../core/template";
import { esc, isSafeUrl } from "./escape";

/** Building blocks for template render functions; all of them escape their input. */

/** Chinese text is always tagged zh-CN so browsers never fall back to Japanese glyphs. */
export function zh(text: string, tag = "span", cls = ""): string {
  return `<${tag}${cls ? ` class="${esc(cls)}"` : ""} lang="zh-CN">${esc(text)}</${tag}>`;
}

export function pinyin(text: string, tag = "span", cls = ""): string {
  return `<${tag} class="ls-pinyin${cls ? ` ${esc(cls)}` : ""}" lang="zh-Latn-pinyin">${esc(text)}</${tag}>`;
}

/** Runs of Chinese characters, with the punctuation and spaces between them. */
const HAN_RUN = /(\p{Script=Han}(?:[\p{Script=Han}\s，。？！、：；“”‘’（）]*\p{Script=Han})?)/u;

/**
 * Vietnamese text. Chinese written inside it ("Cảm ơn: 谢谢") is wrapped in
 * zh-CN spans so those characters still get a Chinese font, not Japanese glyphs.
 */
export function vi(text: string, tag = "span", cls = ""): string {
  const body = text
    .split(HAN_RUN)
    .map((part, i) => (i % 2 ? `<span lang="zh-CN">${esc(part)}</span>` : esc(part)))
    .join("");
  return `<${tag}${cls ? ` class="${esc(cls)}"` : ""} lang="vi">${body}</${tag}>`;
}

/**
 * Text that may be Chinese, Vietnamese or both (quiz options, cards, group
 * names): all-Chinese text is tagged zh-CN, anything else is Vietnamese with
 * its Chinese runs tagged.
 */
export function autoText(text: string, tag = "span", cls = ""): string {
  const chinese = /\p{Script=Han}/u.test(text) && !/[\p{Script=Latin}]/u.test(text);
  return chinese ? zh(text, tag, cls) : vi(text, tag, cls);
}

export function image(ctx: RenderContext, assetId: string | undefined, cls = ""): string {
  if (!assetId) return "";
  const url = ctx.assetUrl(assetId);
  if (!url || !isSafeUrl(url)) return "";
  const alt = ctx.asset(assetId)?.alt ?? "";
  return `<img${cls ? ` class="${esc(cls)}"` : ""} src="${esc(url)}" alt="${esc(alt)}" draggable="false">`;
}

/** Splits teacher input at "/" into trimmed, non-empty parts: "我 / 是 / 学生". */
export function splitParts(text: string): string[] {
  return text
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Small deterministic PRNG (mulberry32) seeded from a string. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Indices 0..n-1 shuffled the same way every time for the same seed (use the
 * slide ID), so the editor, Present and the exported file agree. With two or
 * more items the result is never the original order.
 */
export function stableShuffle(n: number, seed: string): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  const random = seededRandom(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  if (n > 1 && order.every((v, i) => v === i)) order.push(order.shift()!);
  return order;
}

const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

/**
 * A play button plus its hidden `<audio>`. The runtime plays the audio on click;
 * `domId` must be unique in the document.
 */
export function audioButton(ctx: RenderContext, assetId: string | undefined, domId: string, label: string): string {
  if (!assetId) return "";
  const url = ctx.assetUrl(assetId);
  if (!url || !isSafeUrl(url)) return "";
  return (
    `<button type="button" class="ls-play" data-ls-play="${esc(domId)}" aria-label="${esc(label)}">${PLAY_ICON}</button>` +
    `<audio id="${esc(domId)}" preload="none" src="${esc(url)}"></audio>`
  );
}

const LATIN_RE = /\p{Script=Latin}/u;
const HAN_RE = /\p{Script=Han}/u;

/**
 * Text with gaps to fill: each run of underscores ("____") becomes an empty
 * line to write on. Tagged Chinese or Vietnamese like `autoText`.
 */
export function gapText(text: string, tag = "span", cls = ""): string {
  const lang = HAN_RE.test(text) && !LATIN_RE.test(text.replace(/^[AB][：:]/, "")) ? "zh-CN" : "vi";
  const body = text
    .split(/_{2,}|＿{2,}/)
    .map(esc)
    .join(`<span class="ls-gap"></span>`);
  return `<${tag}${cls ? ` class="${esc(cls)}"` : ""} lang="${lang}">${body}</${tag}>`;
}
