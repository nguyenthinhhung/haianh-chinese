// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { LessonDocument } from "../../core/schema";
import { createFromSample } from "../../samples";
import { testEnv } from "../../test/env";
import { lessonRuntime, renderDeck } from "../render";
import type { MountOptions, PresentController, PresentState } from "./load";

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
function present(slides: { type: string; content?: unknown }[], start = 0, options: MountOptions = {}): Controller {
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
  controller = window.LessonStudio!.mount(host.querySelector(".ls-deck")!, { ...options, start }) as Controller;
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

  it("reports every move and step to a presenter view", () => {
    const states: PresentState[] = [];
    present([{ type: "matching" }, { type: "cover" }], 0, { onState: (s) => states.push(s) });
    press("ArrowRight");
    press("End");
    expect(states[0]).toEqual({ index: 0, step: 0, steps: 4, blank: null });
    expect(states).toContainEqual({ index: 0, step: 1, steps: 4, blank: null });
    expect(states.at(-1)).toEqual({ index: 1, step: 0, steps: 0, blank: null });
  });
});

describe("listening", () => {
  it("shows each answer in turn, then the script, then moves on", () => {
    present([
      {
        type: "listening",
        content: {
          heading: "Nghe",
          script: "A：你去哪儿？\nB：我去商店。",
          scriptPinyin: "",
          scriptMeaning: "",
          questions: [
            { question: "A 问什么？", answer: "去哪儿" },
            { question: "B 去哪儿？", answer: "商店" },
          ],
          showScript: true,
        },
      },
      { type: "cover" },
    ]);
    const script = () => current().querySelector(".ls-ln-script")!;
    press("ArrowRight");
    press("ArrowRight");
    expect(current().querySelectorAll(".ls-ln-answer.ls-revealed")).toHaveLength(2);
    expect(script().classList.contains("ls-revealed")).toBe(false);
    press("ArrowRight");
    expect(script().classList.contains("ls-revealed")).toBe(true);
    expect(script().querySelectorAll(".ls-ln-line")).toHaveLength(2);
    press("ArrowRight");
    expect(current().dataset.slideType).toBe("cover");
  });
});

describe("HSK 3–4 slides", () => {
  it("a passage shows its pinyin, then its translation, each in place of the one before", () => {
    present([{ type: "passage" }, { type: "cover" }]);
    const shown = () => [...current().querySelectorAll(".ls-ps-view.ls-revealed")].map((v) => v.className.match(/--(\w+)/)![1]);
    press("ArrowRight");
    expect(shown()).toEqual(["pinyin"]);
    press("ArrowRight");
    expect(shown()).toEqual(["pinyin", "meaning"]);
    press("ArrowRight");
    expect(current().dataset.slideType).toBe("cover");
  });

  it("a comparison reveals each difference, then the answer of each sentence", () => {
    present([{ type: "compare" }]);
    const defaults = env.templates.require("compare").defaults() as { differences: unknown[]; checks: unknown[] };
    press("a");
    expect(current().querySelectorAll(".ls-cmp-diff.ls-revealed")).toHaveLength(defaults.differences.length);
    // Each sentence's row reveals a mark under both words in one step.
    expect(current().querySelectorAll(".ls-cmp-cell .ls-revealed")).toHaveLength(defaults.checks.length * 2);
  });
});

