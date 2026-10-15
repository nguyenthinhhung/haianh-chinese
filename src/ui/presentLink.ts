import type { LessonDocument } from "../core/schema";
import type { BlankMode, PresentState } from "../renderer/runtime/load";

/**
 * Messages between the presenter view (laptop) and the slide show on the
 * second display. The slide show runs the real runtime, so sounds, games and
 * random picks happen once, on the screen the class sees; the presenter view
 * sends it keys and clicks and shows a copy of its current slide.
 */
export type ToAudience =
  | { type: "show"; doc: LessonDocument; dir: string; start: number }
  | { type: "key"; key: string; code: string; shiftKey: boolean }
  | { type: "go"; index: number }
  | { type: "click"; path: number[] }
  | { type: "blank"; mode: BlankMode | null }
  | { type: "end" };

export type ToPresenter =
  | { type: "ready" }
  /** `html` is the current slide as the class sees it, for the presenter's copy. */
  | { type: "state"; state: PresentState; html: string }
  | { type: "exit" };

/** Position of `el` under `root` as child indexes, so a click can be replayed on the other screen. */
export function elementPath(root: Element, el: Element): number[] | null {
  const path: number[] = [];
  let node: Element | null = el;
  while (node && node !== root) {
    const parent: Element | null = node.parentElement;
    if (!parent) return null;
    path.unshift(Array.prototype.indexOf.call(parent.children, node));
    node = parent;
  }
  return node === root ? path : null;
}

export function elementAt(root: Element, path: number[]): Element | null {
  let node: Element | null = root;
  for (const i of path) node = node?.children[i] ?? null;
  return node;
}

/** The current slide's markup without passing effects, for the presenter's copy. */
export function slideSnapshot(slide: Element): string {
  const copy = slide.cloneNode(true) as Element;
  copy.querySelectorAll(".ls-confetti").forEach((n) => n.remove());
  return copy.outerHTML;
}
