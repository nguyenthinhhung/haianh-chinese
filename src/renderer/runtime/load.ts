/**
 * Loads the presentation runtime into the app, for Present. These are the same
 * scripts a lesson file embeds as text. The interactions call
 * `LessonStudio.registerInteraction`, so they load only after the core has run.
 */
let loading: Promise<void> | undefined;

export function loadRuntime(): Promise<void> {
  loading ??= import("./core.js").then(async () => {
    await import("./tools.js");
    const interactions = import.meta.glob("../../templates/*/interaction.js");
    await Promise.all(Object.values(interactions).map((load) => load()));
  });
  return loading;
}

export interface PresentController {
  next(): void;
  prev(): void;
  go(index: number): void;
  destroy(): void;
}

export interface MountOptions {
  start?: number;
  onChange?(index: number): void;
  onExit?(): void;
  toggleFullscreen?(): void;
}

declare global {
  interface Window {
    LessonStudio?: { mount(deck: Element, options: MountOptions): PresentController | null };
  }
}
