import { describe, expect, it } from "vitest";
import { createFromSample } from "../samples";
import { setTitle } from "./document";
import { COALESCE_MS, HISTORY_LIMIT, canRedo, canUndo, createHistory, record, redo, replacePresent, undo } from "./history";

const base = () => createFromSample("fruits", "Hoa quả", "0.0.0");

describe("history", () => {
  it("undoes and redoes steps in order", () => {
    const a = base();
    const b = setTitle(a, "B");
    const c = setTitle(b, "C");
    let h = record(record(createHistory(a), b), c);

    h = undo(h);
    expect(h.present).toBe(b);
    h = undo(h);
    expect(h.present).toBe(a);
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h);

    h = redo(redo(h));
    expect(h.present).toBe(c);
    expect(canRedo(h)).toBe(false);
  });

  it("drops the redo branch on a new edit", () => {
    const a = base();
    let h = record(createHistory(a), setTitle(a, "B"));
    h = record(undo(h), setTitle(a, "X"));
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe(a);
  });

  it("ignores commands that change nothing", () => {
    const h = createHistory(base());
    expect(record(h, h.present)).toBe(h);
  });

  it("merges a run of edits with the same key into one step", () => {
    const a = base();
    let h = createHistory(a);
    h = record(h, setTitle(a, "H"), "title", 0);
    h = record(h, setTitle(a, "Ho"), "title", 300);
    h = record(h, setTitle(a, "Hoa"), "title", 600);
    expect(h.past).toHaveLength(1);
    expect(undo(h).present).toBe(a);
  });

  it("starts a new step after a pause, a different key or an undo", () => {
    const a = base();
    let h = record(createHistory(a), setTitle(a, "1"), "title", 0);
    h = record(h, setTitle(a, "2"), "title", COALESCE_MS + 1);
    expect(h.past).toHaveLength(2);
    h = record(h, setTitle(a, "3"), "notes", COALESCE_MS + 2);
    expect(h.past).toHaveLength(3);
    h = record(undo(h), setTitle(a, "4"), "notes", COALESCE_MS + 3);
    expect(h.past).toHaveLength(3);
  });

  it("does not merge into a step across a replaced snapshot", () => {
    const a = base();
    let h = record(createHistory(a), setTitle(a, "1"), "title", 0);
    h = replacePresent(h, setTitle(a, "1 (saved)"));
    h = record(h, setTitle(a, "12"), "title", 10);
    expect(h.past).toHaveLength(2);
  });

  it("keeps at most HISTORY_LIMIT steps", () => {
    let h = createHistory(base());
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = record(h, setTitle(h.present, `t${i}`));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
