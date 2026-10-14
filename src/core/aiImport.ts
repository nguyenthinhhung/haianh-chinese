import { ageProfile } from "./ages";
import { describeContentPath, type Path } from "./fields";
import { newId } from "./ids";
import {
  BLUEPRINTS,
  DURATIONS,
  parseWordList,
  planSlideCount,
  resolvePlan,
  type LessonRequest,
} from "./lessonPlan";
import type { Slide } from "./schema";
import type { EditorFieldSpec } from "./template";
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

/** Removes picture and sound fields: the AI cannot supply files, the teacher adds them later. */
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
  | { ok: true; title: string; slides: Slide[] }
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
  envelope.slides.forEach((entry: unknown, i) => {
    const where = `Slide ${i + 1}`;
    const item = entry as { type?: unknown; content?: unknown; notes?: unknown } | null;
    const type = typeof item?.type === "string" ? item.type : "";
    const template = registry.get(type);
    if (!template) {
      errors.push(`${where}: loại slide "${type || "(trống)"}" không có trong ứng dụng.`);
      return;
    }
    const parsed = template.schema.safeParse(withoutAssets(item?.content ?? {}, template.editor));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = describeContentPath(issue.path as Path, template.editor);
        errors.push(`${where} (${template.label})${path.length ? `, ${path.join(", ")}` : ""}: ${issue.message}`);
      }
      return;
    }
    const notes = typeof item?.notes === "string" ? item.notes.trim().slice(0, 5000) : "";
    slides.push({ id: newId("s"), type, content: parsed.data, ...(notes ? { notes } : {}) });
  });
  if (errors.length) return { ok: false, errors };
  const title = typeof envelope.title === "string" && envelope.title.trim() ? envelope.title.trim().slice(0, 120) : "";
  return { ok: true, title, slides };
}

/** The prompt the teacher pastes into an AI chat: the lesson they asked for, in the order the blueprint sets. */
export function buildAiPrompt(registry: TemplateRegistry, request: LessonRequest): string {
  const plan = resolvePlan(request);
  const age = ageProfile(request.age);
  const kind = BLUEPRINTS.find((b) => b.id === request.kind) ?? BLUEPRINTS[0]!;
  const duration = DURATIONS.find((d) => d.id === request.duration) ?? DURATIONS[1]!;
  const words = parseWordList(request.words);
  const review = request.kind === "review";

  const lesson = [
    `- Chủ đề: ${request.topic.trim() || "[GHI CHỦ ĐỀ Ở ĐÂY]"}`,
    `- Học sinh: ${age.label}. ${age.guidance}`,
    `- Dạng bài: ${kind.label}. ${kind.description}`,
    `- Thời lượng: ${duration.label}, tổng cộng ${planSlideCount(plan)} slide.`,
    words.length
      ? review
        ? `- Từ đã học cần ôn (chỉ dùng những từ này, không thêm từ mới): ${words.join(", ")}`
        : `- Từ vựng bắt buộc (phải dạy đủ, có thể thêm vài từ cùng chủ đề): ${words.join(", ")}`
      : `- Số từ ${review ? "ôn tập" : "mới"}: khoảng ${age.words[0]}–${age.words[1]} từ hợp với chủ đề.`,
    ...(request.patterns.trim() ? [`- Mẫu câu cần dạy: ${request.patterns.trim()}`] : []),
    ...(request.notes.trim() ? [`- Yêu cầu thêm của giáo viên: ${request.notes.trim()}`] : []),
  ].join("\n");

  const sequence = plan
    .map((s, i) => {
      const types = s.types.map((t) => `"${t}"`).join(", ");
      return `${i + 1}. ${s.role} — ${s.count} slide, ${s.types.length > 1 ? `chọn trong: ${types}` : types}`;
    })
    .join("\n");

  const used = new Set(plan.flatMap((s) => s.types));
  const types = registry
    .list()
    .filter((t) => used.has(t.type))
    .map((t) => `- "${t.type}" (${t.label}): ${t.aiSchemaHint}`)
    .join("\n");

  const example = {
    title: "Hoa quả",
    slides: [
      { type: "cover", content: { title: "水果", pinyin: "shuǐ guǒ", subtitle: "Hoa quả" } },
      {
        type: "vocabulary",
        content: {
          heading: "Từ vựng",
          words: [
            { hanzi: "苹果", pinyin: "píng guǒ", meaning: "quả táo" },
            { hanzi: "香蕉", pinyin: "xiāng jiāo", meaning: "quả chuối" },
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
- Luôn điền pinyin và nghĩa tiếng Việt ở mọi trường có; giáo viên tự ẩn khi trình chiếu nếu cần.
- Nghĩa, câu hỏi và giải thích bằng tiếng Việt, ngắn gọn, hợp lứa tuổi.
- Slide luyện tập và trò chơi chỉ dùng từ và mẫu câu đã dạy trong bài.
- Thêm "notes" cho slide hoạt động: cách tổ chức cho cả lớp hoặc theo đội.
- Không đưa ảnh hay âm thanh: giáo viên sẽ tự thêm.

Ví dụ về định dạng (nội dung chỉ để minh hoạ):
${JSON.stringify(example, null, 2)}`;
}
