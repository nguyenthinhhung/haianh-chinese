import { z } from "zod";
import { ageProfile } from "./ages";
import { slotKey } from "./autoImages";
import { describeContentPath, type Path } from "./fields";
import { newId } from "./ids";
import { fillMissingPinyin } from "./pinyin";
import {
  BLUEPRINTS,
  DURATIONS,
  parseWordList,
  planSlideCount,
  resolvePlan,
  type LessonRequest,
} from "./lessonPlan";
import type { Slide } from "./schema";
import type { AnySlideTemplate, EditorFieldSpec } from "./template";
import type { TemplateRegistry } from "./templateRegistry";

/**
 * Importing lesson content written by an AI chat tool. The teacher copies a
 * prompt, pastes the reply back; nothing here talks to an AI service.
 */

const MAX_SLIDES = 60;

/**
 * Pulls the JSON out of a chat reply: code fences and any text around the
 * outermost object (or array) are dropped. Returns null when there is none.
 */
export function extractJson(text: string): string | null {
  const fenced = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1]! : text;
  const start = body.search(/[{[]/);
  if (start < 0) return null;
  const open = body[start]!;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i]!;
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return body.slice(start, i + 1);
  }
  return null;
}

/**
 * Picture search words the AI wrote into picture fields ("image": "orange
 * fruit"), by path. Links and file names are not search words and are skipped.
 */
function imageKeywords(content: unknown, fields: EditorFieldSpec, base: Path = []): [Path, string][] {
  if (!content || typeof content !== "object" || Array.isArray(content)) return [];
  const obj = content as Record<string, unknown>;
  return fields.flatMap((field): [Path, string][] => {
    const value = obj[field.key];
    if (field.kind === "list" && Array.isArray(value)) {
      return value.flatMap((item, i) => imageKeywords(item, field.fields, [...base, field.key, i]));
    }
    if (field.kind !== "asset" || field.assetKind !== "image" || typeof value !== "string") return [];
    const words = value.trim();
    const usable = words.length > 0 && words.length <= 60 && !/[/\\]|^\w+:|\.(png|jpe?g|gif|webp|svg)$/i.test(words);
    return usable ? [[[...base, field.key], words]] : [];
  });
}

/**
 * AI tools often write a list item as a bare string ("segments": ["猫", "狗"])
 * where an object is expected. The string becomes the item's first text field.
 */
function wrapBareStrings(content: unknown, fields: EditorFieldSpec): unknown {
  if (!content || typeof content !== "object" || Array.isArray(content)) return content;
  const out: Record<string, unknown> = { ...(content as Record<string, unknown>) };
  for (const field of fields) {
    if (field.kind !== "list" || !Array.isArray(out[field.key])) continue;
    const textKey = field.fields.find((f) => f.kind === "text")?.key;
    out[field.key] = (out[field.key] as unknown[]).map((item) =>
      typeof item === "string" && textKey ? { [textKey]: item } : wrapBareStrings(item, field.fields),
    );
  }
  return out;
}

/** Limits above this are rarely reached, and listing them would only lengthen the prompt. */
const PROMPT_MAX_CHARS = 50;

/**
 * Character limits of a template's text fields, as told to the AI: the
 * smaller of what still fits the slide comfortably (`limits`) and what the
 * import accepts (read from the schema, so the prompt never drifts from it).
 * Headings share one rule in the prompt and are left out.
 */
export function lengthLimits(template: Pick<AnySlideTemplate, "schema" | "limits">): string[] {
  const limits = new Map<string, number>();
  const keep = (path: string, max: number) => limits.set(path, Math.min(max, limits.get(path) ?? Infinity));
  try {
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== "object") return;
      const n = node as { type?: string; maxLength?: number; properties?: Record<string, unknown>; items?: unknown };
      if (n.type === "string" && n.maxLength !== undefined) keep(path, n.maxLength);
      for (const [key, child] of Object.entries(n.properties ?? {})) walk(child, path ? `${path}.${key}` : key);
      if (n.items) walk(n.items, `${path}[]`);
    };
    walk(z.toJSONSchema(template.schema, { io: "input", unrepresentable: "any" }), "");
  } catch {
    // A schema JSON Schema cannot express still has its comfortable limits.
  }
  for (const [pattern, limit] of Object.entries(template.limits)) {
    if (limit.maxChars !== undefined) keep(pattern.replace(/\.\*/g, "[]"), limit.maxChars);
  }
  return [...limits].filter(([path, max]) => path !== "heading" && max <= PROMPT_MAX_CHARS).map(([path, max]) => `${path} ≤ ${max}`);
}

