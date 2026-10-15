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
/**
 * Shown only when `when` returns true for the object holding the field (the
 * slide content, or the list item for fields inside a list).
 */
type Conditional = { when?(parent: any): boolean };

export type EditorField = (
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
      /**
       * The slide is incomplete without this picture, so it is filled in
       * automatically after an AI import or on request. Pictures that stand in
       * for text (a matching column, quiz options) stay opt-in. A function
       * decides from the whole slide content, e.g. only when cards show pictures.
       */
      autoImage?: boolean | ((slideContent: any) => boolean);
      /** Sibling field whose Chinese text the "read aloud" button speaks. */
      speakFrom?: string;
      /**
       * Pronunciation of the word or sentence beside it, so it is read aloud
       * automatically after an AI import or on request. Not for sound that
       * changes the activity (a listening question).
       */
      autoAudio?: boolean;
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
    }
) &
  Conditional;

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
  /** One line telling the teacher what the slide is for, shown in the "add slide" menu. */
  description: string;
  category: TemplateCategory;
  /** Position in the "add slide" menu; lower first, unset last. */
  order?: number;
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
  /**
   * The slide's list can be filled with words taught elsewhere in the lesson
   * ("Lấy từ trong bài"): `item` turns one into a list item.
   */
  fromWords?: { list: string; max: number; item(word: LessonWordLike): unknown };
  /** Heading of a slide added by hand, when the sample's heading is about the sample itself. */
  blankHeading?: string;
  /** Content keys the app fills in itself (e.g. fetched stroke data); they have no form field. */
  managedKeys?: string[];
  interaction?: InteractionModule;
}

/** Erases the content type so templates of different shapes share one registry. */
export type AnySlideTemplate = SlideTemplate<any>;

/** A word of the lesson as `fromWords` receives it (see core/lessonWords). */
export interface LessonWordLike {
  hanzi: string;
  pinyin: string;
  meaning: string;
  image?: string;
  audio?: string;
}
