import type { Asset, LessonDocument, Slide } from "../core/schema";
import type { RenderContext } from "../core/template";
import type { TemplateRegistry } from "../core/templateRegistry";
import type { ThemeRegistry } from "../core/themeRegistry";
import baseCss from "./base.css?raw";
import { esc } from "./escape";
import { FONT_CSS } from "./fonts";
import runtimeCore from "./runtime/core.js?raw";
import runtimeTools from "./runtime/tools.js?raw";

export interface RenderEnv {
  templates: TemplateRegistry;
  themes: ThemeRegistry;
  /** URL of an asset in this output: relative path on disk, webview URL, or data URI. */
  assetUrl(asset: Asset): string | undefined;
}

export function renderContext(doc: LessonDocument, env: RenderEnv): Omit<RenderContext, "slideId"> {
  const assets = new Map(doc.assets.map((a) => [a.id, a]));
  return {
    asset: (id) => assets.get(id),
    assetUrl: (id) => {
      const a = assets.get(id);
      return a ? env.assetUrl(a) : undefined;
    },
    script: doc.script,
  };
}

/** One `<section class="ls-slide">`, identical in Editor, Present and Export. */
export function renderSlide(
  doc: LessonDocument,
  slide: Slide,
  env: RenderEnv,
  ctx: Omit<RenderContext, "slideId"> = renderContext(doc, env),
): string {
  const template = env.templates.require(slide.type);
  const index = doc.slides.indexOf(slide);
  const label = index >= 0 ? ` aria-label="Slide ${index + 1}"` : "";
  return (
    `<section class="ls-slide" data-slide-id="${esc(slide.id)}" data-slide-type="${esc(slide.type)}"` +
    `${slide.layout ? ` data-layout="${esc(slide.layout)}"` : ""} aria-roledescription="slide"${label}>` +
    `<div class="ls-body">${template.render(slide.content, { ...ctx, slideId: slide.id })}</div></section>`
  );
}

/** Attributes for the `.ls-deck` wrapper that carries theme and settings. */
export function deckAttributes(doc: LessonDocument, env: RenderEnv): string {
  const theme = env.themes.resolve(doc.theme.id);
  const style = Object.entries(doc.theme.overrides ?? {})
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return (
    `class="ls-deck" data-theme="${esc(theme.id)}" data-hanzi-font="${esc(doc.settings.hanziFont)}"` +
    ` data-pinyin="${doc.settings.pinyin ? "on" : "off"}" data-sound="${doc.settings.sound ? "on" : "off"}" data-animations="${doc.settings.animations ? "on" : "off"}"` +
    (style ? ` style="${esc(style)}"` : "")
  );
}

export function renderDeck(doc: LessonDocument, env: RenderEnv): string {
  const ctx = renderContext(doc, env);
  const slides = doc.slides.map((s) => renderSlide(doc, s, env, ctx)).join("\n");
  return `<main ${deckAttributes(doc, env)}>\n${slides}\n</main>`;
}

function usedTemplates(doc: LessonDocument, env: RenderEnv) {
  return [...new Set(doc.slides.map((s) => s.type))].map((t) => env.templates.require(t));
}

/** Fonts, stage, theme and the CSS of the templates this lesson uses. */
export function lessonCss(doc: LessonDocument, env: RenderEnv): string {
  return [FONT_CSS, baseCss, env.themes.resolve(doc.theme.id).css, ...usedTemplates(doc, env).map((t) => t.css)].join(
    "\n",
  );
}

/** CSS for every template and theme, used by the editor which shows any of them. */
export function editorCss(env: RenderEnv): string {
  return [FONT_CSS, baseCss, ...env.themes.list().map((t) => t.css), ...env.templates.list().map((t) => t.css)].join(
    "\n",
  );
}

/** Core runtime and classroom tools, plus only the interactions of templates the lesson uses. */
export function lessonRuntime(doc: LessonDocument, env: RenderEnv): string {
  const interactions = usedTemplates(doc, env).flatMap((t) => (t.interaction ? [t.interaction.source] : []));
  // Nothing in the runtime may close the inline <script> it is embedded in.
  return [runtimeCore, runtimeTools, ...interactions].join("\n").replace(/<\/script/gi, "<\/script");
}