/** Picture fields filled in automatically, written as paths for the prompt: `words[].image`. */
function autoImageFields(fields: EditorFieldSpec, base = ""): string[] {
  return fields.flatMap((f) => {
    if (f.kind === "list") return autoImageFields(f.fields, `${base}${f.key}[].`);
    return f.kind === "asset" && f.autoImage ? [`${base}${f.key}`] : [];
  });
}

/** Removes picture and sound fields: the AI cannot supply files; pictures are searched for afterwards. */
function withoutAssets(content: unknown, fields: EditorFieldSpec): unknown {
  if (!content || typeof content !== "object" || Array.isArray(content)) return content;
  const out: Record<string, unknown> = { ...(content as Record<string, unknown>) };
  for (const field of fields) {
    if (field.kind === "asset") delete out[field.key];
    else if (field.kind === "list" && Array.isArray(out[field.key])) {
      out[field.key] = (out[field.key] as unknown[]).map((item) => withoutAssets(item, field.fields));
    }
  }
  return out;
}

export type AiImportResult =
  | {
      ok: true;
      title: string;
      slides: Slide[];
      /** The AI's picture search words, by `slotKey` of the new slides. */
      imageQueries: Map<string, string>;
    }
  | { ok: false; errors: string[] };

/**
 * Reads `{ "title", "slides": [{ "type", "content", "notes"? }] }` (or just
 * the slides array) and checks every slide against its template. Slides get
 * fresh IDs; every problem is reported with its location.
 */
export function parseAiLesson(text: string, registry: TemplateRegistry): AiImportResult {
  const json = extractJson(text);
  if (!json) return { ok: false, errors: ["Không tìm thấy JSON trong nội dung đã dán."] };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { ok: false, errors: [`JSON bị lỗi: ${e instanceof Error ? e.message : String(e)}`] };
  }
  const envelope = Array.isArray(raw) ? { slides: raw } : (raw as { title?: unknown; slides?: unknown } | null);
  if (!envelope || !Array.isArray(envelope.slides) || envelope.slides.length === 0) {
    return { ok: false, errors: ['JSON cần có danh sách "slides".'] };
  }
  if (envelope.slides.length > MAX_SLIDES) return { ok: false, errors: [`Tối đa ${MAX_SLIDES} slide mỗi lần nhập.`] };

  const errors: string[] = [];
  const slides: Slide[] = [];
  const imageQueries = new Map<string, string>();
  envelope.slides.forEach((entry: unknown, i) => {
    const where = `Slide ${i + 1}`;
    const item = entry as { type?: unknown; content?: unknown; notes?: unknown } | null;
    const type = typeof item?.type === "string" ? item.type : "";
    const template = registry.get(type);
    if (!template) {
      errors.push(`${where}: loại slide "${type || "(trống)"}" không có trong ứng dụng.`);
      return;
    }
    const content = wrapBareStrings(item?.content ?? {}, template.editor);
    const parsed = template.schema.safeParse(withoutAssets(content, template.editor));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = describeContentPath(issue.path as Path, template.editor);
        errors.push(`${where} (${template.label})${path.length ? `, ${path.join(", ")}` : ""}: ${issue.message}`);
      }
      return;
    }
    // Pinyin the AI left out is filled in, as long as the result still fits the schema.
    const filled = template.schema.safeParse(fillMissingPinyin(parsed.data, template.editor));
    const slideContent = filled.success ? filled.data : parsed.data;
    const notes = typeof item?.notes === "string" ? item.notes.trim().slice(0, 5000) : "";
    const id = newId("s");
    for (const [path, words] of imageKeywords(content, template.editor)) imageQueries.set(slotKey(id, path), words);
    slides.push({ id, type, content: slideContent, ...(notes ? { notes } : {}) });
  });
  if (errors.length) return { ok: false, errors };
  const title = typeof envelope.title === "string" && envelope.title.trim() ? envelope.title.trim().slice(0, 120) : "";
  return { ok: true, title, slides, imageQueries };
}

