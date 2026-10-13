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

export function vi(text: string, tag = "span", cls = ""): string {
  return `<${tag}${cls ? ` class="${esc(cls)}"` : ""} lang="vi">${esc(text)}</${tag}>`;
}

export function image(ctx: RenderContext, assetId: string | undefined, cls = ""): string {
  if (!assetId) return "";
  const url = ctx.assetUrl(assetId);
  if (!url || !isSafeUrl(url)) return "";
  const alt = ctx.asset(assetId)?.alt ?? "";
  return `<img${cls ? ` class="${esc(cls)}"` : ""} src="${esc(url)}" alt="${esc(alt)}" draggable="false">`;
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
