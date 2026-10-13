import { describe, expect, it } from "vitest";
import { migrate } from "./migration";

describe("migrate", () => {
  it("passes a current document through unchanged", () => {
    const raw = { schemaVersion: 1, title: "x" };
    expect(migrate(raw)).toEqual({ ok: true, raw, fromVersion: 1 });
  });

  it("runs the chain one version at a time", () => {
    const chain = {
      1: (r: Record<string, unknown>) => ({ ...r, renamed: r.old, old: undefined }),
      2: (r: Record<string, unknown>) => ({ ...r, added: true }),
    };
    expect(migrate({ schemaVersion: 1, old: "v" }, chain, 3)).toEqual({
      ok: true,
      fromVersion: 1,
      raw: { schemaVersion: 3, renamed: "v", old: undefined, added: true },
    });
  });

  it("refuses newer versions and never downgrades", () => {
    expect(migrate({ schemaVersion: 2 }, {}, 1)).toMatchObject({ ok: false, code: "too-new", fromVersion: 2 });
  });

  it("refuses missing or malformed versions", () => {
    for (const raw of [{}, { schemaVersion: "1" }, { schemaVersion: 0 }, { schemaVersion: 1.5 }, [], null]) {
      expect(migrate(raw)).toMatchObject({ ok: false, code: "missing-version" });
    }
  });

  it("reports a gap in the chain", () => {
    expect(migrate({ schemaVersion: 1 }, {}, 2)).toMatchObject({ ok: false, code: "no-path" });
  });
});
