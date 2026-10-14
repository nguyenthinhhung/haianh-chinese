import { describe, expect, it } from "vitest";
import { renderContext } from "../renderer/render";
import { createFromSample } from "../samples";
import { testEnv } from "../test/env";

const env = testEnv();
const doc = createFromSample("blank", "Trống", "0.0.0");
const ctx = { ...renderContext(doc, env), slideId: "s_test0001" };

function poison(value: unknown, payload: string): unknown {
  if (typeof value === "string") return payload;
  if (Array.isArray(value)) return value.map((v) => poison(v, payload));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, poison(v, payload)]));
  }
  return value;
}

describe.each(env.templates.list().map((t) => [t.type, t] as const))("template %s", (_type, template) => {
  it("has valid defaults", () => {
    expect(template.schema.safeParse(template.defaults()).success).toBe(true);
  });

  it("describes itself for AI import", () => {
    expect(template.aiSchemaHint.length).toBeGreaterThan(20);
  });

  it("scopes its CSS to its own slides", () => {
    expect(template.css.length).toBeGreaterThan(0);
    // Animations are global by name, so they only need a prefix that cannot clash.
    const keyframes = /@keyframes\s+([\w-]+)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;
    for (const [, name] of template.css.matchAll(keyframes)) expect(name).toMatch(/^ls-/);
    const rules = template.css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(keyframes, "")
      .split("}")
      .map((r) => r.trim())
      .filter(Boolean);
    for (const rule of rules) {
      for (const selector of rule.slice(0, rule.indexOf("{")).split(",")) {
        expect(selector.trim(), rule).toMatch(new RegExp(`^\\.ls-slide\\[data-slide-type="${template.type}"\\]`));
      }
    }
  });

  it("has an editor field for every top-level content key", () => {
    const editorKeys = template.editor.map((f) => f.key);
    for (const key of Object.keys(template.defaults() as object)) expect(editorKeys).toContain(key);
  });

  it("escapes every user string it renders", () => {
    const payload = `<img src=x onerror=alert(1)>"'`;
    const html = template.render(poison(template.defaults(), payload), ctx);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;&quot;&#39;");
  });

  it("drops assets that resolve to unsafe URLs", () => {
    const withAssets = structuredClone(template.defaults()) as Record<string, unknown>;
    for (const field of template.editor) {
      if (field.kind === "asset") withAssets[field.key] = "a_evil0001";
      if (field.kind === "list") {
        const items = withAssets[field.key] as Record<string, unknown>[];
        for (const sub of field.fields) if (sub.kind === "asset") items.forEach((it) => (it[sub.key] = "a_evil0001"));
      }
    }
    const evilCtx = { ...ctx, assetUrl: () => "javascript:alert(1)" };
    expect(template.render(withAssets, evilCtx)).not.toContain("javascript:");
  });
});
