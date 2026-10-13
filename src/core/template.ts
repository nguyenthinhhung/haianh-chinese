import type { ZodType } from "zod";
import type { Asset, LessonScript } from "./schema";

export type TemplateCategory = "teach" | "qa" | "game";

export interface RenderContext {
  /** ID of the slide being rendered; prefix DOM ids with it so they stay unique. */
  slideId: string;
  /** URL for an asset in the current output: relative path, webview URL or data URI. */
  assetUrl(assetId: string): string | undefined;
  asset(assetId: string): Asset | undefined;
  script: LessonScript;
}

/**
 * Declarative description of a template's form. The Properties panel builds its
 * UI from this, so a new template rarely needs UI code of its own.
 */
export type EditorField =
  | {
      kind: "text";
      key: string;
      label: string;
      lang?: "zh" | "vi" | "pinyin";
      multiline?: boolean;
      placeholder?: string;
    }
  | { kind: "toggle"; key: string; label: string }
  | { kind: "select"; key: string; label: string; options: { value: string; label: string }[] }
  | {
      kind: "asset";
      key: string;
      label: string;
      assetKind: "image" | "audio";
      /** Sibling text fields, in order of preference, that prefill the image search. */
      searchFrom?: string[];
      /** Sibling field whose Chinese text the "read aloud" button speaks. */
      speakFrom?: string;
    }
  | {
      kind: "list";
      key: string;
      label: string;
      /** Singular noun for one item, used in labels and error locations ("từ 2"). */
      itemLabel: string;
      min: number;
      max: number;
      fields: EditorField[];
      newItem(): unknown;
    };

export type EditorFieldSpec = EditorField[];

/**
 * Soft limits that keep content inside the 16:9 stage. Keys are dotted paths
 * where `*` matches every list item, e.g. `words` or `words.*.hanzi`.
 * Exceeding a limit only warns; the schema holds the hard limits.
 */
export type ContentLimits = Record<string, { maxChars?: number; maxItems?: number }>;

export interface InteractionModule {
  /**
   * Plain browser JavaScript that calls `LessonStudio.registerInteraction(type, factory)`.
   * It runs inside presented and exported lessons, so it must not depend on the app.
   */
  source: string;
}

export interface SlideTemplate<C = unknown> {
  type: string;
  /** Name shown to the teacher. */
  label: string;
  category: TemplateCategory;
  schema: ZodType<C>;
  /** Short description of the content shape, included in the AI import prompt. */
  aiSchemaHint: string;
  defaults(): C;
  limits: ContentLimits;
  /** Static HTML for the slide's inner content; every user string must be escaped. */
  render(content: C, ctx: RenderContext): string;
  /** CSS for this template, scoped under `.ls-slide[data-slide-type="<type>"]`. */
  css: string;
  editor: EditorFieldSpec;
  interaction?: InteractionModule;
}

/** Erases the content type so templates of different shapes share one registry. */
export type AnySlideTemplate = SlideTemplate<any>;
