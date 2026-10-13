import type { RenderEnv } from "../renderer/render";
import { createTemplateRegistry } from "../templates";
import { createThemeRegistry } from "../themes";

export function testEnv(): RenderEnv {
  return {
    templates: createTemplateRegistry(),
    themes: createThemeRegistry(),
    assetUrl: (a) => a.file,
  };
}
