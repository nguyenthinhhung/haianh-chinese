import type { AnySlideTemplate, EditorField } from "./template";

/**
 * Content for a slide the teacher adds by hand: the template's settings
 * (selects, toggles) as they come, every text field empty, no pictures or
 * sounds, and each list with as many empty items as it needs. The sample
 * content of `defaults()` would only have to be deleted first. The slide's
 * heading stays, unless the template names a plainer one.
 */
export function blankContent(template: AnySlideTemplate): unknown {
  const base = template.defaults() as Record<string, unknown>;
  return { ...blankFields(base, template.editor, true), ...(template.blankHeading !== undefined ? { heading: template.blankHeading } : {}) };
}

function blankFields(content: Record<string, unknown>, fields: EditorField[], top: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = { ...content };
  for (const field of fields) {
    if (field.kind === "text") {
      if (!(top && field.key === "heading")) out[field.key] = "";
    } else if (field.kind === "asset") {
      delete out[field.key];
    } else if (field.kind === "list") {
      out[field.key] = Array.from({ length: field.min }, () => field.newItem());
    }
  }
  return out;
}
