import type { AnySlideTemplate } from "../core/template";
import { TemplateRegistry } from "../core/templateRegistry";

// Every `templates/<type>/index.ts` default-exports one template, so a new
// slide type is just a new folder.
const modules = import.meta.glob<AnySlideTemplate>("./*/index.ts", { eager: true, import: "default" });

export function createTemplateRegistry(): TemplateRegistry {
  return new TemplateRegistry(Object.values(modules));
}
