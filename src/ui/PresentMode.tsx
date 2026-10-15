import { useEffect, useMemo, useRef, useState } from "react";
import type { LessonDocument } from "../core/schema";
import type { Channel } from "../platform/screens";
import { renderDeck, type RenderEnv } from "../renderer/render";
import { INK_COLORS, loadRuntime, type InkStroke, type PresentController, type PresentState } from "../renderer/runtime/load";
import { InkOverlay } from "./InkOverlay";
import { elementPath, type ToAudience, type ToPresenter } from "./presentLink";
import { PresenterView, ShowToolbar, SlideGrid, type PresentDriver } from "./PresenterView";
import { useServices } from "./services";
import { StaticDeck } from "./SlideView";

interface Props {
  doc: LessonDocument;
  env: RenderEnv;
  /** Lesson folder, so the slide show on another screen can load the pictures. */
  dir: string;
  start: number;
  /** Open the presenter view even on a single screen (Alt+F5). */
  presenterView?: boolean;
  /** Called with the slide on screen when the teacher leaves (Esc). */
  onExit(index: number): void;
}

/**
 * Full-screen presentation, using the same markup and runtime as a lesson
 * file, so what the teacher rehearses here is what the exported file shows.
 *
 * With a second display (a projector in Extend mode) the slides go there and
 * this window becomes the presenter view, as in PowerPoint. On one screen the
 * show runs here, and the presenter view can be switched on to rehearse.
 * The renderer escapes all lesson text, so inserting its HTML is safe.
 */
