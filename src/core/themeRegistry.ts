import type { Theme } from "./theme";

export class ThemeRegistry {
  private readonly themes = new Map<string, Theme>();

  constructor(
    themes: Theme[],
    readonly fallbackId: string,
  ) {
    for (const t of themes) this.register(t);
    if (!this.themes.has(fallbackId)) throw new Error(`Fallback theme "${fallbackId}" is not registered`);
  }

  register(theme: Theme): void {
    if (this.themes.has(theme.id)) throw new Error(`Theme "${theme.id}" is already registered`);
    this.themes.set(theme.id, theme);
  }

  /** A lesson made by a newer app may name a theme this build lacks; it then falls back. */
  resolve(id: string): Theme {
    return this.themes.get(id) ?? this.themes.get(this.fallbackId)!;
  }

  list(): Theme[] {
    return [...this.themes.values()];
  }
}
