import type { Theme } from "../core/theme";
import { ThemeRegistry } from "../core/themeRegistry";

// Every `themes/<id>/index.ts` default-exports one theme.
const modules = import.meta.glob<Theme>("./*/index.ts", { eager: true, import: "default" });

export const DEFAULT_THEME_ID = "classic";

export function createThemeRegistry(): ThemeRegistry {
  return new ThemeRegistry(Object.values(modules), DEFAULT_THEME_ID);
}
