// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { LessonDocument } from "../../core/schema";
import { createFromSample } from "../../samples";
import { testEnv } from "../../test/env";
import { lessonRuntime, renderDeck } from "../render";
import type { PresentController } from "./load";

const env = testEnv();

interface Controller extends PresentController {
  revealAll(): void;
  reset(): void;
  tools: { scores(): number[]; current(): number } | null;
}

let controller: Controller | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  // The runtime of a lesson using every template: core, tools and all interactions.
  const all: LessonDocument = {
    ...createFromSample("blank", "x", "0"),
    slides: env.templates.list().map((t, i) => ({ id: `s_all${i}0000`, type: t.type, content: t.defaults() })),
  };
  new Function(lessonRuntime(all, env))();
});

afterEach(() => {
  controller?.destroy();
  controller = null;
  host?.remove();
});

/** Renders a lesson with the given slides and presents it, as Present does. */
function present(slides: { type: string; content?: unknown }[], start = 0): Controller {
  const doc: LessonDocument = {
    ...createFromSample("blank", "Test", "0.0.0"),
    slides: slides.map((s, i) => ({
      id: `s_test${i}0000`,
      type: s.type,
      content: s.content ?? env.templates.require(s.type).defaults(),
    })),
  };
  // Not a direct child of <body>, so the lesson-file autostart never picks it up.
  host = document.createElement("div");
  document.body.appendChild(host);
  host.innerHTML = renderDeck(doc, env);
  controller = window.LessonStudio!.mount(host.querySelector(".ls-deck")!, { start }) as Controller;
  return controller;
}

function press(key: string, opts: { code?: string; shiftKey?: boolean } = {}): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));
}

const current = () => host.querySelector(".ls-slide.ls-current") as HTMLElement;
const revealed = () => current().querySelectorAll(".ls-revealed").length;

describe("steps", () => {
  it("reveals hidden meanings one per Next, then moves on", () => {
    const vocab = env.templates.require("vocabulary").defaults() as { hideMeaning: boolean };
    present([{ type: "vocabulary", content: { ...vocab, hideMeaning: true } }, { type: "cover" }]);
    press("ArrowRight");
    press("ArrowRight");
    expect(revealed()).toBe(2);
    press("ArrowRight");
    expect(current().dataset.slideType).toBe("cover");
    press("ArrowLeft");
    expect(current().dataset.slideType).toBe("vocabulary");
    expect(revealed()).toBe(0);
  });

  it("orders numbered steps by number, not by position", () => {
    present([{ type: "sentence-order" }]);
    press("ArrowRight");
    const placed = [...current().querySelectorAll(".ls-so-answer .ls-revealed")];
    expect(placed).toHaveLength(1);
    // The first step fills the first slot, wherever its card sits in the pool.
    expect(current().querySelector(".ls-so-slot .ls-so-placed")!.classList.contains("ls-revealed")).toBe(true);
  });

  it("A reveals everything and R starts the slide again", () => {
    present([{ type: "matching" }]);
    press("a");
    expect(revealed()).toBe(8);
    press("r");
    expect(revealed()).toBe(0);
  });
});

describe("classroom tools", () => {
  it("number keys score for teams and Shift subtracts", () => {
    const c = present([{ type: "cover" }]);
    press("1", { code: "Digit1" });
    press("1", { code: "Digit1" });
    press("3", { code: "Digit3" });
    press("!", { code: "Digit1", shiftKey: true });
    expect(c.tools!.scores()).toEqual([1, 0, 1]);
    expect(host.querySelector<HTMLElement>(".ls-score")!.hidden).toBe(false);
  });

  it("T starts the timer and N picks a student number", () => {
    present([{ type: "cover" }]);
    press("t");
    expect(host.querySelector<HTMLElement>(".ls-timer")!.hidden).toBe(false);
    expect(host.querySelector(".ls-timer")!.classList.contains("ls-timer-running")).toBe(true);
    press("n");
    expect(host.querySelector<HTMLElement>(".ls-picker")!.hidden).toBe(false);
    press("Escape");
    expect(host.querySelector<HTMLElement>(".ls-picker")!.hidden).toBe(true);
  });

  it("H shows the shortcut list", () => {
    present([{ type: "cover" }]);
    press("h");
    expect(host.querySelector<HTMLElement>(".ls-help")!.hidden).toBe(false);
  });
});

