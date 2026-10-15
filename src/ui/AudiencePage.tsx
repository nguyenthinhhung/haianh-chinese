import { useEffect, useMemo, useRef, useState } from "react";
import type { LessonDocument } from "../core/schema";
import { renderDeck, type RenderEnv } from "../renderer/render";
import { loadRuntime, type PresentController, type PresentState } from "../renderer/runtime/load";
import { elementAt, slideSnapshot, type ToAudience, type ToPresenter } from "./presentLink";
import { useServices } from "./services";
import { LessonStyles } from "./SlideView";

/**
 * The slide show on the second display, driven by the presenter view. It runs
 * the same runtime as Present and lesson files and reports every change back.
 */
export function AudiencePage() {
  const services = useServices();
  const { screens, persistence } = services;
  const channel = useMemo(() => screens.presenter(), [screens]);
  const host = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState<{ doc: LessonDocument; dir: string; start: number } | null>(null);
  const controller = useRef<PresentController | null>(null);

  const env: RenderEnv | null = useMemo(
    () =>
      show && {
        templates: services.templates,
        themes: services.themes,
        assetUrl: (a) => persistence.assetUrl(show.dir, a.file),
      },
    [services, persistence, show],
  );

  useEffect(() => {
    const send = (m: ToPresenter) => channel.send(m);
    const stop = channel.listen((raw) => {
      const m = raw as ToAudience;
      const c = controller.current;
      switch (m.type) {
        case "show":
          // The presenter may ask twice while both pages start; the first one counts.
          setShow((s) => s ?? { doc: m.doc, dir: m.dir, start: m.start });
          break;
        case "key":
          document.dispatchEvent(new KeyboardEvent("keydown", { key: m.key, code: m.code, shiftKey: m.shiftKey, bubbles: true, cancelable: true }));
          break;
        case "go":
          c?.go(m.index);
          break;
        case "blank":
          c?.blank(m.mode);
          break;
        case "click": {
          const slide = host.current?.querySelector(".ls-slide.ls-current");
          const target = slide && elementAt(slide, m.path);
          if (target instanceof HTMLElement) target.click();
          break;
        }
        case "end":
          void persistence.setFullscreen(false);
          break;
      }
    });
    send({ type: "ready" });
    const onUnload = () => send({ type: "exit" });
    window.addEventListener("beforeunload", onUnload);
    return () => {
      stop();
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [channel, persistence]);

  useEffect(() => {
    const el = host.current;
    if (!el || !show || !env) return;
    el.innerHTML = renderDeck(show.doc, env);
    const deck = el.querySelector(".ls-deck");
    let state: PresentState | null = null;
    let last = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    // Reports the current slide as it looks now; games change it without a
    // step, so changes are watched too, and sent at most every 120 ms.
    const report = () => {
      timer = null;
      const slide = deck?.querySelector(".ls-slide.ls-current");
      if (!slide || !state) return;
      const html = slideSnapshot(slide);
      const key = `${JSON.stringify(state)}${html}`;
      if (key === last) return;
      last = key;
      channel.send({ type: "state", state, html } satisfies ToPresenter);
    };
    const schedule = () => {
      timer ??= setTimeout(report, 120);
    };
    const observer = new MutationObserver(schedule);

    void loadRuntime().then(() => {
      if (cancelled || !deck) return;
      controller.current =
        window.LessonStudio?.mount(deck, {
          start: show.start,
          onState: (s) => {
            state = s;
            schedule();
          },
          onExit: () => channel.send({ type: "exit" } satisfies ToPresenter),
          toggleFullscreen: () => void persistence.isFullscreen().then((on) => persistence.setFullscreen(!on)),
        }) ?? null;
      observer.observe(deck, { subtree: true, childList: true, attributes: true, characterData: true });
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      if (timer) clearTimeout(timer);
      controller.current?.destroy();
      controller.current = null;
      el.innerHTML = "";
    };
  }, [show, env, channel, persistence]);

  return (
    <div className="audience">
      {env && <LessonStyles env={env} />}
      <div ref={host} />
    </div>
  );
}
