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
  /** Blacks or whites out the screen; null brings the slide back. */
  blank(mode: BlankMode | null): void;
  destroy(): void;
}

export type BlankMode = "black" | "white";

/** Where a presentation stands, reported after every move. */
export interface PresentState {
  index: number;
  /** Steps of the current slide done so far, out of `steps`; games may run past their steps. */
  step: number;
  steps: number;
  blank: BlankMode | null;
}

export interface MountOptions {
  start?: number;
  onChange?(index: number): void;
  onState?(state: PresentState): void;
  onExit?(): void;
  toggleFullscreen?(): void;
}

declare global {
  interface Window {
    LessonStudio?: { mount(deck: Element, options: MountOptions): PresentController | null };
  }
}