/**
 * The prompt the teacher pastes into an AI chat: the lesson they asked for, in
 * the order the blueprint sets. `insert`: the slides go into the middle of an
 * existing lesson.
 */
export function buildAiPrompt(registry: TemplateRegistry, request: LessonRequest, insert = false): string {
  const plan = resolvePlan(request, insert);
  const age = ageProfile(request.age);
  const kind = BLUEPRINTS.find((b) => b.id === request.kind) ?? BLUEPRINTS[0]!;
  const duration = DURATIONS.find((d) => d.id === request.duration) ?? DURATIONS[1]!;
  const words = parseWordList(request.words);
  const known = parseWordList(request.known);
  const exclude = parseWordList(request.exclude);
  const review = request.kind === "review";
  const focus = request.kind === "word-focus";
  const source = request.source.trim();

  const form = request.kind === "form" ? request.form : null;
  const lesson = [
    `- Chủ đề: ${request.topic.trim() || "[GHI CHỦ ĐỀ Ở ĐÂY]"}`,
    `- Học sinh: ${age.label}. ${age.guidance}`,
    form
      ? `- Dạng bài: theo khung bài "${form.name}" giáo viên dùng cho mọi bài. Làm đúng từng bước theo thứ tự, đúng số slide và loại slide của mỗi bước; tiêu đề slide giữ như tên bước, nội dung lấy từ bài học này.`
      : `- Dạng bài: ${kind.label}. ${kind.description}`,
    insert
      ? `- Các slide này được chèn vào giữa một bài đang có: tổng cộng ${planSlideCount(plan)} slide, không có trang bìa hay trang tổng kết.`
      : form
        ? `- Tổng cộng ${planSlideCount(plan)} slide.`
        : `- Thời lượng: ${duration.label}, tổng cộng ${planSlideCount(plan)} slide.`,
    ...(source
      ? [
          `- Giáo trình: ${source}. Giáo viên đính kèm các trang của bài này. Lấy đúng từ mới, mẫu câu và bài khoá/hội thoại trong tài liệu; không thêm từ ngoài bài (trừ từ lớp đã học). Slide luyện tập và trò chơi dùng lại đúng nội dung đó. Bám theo thứ tự các phần trong giáo trình khi hợp với trình tự slide bên dưới.`,
        ]
      : []),
    words.length
      ? focus
        ? `- Từ cần dạy kỹ (chỉ những từ này, không thêm từ mới): ${words.join(", ")}`
        : review
        ? `- Từ đã học cần ôn (chỉ dùng những từ này, không thêm từ mới): ${words.join(", ")}`
        : `- Từ vựng bắt buộc (phải dạy đủ, có thể thêm vài từ cùng chủ đề): ${words.join(", ")}`
      : source
        ? `- Từ ${review ? "ôn tập" : "mới"}: các từ của bài trong giáo trình.`
        : `- Số từ ${review ? "ôn tập" : "mới"}: khoảng ${age.words[0]}–${age.words[1]} từ hợp với chủ đề.`,
    ...(request.patterns.trim() ? [`- Mẫu câu cần dạy: ${request.patterns.trim()}`] : []),
    ...(known.length && !review
      ? [`- Từ lớp đã học (dùng lại trong câu, luyện tập và trò chơi; không dạy lại như từ mới): ${known.join(", ")}`]
      : []),
    ...(exclude.length ? [`- Không đưa vào bài: ${exclude.join(", ")}`] : []),
    ...(request.notes.trim() ? [`- Yêu cầu thêm của giáo viên: ${request.notes.trim()}`] : []),
  ].join("\n");

  const sequence = plan
    .map((s, i) => {
      const types = s.types.map((t) => `"${t}"`).join(", ");
      const note = s.note ? ` (ghi chú của giáo viên cho bước này, chép vào "notes" của slide: ${s.note})` : "";
      return `${i + 1}. ${s.role} — ${s.count} slide, ${s.types.length > 1 ? `chọn trong: ${types}` : types}${note}`;
    })
    .join("\n");

  const used = new Set(plan.flatMap((s) => s.types));
  const types = registry
    .list()
    .filter((t) => used.has(t.type))
    .map((t) => {
      const limits = lengthLimits(t);
      return `- "${t.type}" (${t.label}): ${t.aiSchemaHint}${limits.length ? ` Tối đa ký tự: ${limits.join(", ")}.` : ""}`;
    })
    .join("\n");
  const pictureFields = registry
    .list()
    .filter((t) => used.has(t.type))
    .flatMap((t) => autoImageFields(t.editor).map((f) => `"${t.type}": ${f}`))
    .join("; ");

  const example = {
    title: "Hoa quả",
    slides: [
      { type: "cover", content: { title: "水果", pinyin: "shuǐ guǒ", subtitle: "Hoa quả" } },
      {
        type: "vocabulary",
        content: {
          heading: "Từ vựng",
          words: [
            { hanzi: "苹果", pinyin: "píng guǒ", meaning: "quả táo", image: "red apple" },
            { hanzi: "香蕉", pinyin: "xiāng jiāo", meaning: "quả chuối", image: "banana" },
          ],
          hideMeaning: true,
        },
        notes: "Cả lớp đọc to từng từ hai lần.",
      },
      {
        type: "quiz",
        content: { mode: "choice", question: "Chữ này nghĩa là gì?", hanzi: "苹果", options: [{ text: "quả táo" }, { text: "quả chuối" }], answer: "a" },
      },
    ],
  };
  return `Bạn là trợ lý soạn bài giảng tiếng Trung cho học sinh Việt Nam. Giáo viên trình chiếu bài trên màn hình lớn và tự điều khiển; học sinh trả lời bằng lời.

Bài cần soạn:
${lesson}

Trình tự slide (giữ đúng thứ tự và số lượng):
${sequence}

Chỉ trả lời bằng MỘT khối JSON (không giải thích thêm) theo dạng:
{"title": "tên bài tiếng Việt", "slides": [{"type": "loại slide", "content": {...}, "notes": "gợi ý cho giáo viên (không bắt buộc)"}]}

Các loại slide được dùng và nội dung của từng loại:
${types}

Quy tắc:
- Chữ Hán giản thể; pinyin có dấu thanh, các âm tiết cách nhau bằng dấu cách (píng guǒ).
- Mỗi mục trong danh sách là một object như mô tả ở trên, kể cả khi chỉ có một trường ({"text": "..."}, không phải "...").
- Giữ đúng giới hạn "Tối đa ký tự" của từng trường (chữ dài hơn sẽ không vừa slide); "heading" tối đa 40 ký tự. Ô trò chơi và lựa chọn nên là một từ hoặc cụm từ ngắn; lời dặn cho học sinh ("Đọc…", "Nói…") ghi vào "notes".
- Luôn điền pinyin và nghĩa tiếng Việt ở mọi trường có; giáo viên tự ẩn khi trình chiếu nếu cần.
- Nghĩa, câu hỏi và giải thích bằng tiếng Việt, ngắn gọn, hợp lứa tuổi.
- Slide luyện tập và trò chơi chỉ dùng từ và mẫu câu đã dạy trong bài.
- Thêm "notes" cho slide hoạt động: cách tổ chức cho cả lớp hoặc theo đội.
${
  pictureFields
    ? `- Ảnh: ứng dụng tự tìm ảnh theo từ khoá bạn ghi vào các trường ${pictureFields}. Ghi một từ khoá TIẾNG ANH ngắn (1–3 từ) tả đúng vật cần minh hoạ, ví dụ "image": "orange fruit" (không ghi "orange" vì dễ ra màu cam). Không ghi link hay tên file.\n`
    : ""
}- Không đưa âm thanh: giáo viên sẽ tự thêm.

Ví dụ về định dạng (nội dung chỉ để minh hoạ):
${JSON.stringify(example, null, 2)}`;
}