export function PresentMode({ doc, env, dir, start, presenterView = false, onExit }: Props) {
  const { persistence, screens } = useServices();
  const [mode, setMode] = useState<"starting" | "local" | "remote">("starting");
  const [localView, setLocalView] = useState<"show" | "presenter">(presenterView ? "presenter" : "show");
  const [state, setState] = useState<PresentState>({ index: start, step: 0, steps: 0, blank: null });
  const [mirror, setMirror] = useState("");
  /** The slide show's pen, and the ink on its current slide, for the presenter's copy. */
  const [ink, setInk] = useState<{ pen: boolean; color: string; strokes: InkStroke[] }>({ pen: false, color: INK_COLORS[0]!, strokes: [] });
  const [grid, setGrid] = useState(false);
  /** The slides are in a window of their own on this screen, for sharing in a video call. */
  const [online, setOnline] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<PresentController | null>(null);
  const channel = useRef<Channel | null>(null);
  const mirrorRef = useRef(mirror);
  mirrorRef.current = mirror;
  const stateRef = useRef(state);
  stateRef.current = state;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  /** Where the show (re)starts: the first slide, or where it was when moving to its own window. */
  const startRef = useRef(start);
  /** How this window was before the show, so it can be put back. */
  const windowBefore = useRef({ fullscreen: false, maximizedByShow: false });

  const end = () => onExitRef.current(stateRef.current.index);

  // Decide where the slides go. Alone, the show takes this whole screen. With
  // a second screen this window is only the presenter view, so it is
  // maximised rather than full screen, as in PowerPoint: the taskbar stays,
  // and the teacher can minimise it to open another app while the class
  // still sees the slides.
  useEffect(() => {
    let cancelled = false;
    // A form field left focused in the editor would swallow the arrow keys.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    void (async () => {
      windowBefore.current.fullscreen = await persistence.isFullscreen();
      const second = await screens.hasSecondScreen().catch(() => false);
      if (cancelled) return;
      if (second) {
        try {
          const link = await screens.openAudience();
          if (cancelled) {
            link.close();
            return;
          }
          channel.current = link;
          setMode("remote");
        } catch (e) {
          console.error("Could not open the second screen", e);
          setMode("local");
        }
      } else {
        setMode("local");
      }
      if (cancelled) return;
      if (!channel.current) await persistence.setFullscreen(true);
      else if (!windowBefore.current.fullscreen) await maximize();
    })();
    return () => {
      cancelled = true;
      channel.current?.send({ type: "end" } satisfies ToAudience);
      channel.current?.close();
      channel.current = null;
      if (!windowBefore.current.fullscreen) void persistence.setFullscreen(false);
      if (windowBefore.current.maximizedByShow) void persistence.setMaximized(false);
    };
    // One presentation per mount; edits cannot happen meanwhile.
  }, []);

  async function maximize() {
    if (await persistence.isMaximized()) return;
    windowBefore.current.maximizedByShow = true;
    await persistence.setMaximized(true);
  }

  /**
   * Teaching online with one screen: the slides move to a window of their own
   * for the video call to share, and this window becomes the presenter view.
   */
  async function moveToOwnWindow() {
    if (mode !== "local") return;
    startRef.current = stateRef.current.index;
    setMode("starting");
    try {
      channel.current = await screens.openAudience({ windowed: true });
      setOnline(true);
      setMode("remote");
      await persistence.setFullscreen(false);
      await maximize();
    } catch (e) {
      console.error("Could not open the slide-show window", e);
      setMode("local");
    }
  }

  // Single screen: the runtime runs here.
  useEffect(() => {
    const el = host.current;
    if (mode !== "local" || !el) return;
    let cancelled = false;
    el.innerHTML = renderDeck(doc, env);
    void (async () => {
      await loadRuntime();
      if (cancelled) return;
      const deck = el.querySelector(".ls-deck");
      controller.current =
        (deck &&
          window.LessonStudio?.mount(deck, {
            start: startRef.current,
            onState: setState,
            onExit: end,
            toggleFullscreen: () => void persistence.isFullscreen().then((on) => persistence.setFullscreen(!on)),
          })) ??
        null;
      if (!controller.current) end();
    })();
    return () => {
      cancelled = true;
      controller.current?.destroy();
      controller.current = null;
      el.innerHTML = "";
    };
  }, [mode]);

  // Second screen: the slide show there reports back; this window sends it the teacher's keys.
  useEffect(() => {
    const link = channel.current;
    if (mode !== "remote" || !link) return;
    const stop = link.listen((raw) => {
      const m = raw as ToPresenter;
      if (m.type === "ready") link.send({ type: "show", doc, dir, start: startRef.current } satisfies ToAudience);
      else if (m.type === "state") {
        setState(m.state);
        setMirror(m.html);
      } else if (m.type === "ink") {
        const e = m.ink;
        if (e.type === "pen") setInk((i) => ({ ...i, pen: e.on, color: e.color }));
        else if (e.type === "stroke") setInk((i) => ({ ...i, strokes: [...i.strokes, e.stroke] }));
        else setInk((i) => ({ ...i, strokes: [] }));
      } else if (m.type === "exit") end();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (/^(Shift|Control|Alt|Meta|F5)$/.test(e.key)) return;
      e.preventDefault();
      // Esc goes to the slide show too: it first closes an open tool there, and
      // ends the show otherwise. Before the show answers, it just ends.
      if (e.key === "Escape" && !mirrorRef.current) end();
      else if (e.key === "g" || e.key === "G") setGrid(true);
      else link.send({ type: "key", key: e.key, code: e.code, shiftKey: e.shiftKey } satisfies ToAudience);
    };
    window.addEventListener("keydown", onKey);
    // The page may have loaded before this listener; ask again.
    link.send({ type: "show", doc, dir, start: startRef.current } satisfies ToAudience);
    return () => {
      stop();
      window.removeEventListener("keydown", onKey);
    };
  }, [mode]);

  // G opens the slide grid on a single screen too (the runtime leaves the key alone).
  useEffect(() => {
    if (mode !== "local") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "g" || e.key === "G") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setGrid(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode]);

  const driver: PresentDriver = useMemo(() => {
    if (mode === "remote") {
      const send = (m: ToAudience) => channel.current?.send(m);
      return {
        next: () => send({ type: "key", key: "ArrowRight", code: "ArrowRight", shiftKey: false }),
        prev: () => send({ type: "key", key: "ArrowLeft", code: "ArrowLeft", shiftKey: false }),
        go: (index) => send({ type: "go", index }),
        key: (key, code = `Key${key.toUpperCase()}`) => send({ type: "key", key, code, shiftKey: false }),
        blank: (mode) => send({ type: "blank", mode }),
      };
    }
    return {
      next: () => controller.current?.next(),
      prev: () => controller.current?.prev(),
      go: (index) => controller.current?.go(index),
      key: (key, code = `Key${key.toUpperCase()}`) =>
        document.dispatchEvent(new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true })),
      blank: (mode) => controller.current?.blank(mode),
    };
  }, [mode]);

  // Ink belongs to one slide; the slide show wipes its own when the slide changes.
  useEffect(() => setInk((i) => (i.strokes.length ? { ...i, strokes: [] } : i)), [state.index]);

  function inkOnCopy(stroke: InkStroke) {
    setInk((i) => ({ ...i, strokes: [...i.strokes, stroke] }));
    channel.current?.send({ type: "ink", stroke } satisfies ToAudience);
  }

  /** A click on the copy of the slide is replayed on the projector (game cells, cards, sound buttons). */
  function onMirrorClick(e: React.MouseEvent) {
    if (ink.pen) return;
    const slide = (e.currentTarget as HTMLElement).querySelector(".ls-slide");
    const target = e.target as Element;
    const path = slide && slide.contains(target) ? elementPath(slide, target) : null;
    if (path) channel.current?.send({ type: "click", path } satisfies ToAudience);
    else driver.next();
  }

  const presenter = mode === "remote" || (mode === "local" && localView === "presenter");

  return (
    <div className={`present-root${presenter ? " presenter" : ""}`}>
      {presenter && (
        <PresenterView
          doc={doc}
          env={env}
          state={state}
          driver={driver}
          onShowAll={() => setGrid(true)}
          onEnd={end}
          onHide={mode === "local" ? () => setLocalView("show") : undefined}
          onOwnWindow={mode === "local" ? () => void moveToOwnWindow() : undefined}
          online={online}
          pen={
            mode === "remote"
              ? { on: ink.pen, color: ink.color, setColor: (color) => channel.current?.send({ type: "pen-color", color } satisfies ToAudience) }
              : undefined
          }
        />
      )}
      {mode === "remote" && (
        <div className="present-stage present-mirror" onClick={onMirrorClick} title="Bấm vào slide như bấm trên màn chiếu">
          {mirror ? <StaticDeck doc={doc} env={env} html={mirror} presenting /> : <p className="present-waiting">Đang mở màn hình trình chiếu…</p>}
          <InkOverlay strokes={ink.strokes} pen={ink.pen} color={ink.color} onStroke={inkOnCopy} />
          {state.blank && <span className="present-blank-badge">Màn chiếu đang {state.blank === "black" ? "đen" : "trắng"}</span>}
        </div>
      )}
      <div ref={host} className={presenter ? "present-host present-stage" : "present-host"} />
      {mode === "local" && localView === "show" && (
        <ShowToolbar
          driver={driver}
          blank={state.blank}
          onShowAll={() => setGrid(true)}
          onPresenterView={() => setLocalView("presenter")}
          onOwnWindow={() => void moveToOwnWindow()}
          onEnd={end}
        />
      )}
      {grid && (
        <SlideGrid
          doc={doc}
          env={env}
          current={state.index}
          onPick={(i) => {
            setGrid(false);
            driver.go(i);
          }}
          onClose={() => setGrid(false)}
        />
      )}
    </div>
  );
}
