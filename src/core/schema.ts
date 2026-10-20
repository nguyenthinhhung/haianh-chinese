import { z } from "zod";
import { ExerciseSchema } from "./exerciseSchema";
import { ID_PATTERNS } from "./ids";

z.config(z.locales.vi());

/** 2: `exercises`. An older app refuses such a file instead of dropping them on save. */
export const SCHEMA_VERSION = 2;

/**
 * Asset files always live directly in the lesson's `assets/` folder. Anything
 * else (absolute paths, URLs, `file:`, `javascript:`, `..`) is rejected.
 */
export function isSafeAssetPath(file: string): boolean {
  return /^assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(file) && !file.includes("..");
}

export const AssetIdRef = z.string().regex(ID_PATTERNS.asset, "ID tài nguyên không hợp lệ");

export const AssetSchema = z.object({
  id: AssetIdRef,
  file: z.string().refine(isSafeAssetPath, "Đường dẫn tài nguyên không hợp lệ"),
  kind: z.enum(["image", "audio"]),
  mime: z.string().regex(/^(image|audio)\/[a-z0-9.+-]+$/, "Kiểu MIME không hợp lệ"),
  alt: z.string().max(200).optional(),
  /** Web page or URL the file was taken from, so the teacher can find it again. */
  source: z.string().max(2000).regex(/^https?:\/\//, "Nguồn phải là địa chỉ web").optional(),
  /** Picked automatically and not yet looked at by the teacher. */
  needsReview: z.literal(true).optional(),
  /** Search words the picture was found with, so swapping it starts there. */
  query: z.string().max(100).optional(),
});

/** Only colour values may override theme variables; free-form CSS is never injected. */
const ThemeOverrides = z.record(
  z.string().regex(/^--ls-[a-z0-9-]+$/, "Tên biến theme không hợp lệ"),
  z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "Màu không hợp lệ"),
);

export const SettingsSchema = z.object({
  sound: z.boolean().default(true),
  animations: z.boolean().default(true),
  hanziFont: z.enum(["sans", "kai"]).default("sans"),
  /** Off for classes that read characters without help; tone exercises keep theirs. */
  pinyin: z.boolean().default(true),
});

export const SlideSchema = z.object({
  id: z.string().regex(ID_PATTERNS.slide, "ID slide không hợp lệ"),
  type: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, "Loại slide không hợp lệ"),
  // Validated separately against the template registered for `type`.
  content: z.unknown(),
  layout: z.string().max(40).optional(),
  notes: z.string().max(5000).optional(),
});

export const LessonSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().regex(ID_PATTERNS.lesson, "ID bài học không hợp lệ"),
  title: z.string().regex(/\S/, "Tên bài học không được để trống").max(120),
  script: z.enum(["simplified", "traditional"]).default("simplified"),
  theme: z
    .object({
      id: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
      overrides: ThemeOverrides.optional(),
    })
    .prefault({ id: "classic" }),
  settings: SettingsSchema.prefault({}),
  slides: z.array(SlideSchema),
  /** Exercises students do on their own; see exerciseSchema.ts. */
  exercises: z.array(ExerciseSchema).max(50).default([]),
  assets: z.array(AssetSchema).default([]),
  metadata: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
    appVersion: z.string(),
  }),
});

export type Asset = z.output<typeof AssetSchema>;
export type Slide = z.output<typeof SlideSchema>;
export type LessonSettings = z.output<typeof SettingsSchema>;
export type LessonDocument = z.output<typeof LessonSchema>;
export type LessonScript = LessonDocument["script"];
