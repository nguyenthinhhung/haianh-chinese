import { normalizeForm, type LessonForm } from "../core/lessonForm";
import type { TemplateRegistry } from "../core/templateRegistry";

// The teacher's lesson forms, kept on this computer like her other AI choices.
const FORMS_KEY = "ls.lessonForms";

export function loadForms(registry: TemplateRegistry): LessonForm[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(FORMS_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map((f) => normalizeForm(f, registry)).filter((f): f is LessonForm => f !== null);
  } catch {
    return [];
  }
}

function store(forms: LessonForm[]): boolean {
  try {
    localStorage.setItem(FORMS_KEY, JSON.stringify(forms));
    return true;
  } catch {
    return false;
  }
}

/** Saves `form`, replacing one of the same name; false when it could not be kept. */
export function saveForm(form: LessonForm, registry: TemplateRegistry): boolean {
  return store([...loadForms(registry).filter((f) => f.name !== form.name), form]);
}

export function deleteForm(name: string, registry: TemplateRegistry): LessonForm[] {
  const rest = loadForms(registry).filter((f) => f.name !== name);
  store(rest);
  return rest;
}