describe("blank screen", () => {
  it("B blacks the screen; the next key only brings the slide back", () => {
    const vocab = env.templates.require("vocabulary").defaults() as { hideMeaning: boolean };
    const states: PresentState[] = [];
    present([{ type: "vocabulary", content: { ...vocab, hideMeaning: true } }], 0, { onState: (s) => states.push(s) });
    const blank = () => host.querySelector<HTMLElement>(".ls-blank")!;
    press("b");
    expect(blank().hidden).toBe(false);
    expect(blank().dataset.mode).toBe("black");
    expect(states.at(-1)!.blank).toBe("black");
    press("ArrowRight");
    expect(blank().hidden).toBe(true);
    expect(revealed()).toBe(0);
    press("w");
    expect(blank().dataset.mode).toBe("white");
    blank().click();
    expect(blank().hidden).toBe(true);
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

const cards = (selector: string) => [...current().querySelectorAll<HTMLElement>(selector)];
const typeNumber = (n: number) => {
  for (const d of String(n)) press(d, { code: `Digit${d}` });
  press("Enter");
};

describe("games", () => {
  it("what's missing: a card vanishes, then comes back, for each round", () => {
    present([{ type: "whats-missing" }, { type: "cover" }]);
    press("ArrowRight");
    expect(cards(".ls-wm-gone")).toHaveLength(1);
    press("ArrowRight");
    expect(cards(".ls-wm-gone")).toHaveLength(0);
    expect(cards(".ls-wm-back")).toHaveLength(1);
    for (let i = 0; i < 4; i++) press("ArrowRight");
    expect(current().dataset.slideType).toBe("whats-missing");
    press("ArrowRight");
    expect(current().dataset.slideType).toBe("cover");
  });

  it("guess the picture (tiles): numbers open tiles, Next opens the rest, then the answer", () => {
    present([{ type: "guess-picture" }, { type: "cover" }]);
    typeNumber(5);
    expect(cards(".ls-gp-open").map((t) => t.dataset.n)).toEqual(["5"]);
    for (let i = 0; i < 8; i++) press("ArrowRight");
    expect(cards(".ls-gp-open")).toHaveLength(9);
    expect(current().querySelector(".ls-gp-answer")!.classList.contains("ls-revealed")).toBe(false);
    press("ArrowRight");
    expect(current().querySelector(".ls-gp-answer")!.classList.contains("ls-revealed")).toBe(true);
    press("ArrowLeft");
    expect(current().querySelector(".ls-gp-answer")!.classList.contains("ls-revealed")).toBe(false);
  });

  it("guess the picture (zoom): each Next zooms out, the last shows the answer", () => {
    const content = { ...(env.templates.require("guess-picture").defaults() as object), mode: "zoom" };
    present([{ type: "guess-picture", content }]);
    // Without an asset there is no <img>; the steps and the answer still run.
    for (let i = 0; i < 4; i++) press("ArrowRight");
    expect(current().querySelector(".ls-gp-answer")!.classList.contains("ls-revealed")).toBe(true);
  });

  it("secret boxes: the reward goes to the team whose turn it is, then the turn passes", () => {
    const c = present([{ type: "box-pick" }]);
    expect(host.querySelector<HTMLElement>(".ls-score")!.hidden).toBe(false);
    typeNumber(1); // +1
    expect(current().querySelector<HTMLElement>(".ls-bp-panel")!.hidden).toBe(false);
    press("ArrowRight");
    expect(c.tools!.scores()).toEqual([1, 0]);
    expect(c.tools!.current()).toBe(1);
    press("ArrowRight");
    expect(current().querySelector<HTMLElement>(".ls-bp-panel")!.hidden).toBe(true);
    expect(cards(".ls-bp-opened")).toHaveLength(1);
    typeNumber(4); // +3 for team 2
    press("ArrowRight");
    press("ArrowRight");
    expect(c.tools!.scores()).toEqual([1, 3]);
    typeNumber(5); // bomb for team 1
    press("ArrowRight");
    expect(c.tools!.scores()).toEqual([0, 3]);
  });

  it("lucky wheel: each Next spins to a segment not picked before", () => {
    vi.useFakeTimers();
    try {
      present([{ type: "lucky-wheel" }, { type: "cover" }]);
      const hits = new Set<string>();
      for (let i = 0; i < 6; i++) {
        press("ArrowRight");
        press("ArrowRight"); // ignored while spinning
        vi.advanceTimersByTime(4500);
        hits.add(current().querySelector(".ls-lw-result")!.textContent!);
      }
      expect(hits.size).toBe(6);
      expect(cards(".ls-lw-picked")).toHaveLength(5);
      press("ArrowRight");
      expect(current().dataset.slideType).toBe("cover");
    } finally {
      vi.useRealTimers();
    }
  });

  it("questions: each Next shows the next answer, then moves on", () => {
    present([{ type: "qa-list" }, { type: "cover" }]); // two questions
    const shown = () => cards(".ls-qa-answer.ls-revealed").length;
    expect(shown()).toBe(0);
    press("ArrowRight");
    expect(shown()).toBe(1);
    press("ArrowRight");
    expect(shown()).toBe(2);
    press("ArrowRight");
    expect(current().dataset.slideType).toBe("cover");
  });

  it("flashcards: any card flips by click or number; Next flips the rest, Back undoes in order", () => {
    present([{ type: "flashcard" }, { type: "cover" }]); // three cards
    const flipped = () => cards(".ls-fc-card.ls-revealed").map((c) => cards(".ls-fc-card").indexOf(c) + 1);
    cards(".ls-fc-card")[2]!.click();
    expect(flipped()).toEqual([3]);
    expect(current().dataset.slideType).toBe("flashcard"); // the click did not move on
    typeNumber(2);
    expect(flipped()).toEqual([2, 3]);
    press("ArrowRight");
    expect(flipped()).toEqual([1, 2, 3]);
    press("ArrowLeft");
    expect(flipped()).toEqual([2, 3]);
    cards(".ls-fc-card")[1]!.click(); // flips it back
    expect(flipped()).toEqual([3]);
    press("ArrowRight");
    press("ArrowRight");
    expect(current().dataset.slideType).toBe("flashcard");
    press("ArrowRight");
    expect(current().dataset.slideType).toBe("cover");
  });

  it("memory: a matching pair stays open and scores; a miss passes the turn", () => {
    const c = present([{ type: "memory" }]);
    const all = cards(".ls-mm-card");
    const first = all[0]!;
    const twin = all.find((x) => x !== first && x.dataset.pair === first.dataset.pair)!;
    const other = all.find((x) => x.dataset.pair !== first.dataset.pair)!;

    typeNumber(Number(first.dataset.n));
    typeNumber(Number(other.dataset.n));
    expect(cards(".ls-mm-miss")).toHaveLength(2);
    expect(c.tools!.current()).toBe(1);
    press("ArrowRight"); // turns the miss back over
    expect(cards(".ls-mm-up")).toHaveLength(0);

    typeNumber(Number(first.dataset.n));
    typeNumber(Number(twin.dataset.n));
    expect(cards(".ls-mm-matched")).toHaveLength(2);
    expect(c.tools!.scores()).toEqual([0, 1]);
    expect(c.tools!.current()).toBe(1);
  });
});
