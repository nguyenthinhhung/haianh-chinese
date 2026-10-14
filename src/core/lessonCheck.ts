import { imageSlots, picturesToReview } from "./autoImages";
import { checkLimits, describeContentPath, type Path } from "./fields";
import { slidePinyinProblems } from "./pinyinCheck";
import type { LessonDocument } from "./schema";
import type { TemplateRegistry } from "./templateRegistry";

/**
 * Everything worth a look before teaching a lesson, however it was made:
 * content a slide cannot show (errors), and text too long for the slide,
 * pinyin that cannot be right, missing or unreviewed pictures (warnings).
 */

export interface LessonIssue {
  slideId: string;
  slideIndex: number;
  level: "error" | "warning";
  message: string;
}

export function lessonIssues(doc: LessonDocument, registry: TemplateRegistry): LessonIssue[] {
  const unreviewed = new Map<string, string[]>();
  for (const p of picturesToReview(doc, registry)) unreviewed.set(p.slideId, [...(unreviewed.get(p.slideId) ?? []), p.anchor]);

  return doc.slides.flatMap((slide, slideIndex): LessonIssue[] => {
    const template = registry.get(slide.type);
    if (!template) return [{ slideId: slide.id, slideIndex, level: "error", message: `Loại slide "${slide.type}" không có trong ứng dụng.` }];
    const at = (path: Path) => {
      const where = describeContentPath(path, template.editor);
      return where.length ? `${where.join(", ")}: ` : "";
    };
    const issue = (level: LessonIssue["level"], message: string): LessonIssue => ({ slideId: slide.id, slideIndex, level, message });
    const out: LessonIssue[] = [];

    const parsed = template.schema.safeParse(slide.content);
    if (!parsed.success) for (const e of parsed.error.issues) out.push(issue("error", `${at(e.path as Path)}${e.message}`));
    for (const w of checkLimits(slide.content, template.limits)) out.push(issue("warning", `${at(w.path)}${w.message}`));
    for (const p of slidePinyinProblems(slide)) out.push(issue("warning", `${p[0]!.toUpperCase()}${p.slice(1)}.`));

    const missing = imageSlots(slide, registry).filter((s) => !s.assetId).map((s) => s.anchor);
    if (missing.length) out.push(issue("warning", `Chưa có ảnh: ${missing.join(", ")}.`));
    const toReview = unreviewed.get(slide.id);
    if (toReview) out.push(issue("warning", `Ảnh tự chọn chưa duyệt: ${[...new Set(toReview)].join(", ")}.`));
    return out;
  });
}
