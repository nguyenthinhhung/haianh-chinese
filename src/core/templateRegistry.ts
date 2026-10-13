import type { AnySlideTemplate, TemplateCategory } from "./template";

export class TemplateRegistry {
  private readonly templates = new Map<string, AnySlideTemplate>();

  constructor(templates: AnySlideTemplate[] = []) {
    for (const t of templates) this.register(t);
  }

  register(template: AnySlideTemplate): void {
    if (this.templates.has(template.type)) {
      throw new Error(`Template "${template.type}" is already registered`);
    }
    this.templates.set(template.type, template);
  }

  get(type: string): AnySlideTemplate | undefined {
    return this.templates.get(type);
  }

  require(type: string): AnySlideTemplate {
    const t = this.templates.get(type);
    if (!t) throw new Error(`Unknown slide type "${type}"`);
    return t;
  }

  list(category?: TemplateCategory): AnySlideTemplate[] {
    const all = [...this.templates.values()];
    return category ? all.filter((t) => t.category === category) : all;
  }
}
