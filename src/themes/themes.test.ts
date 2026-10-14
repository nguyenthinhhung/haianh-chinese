import { describe, expect, it } from "vitest";
import { createThemeRegistry } from ".";
import { AGE_PROFILES } from "../core/ages";

const themes = createThemeRegistry().list();

describe.each(themes.map((t) => [t.id, t] as const))("theme %s", (id, theme) => {
  it("scopes its CSS to its own decks", () => {
    const rules = theme.css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("}")
      .map((r) => r.trim())
      .filter(Boolean);
    for (const rule of rules) {
      for (const selector of rule.slice(0, rule.indexOf("{")).split(",")) {
        expect(selector.trim(), rule).toMatch(new RegExp(`^\\.ls-deck\\[data-theme="${id}"\\]`));
      }
    }
  });

  it("has CSS and fills in every decoration", () => {
    expect(theme.css.length).toBeGreaterThan(0);
    expect(theme.css).not.toContain("var(--decor-");
  });

  it("sets the core colours", () => {
    for (const v of ["--ls-bg", "--ls-fg", "--ls-muted", "--ls-accent", "--ls-surface", "--ls-pinyin"]) {
      expect(theme.css).toContain(`${v}:`);
    }
  });
});

it("ships the MVP themes, two for older students, four seasonal and four cultural ones", () => {
  expect(themes.map((t) => t.id).sort()).toEqual([
    "autumn",
    "classic",
    "garden",
    "greatwall",
    "ink",
    "notebook",
    "ocean",
    "panda",
    "papercut",
    "porcelain",
    "space",
    "spring",
    "summer",
    "tea",
    "winter",
  ]);
});

it("has a theme for every age", () => {
  for (const a of AGE_PROFILES) expect(themes.some((t) => t.ages.includes(a.id)), a.id).toBe(true);
});
