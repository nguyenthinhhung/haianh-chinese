import { esc, jsonForScript } from "../renderer/escape";
import { lessonCss, lessonRuntime, renderDeck, type RenderEnv } from "../renderer/render";
import { migrate } from "./migration";
import { isSafeAssetPath, SCHEMA_VERSION, type LessonDocument } from "./schema";
import type { TemplateRegistry } from "./templateRegistry";
import { formatIssue, validateLesson, type LessonIssue } from "./validate";

export const GENERATOR = "Chinese Lesson Studio";

export type OpenErrorCode = "not-lesson" | "bad-json" | "too-new" | "invalid";

export type ParseResult =
  | { ok: true; doc: LessonDocument; migratedFrom?: number }
  | { ok: false; code: OpenErrorCode; message: string; details: string[]; issues?: LessonIssue[] };

const META_RE = /<meta\b[^>]*\bname\s*=\s*["']lesson-studio-schema["'][^>]*>/i;
const DATA_RE = /<script\b(?=[^>]*\bid\s*=\s*["']lesson-data["'])(?=[^>]*\btype\s*=\s*["']application\/json["'])[^>]*>([\s\S]*?)<\/script\s*>/i;
const ASSETS_RE = /<script\b(?=[^>]*\bid\s*=\s*["']lesson-assets["'])(?=[^>]*\btype\s*=\s*["']application\/json["'])[^>]*>([\s\S]*?)<\/script\s*>/i;
/** The only values an embedded asset may have; the runtime checks the same. */
export const ASSET_DATA_RE = /^data:(image|audio)\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/;

/** Asset files embedded in an exported lesson, keyed by `assets/…` path. */
export type AssetData = Record<string, string>;

/**
 * Reads a lesson from HTML text. Only the embedded JSON is read: the DOM and
 * every other `<script>` are ignored, and nothing in the file is executed.
 */
export function parseLessonHtml(html: string, registry: TemplateRegistry): ParseResult {
  const data = DATA_RE.exec(html);
  if (!META_RE.test(html) || !data) {
    return {
      ok: false,
      code: "not-lesson",
      message: "File này không phải bài học của Chinese Lesson Studio.",
      details: ["Thiếu thẻ meta lesson-studio-schema hoặc khối dữ liệu #lesson-data."],
    };
  }

  return parseLessonJson(data[1]!, registry);
}

/**
 * Reads lesson JSON — the block embedded in `lesson.html`, or a draft — through
 * the same migrate-then-validate path.
 */
export function parseLessonJson(json: string, registry: TemplateRegistry): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return {
      ok: false,
      code: "bad-json",
      message: "Dữ liệu bài học trong file bị hỏng.",
      details: [e instanceof Error ? e.message : String(e)],
    };
  }

  const migrated = migrate(raw);
  if (!migrated.ok) {
    return {
      ok: false,
      code: migrated.code === "too-new" ? "too-new" : "invalid",
      message: migrated.code === "too-new" ? "Bài học được tạo bằng phiên bản mới hơn của ứng dụng." : "Không đọc được bài học.",
      details: [migrated.message],
    };
  }

  const result = validateLesson(migrated.raw, registry);
  if (!result.ok) {
    return {
      ok: false,
      code: "invalid",
      message: "Bài học có dữ liệu không hợp lệ.",
      details: result.issues.map((i) => formatIssue(i, migrated.raw, registry)),
      issues: result.issues,
    };
  }
  return migrated.fromVersion < SCHEMA_VERSION
    ? { ok: true, doc: result.doc, migratedFrom: migrated.fromVersion }
    : { ok: true, doc: result.doc };
}

/**
 * Reads the asset files embedded in an exported lesson (`#lesson-assets`),
 * keeping only safe paths with image or audio data. Like the lesson itself,
 * this reads JSON only.
 */
export function readAssetData(html: string): AssetData {
  const block = ASSETS_RE.exec(html);
  if (!block) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(block[1]!);
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(([file, data]) => isSafeAssetPath(file) && typeof data === "string" && ASSET_DATA_RE.test(data)),
  ) as AssetData;
}

/**
 * Writes a complete, self-presenting HTML file: rendered slides, CSS, runtime
 * and the JSON that is the actual source of truth. Callers validate first.
 * With `assets`, the files travel inside the page (an export for another
 * computer): slides keep their `assets/…` paths and the runtime swaps in the
 * embedded data when the page opens, so each file is stored only once.
 */
export function serializeLessonHtml(doc: LessonDocument, env: RenderEnv, options: { assets?: AssetData } = {}): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="${GENERATOR}">
<meta name="lesson-studio-schema" content="${SCHEMA_VERSION}">
<title>${esc(doc.title)}</title>
<style>
${lessonCss(doc, env)}
</style>
</head>
<body>
${renderDeck(doc, env)}
<script type="application/json" id="lesson-data">
${jsonForScript(doc)}
</script>
${options.assets ? `<script type="application/json" id="lesson-assets">\n${jsonForScript(options.assets)}\n</script>\n` : ""}<script>
${lessonRuntime(doc, env)}
</script>
</body>
</html>
`;
}
