import { useEffect, useRef } from "react";
import type { LessonDocument } from "../core/schema";
import { renderDeck, type RenderEnv } from "../renderer/render";
import { loadRuntime } from "../renderer/runtime/load";
import { useServices } from "./services";

interface Props {
  doc: LessonDocument;
  env: RenderEnv;
  start: number;
  /** Called with the slide on screen when the teacher leaves (Esc). */
  onExit(index: number): void;
}

/**
 * Full-screen presentation inside the app, using the same markup and runtime
 * as a lesson file, so what the teacher rehearses here is what the exported
 * file shows. The renderer escapes all lesson text, so inserting its HTML is safe.
 */
export function PresentMode({ doc, env, start, onExit }: Props) {
  const { persistence } = useServices();
  const host = useRef<HTMLDivElement>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let current = start;
    let controller: { destroy(): void } | null = null;
    let cancelled = false;
    let wasFullscreen = false;

    const toggleFullscreen = () =>
      void persistence.isFullscreen().then((on) => persistence.setFullscreen(!on));

    el.innerHTML = renderDeck(doc, env);
    // The runtime ignores keys typed into a field; a form field left focused
    // in the editor would swallow the arrow keys.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    void (async () => {
      wasFullscreen = await persistence.isFullscreen();
      await loadRuntime();
      if (cancelled) return;
      const deck = el.querySelector(".ls-deck");
      controller =
        deck &&
        (window.LessonStudio?.mount(deck, {
          start,
          onChange: (i) => (current = i),
          onExit: () => onExitRef.current(current),
          toggleFullscreen,
        }) ?? null);
      if (!controller) {
        onExitRef.current(current);
        return;
      }
      await persistence.setFullscreen(true);
    })();

    return () => {
      cancelled = true;
      controller?.destroy();
      el.innerHTML = "";
      if (!wasFullscreen) void persistence.setFullscreen(false);
    };
    // The deck is rendered once per presentation; edits cannot happen meanwhile.
  }, []);

  return <div ref={host} className="present-host" />;
}
