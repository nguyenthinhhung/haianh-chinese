import { describe, expect, it } from "vitest";
import { testEnv } from "../test/env";
import { AGE_PROFILES, ageRangeLabel } from "./ages";
import {
  activityChoices,
  applyPreset,
  BLUEPRINTS,
  checkAgainstRequest,
  DEFAULT_REQUEST,
  DURATIONS,
  lessonKindsFor,
  normalizeRequest,
  parseWordList,
  planOutline,
  planSlideCount,
  presetOf,
  resolvePlan,
  type LessonRequest,
} from "./lessonPlan";
import type { Slide } from "./schema";

const { templates, themes } = testEnv();

const request = (over: Partial<LessonRequest> = {}): LessonRequest => ({ ...DEFAULT_REQUEST, topic: "Con vật", ...over });

describe("blueprints", () => {
  it("only name slide types the app has", () => {
    for (const b of BLUEPRINTS) for (const s of b.steps) for (const t of s.types) expect(templates.get(t), t).toBeDefined();
    for (const a of AGE_PROFILES) for (const t of a.avoid) expect(templates.get(t), t).toBeDefined();
  });

  it("suggest a theme that exists for every age", () => {
    for (const a of AGE_PROFILES) expect(themes.resolve(a.theme).id).toBe(a.theme);
  });

  it("start with a cover, end with a summary and grow with the lesson length", () => {
    for (const a of AGE_PROFILES) {
      // Word focus is only ever inserted into a lesson.
      for (const b of lessonKindsFor(a.id).filter((k) => k.id !== "word-focus")) {
        const counts = DURATIONS.map((d) => {
          const plan = resolvePlan(request({ age: a.id, kind: b.id, duration: d.id }));
          expect(plan[0]!.types).toEqual(["cover"]);
          expect(plan[plan.length - 1]!.types).toEqual(["summary"]);
          return planSlideCount(plan);
        });
        expect(counts[0]).toBeLessThan(counts[2]!);
      }
    }
  });

  it("leave out the cover and summary when slides are inserted into a lesson", () => {
    for (const b of BLUEPRINTS) {
      const types = resolvePlan(request({ kind: b.id }), true).flatMap((s) => s.types);
      expect(types).not.toContain("cover");
      expect(types).not.toContain("summary");
      expect(types.length).toBeGreaterThan(0);
    }
  });

  it("teach chosen words in depth: explained one by one, then practised and talked about", () => {
    const plan = resolvePlan(request({ kind: "word-focus", age: "secondary" }), true);
    expect(plan[0]!.types).toEqual(["picture-card"]);
    expect(plan.flatMap((s) => s.types)).toContain("grammar");
    expect(plan.flatMap((s) => s.types)).toContain("qa-list");
  });
});

describe("lesson length and adults", () => {
  it("a double lesson has more slides than a long one but still one cover and one summary", () => {
    const long = resolvePlan(request({ kind: "hsk1", age: "secondary", duration: "long" }));
    const double = resolvePlan(request({ kind: "hsk1", age: "secondary", duration: "double" }));
    expect(planSlideCount(double)).toBeGreaterThan(planSlideCount(long));
    expect(double.filter((s) => s.types.includes("cover")).map((s) => s.count)).toEqual([1]);
    expect(double.filter((s) => s.types.includes("summary")).map((s) => s.count)).toEqual([1]);
  });

  it("adults get no game unless the teacher asks for one", () => {
    const steps = planOutline(request({ kind: "hsk1", age: "adult" }));
    const game = steps.find((s) => s.types.includes("box-pick"))!;
    expect(game.count).toBe(0);
    expect(game.types).not.toContain("whats-missing");
    const picked = planOutline(request({ kind: "hsk1", age: "adult", activities: ["lucky-wheel", "qa-list"] }));
    expect(picked.find((s) => s.types.includes("lucky-wheel"))!.count).toBeGreaterThan(0);
  });

  it("each HSK level keeps its book's order of parts", () => {
    const parts = {
      hsk1: ["热身", "课文", "生词", "注释", "练习", "语音", "运用"],
      hsk2: ["热身", "课文", "生词", "注释", "练习", "语音", "运用"],
      hsk3: ["热身", "课文", "生词", "注释", "练一练", "练习", "汉字", "运用"],
      hsk4: ["热身", "课文 1–3", "注释 1–3", "练一练", "根据课文", "课文 4–5", "比一比", "练习", "扩展", "运用"],
    } as const;
    for (const [kind, order] of Object.entries(parts)) {
      const roles = planOutline(request({ kind: kind as keyof typeof parts, age: "adult", duration: "long" })).map((s) => s.role);
      const at = order.map((part) => roles.findIndex((r) => r.includes(part)));
      expect(at.every((i) => i >= 0), kind).toBe(true);
      expect([...at].sort((x, y) => x - y), kind).toEqual(at);
    }
  });

  it("uses the long-text slides from HSK 3 on", () => {
    const types = (kind: "hsk2" | "hsk3" | "hsk4") => resolvePlan(request({ kind, age: "adult", duration: "long" })).flatMap((s) => s.types);
    expect(types("hsk2")).not.toContain("passage");
    expect(types("hsk3")).toContain("sentence-practice");
    expect(types("hsk4")).toEqual(expect.arrayContaining(["passage", "sentence-practice", "compare"]));
  });

  it("reads the old textbook kind as HSK 1", () => {
    expect(normalizeRequest({ ...DEFAULT_REQUEST, kind: "textbook" }).kind).toBe("hsk1");
  });
});

describe("ages", () => {
  it("leave out slide types too hard for the age", () => {
    const plan = resolvePlan(request({ age: "preschool", kind: "vocabulary" }));
    const types = plan.flatMap((s) => s.types);
    expect(types).not.toContain("fill-blank");
    expect(types).not.toContain("sentence-order");
    expect(types).toContain("whats-missing");
  });

  it("hide lesson kinds that rely on such types", () => {
    expect(lessonKindsFor("preschool").map((b) => b.id)).not.toContain("grammar");
    expect(lessonKindsFor("secondary").map((b) => b.id)).toEqual(BLUEPRINTS.map((b) => b.id));
  });

  it("describe a theme's age range", () => {
    expect(ageRangeLabel(["preschool", "lower-primary"])).toBe("3–8 tuổi");
    expect(ageRangeLabel(["upper-primary", "secondary"])).toBe("9+ tuổi");
    expect(ageRangeLabel(["secondary"])).toBe("12+ tuổi");
    expect(ageRangeLabel([])).toBe("");
  });
});

describe("resolvePlan", () => {
  it("narrows activity steps to the activities the teacher picked", () => {
    const plan = resolvePlan(request({ activities: ["quiz", "memory"] }));
    expect(plan.find((s) => s.role === "Luyện tập")!.types).toEqual(["quiz"]);
    expect(plan.find((s) => s.role === "Trò chơi cả lớp")!.types).toEqual(["memory"]);
  });

  it("keeps the lesson length when a step has none of the picked activities", () => {
    const all = planSlideCount(resolvePlan(request()));
    const gamesOnly = resolvePlan(request({ activities: ["box-pick"] }));
    expect(gamesOnly.some((s) => s.role === "Luyện tập")).toBe(false);
    expect(planSlideCount(gamesOnly)).toBe(all);
    const practiceOnly = resolvePlan(request({ activities: ["quiz"] }));
    expect(practiceOnly.some((s) => s.role === "Trò chơi cả lớp")).toBe(false);
    expect(planSlideCount(practiceOnly)).toBe(all);
  });

  it("offers activities that suit the age", () => {
    expect(activityChoices("vocabulary", "preschool")).not.toContain("fill-blank");
    expect(activityChoices("vocabulary", "secondary")).toContain("fill-blank");
  });
});

describe("planOutline", () => {
  it("applies the teacher's counts within each step's limits and drops steps set to 0", () => {
    const base = planOutline(request());
    expect(base.every((s) => s.count === s.suggested)).toBe(true);
    const outline = { "Trò chơi cả lớp": 0, "Luyện tập": 4, "Mở đầu: tên bài": 0 };
    const steps = planOutline(request({ outline }));
    expect(steps.find((s) => s.role === "Trò chơi cả lớp")!.count).toBe(0);
    expect(steps.find((s) => s.role === "Luyện tập")!.count).toBe(4);
    // The cover is a step the lesson relies on: it keeps one slide.
    expect(steps.find((s) => s.role === "Mở đầu: tên bài")!.count).toBe(1);
    const plan = resolvePlan(request({ outline }));
    expect(plan.some((s) => s.role === "Trò chơi cả lớp")).toBe(false);
    // The two game slides moved to practice: same length as suggested.
    expect(planSlideCount(plan)).toBe(planSlideCount(resolvePlan(request())));
  });

  it("lists optional steps at 0 so the teacher can add them", () => {
    const short = planOutline(request({ duration: "short" }));
    const step = short.find((s) => s.role === "Dùng từ mới trong câu ngắn")!;
    expect([step.count, step.min]).toEqual([0, 0]);
    expect(resolvePlan(request({ duration: "short" })).some((s) => s.role === step.role)).toBe(false);
    const added = resolvePlan(request({ duration: "short", outline: { [step.role]: 1 } }));
    expect(added.some((s) => s.role === step.role)).toBe(true);
  });

  it("measures the length warning against the edited outline", () => {
    const slides = Array.from({ length: 4 }, (_, i): Slide => ({ id: `s_${i}`, type: "cover", content: { title: "动物" } }));
    const outline = Object.fromEntries(planOutline(request({ duration: "short" })).map((s) => [s.role, s.min]));
    expect(planSlideCount(resolvePlan(request({ duration: "short", outline })))).toBeLessThanOrEqual(6);
    expect(checkAgainstRequest(slides, request({ duration: "short", outline }), templates).some((w) => w.startsWith("Bài có"))).toBe(false);
  });
});

describe("presets", () => {
  it("keep the way of teaching and leave the lesson's content alone", () => {
    const source = request({ age: "preschool", duration: "short", notes: "Câu ngắn", outline: { "Luyện tập": 2 }, words: "猫", topic: "Con vật" });
    const preset = presetOf("  Mầm non 20 phút ", source);
    expect(preset.name).toBe("Mầm non 20 phút");
    expect(preset.settings).not.toHaveProperty("topic");
    expect(preset.settings).not.toHaveProperty("words");
    const applied = applyPreset(request({ topic: "Hoa quả", words: "苹果" }), preset);
    expect(applied).toMatchObject({ topic: "Hoa quả", words: "苹果", age: "preschool", duration: "short", notes: "Câu ngắn", outline: { "Luyện tập": 2 } });
  });
});

describe("normalizeRequest", () => {
  it("keeps a valid outline and drops counts it cannot use", () => {
    const r = normalizeRequest({ ...DEFAULT_REQUEST, outline: { "Luyện tập": 3, "Trò chơi cả lớp": -1, x: 2.5, y: "4" } });
    expect(r.outline).toEqual({ "Luyện tập": 3 });
  });

  it("reads a request saved before known, exclude and outline existed", () => {
    const { known: _k, exclude: _e, outline: _o, ...old } = DEFAULT_REQUEST;
    expect(normalizeRequest({ ...old, topic: "Con vật" })).toEqual({ ...DEFAULT_REQUEST, topic: "Con vật" });
  });

  it("falls back to defaults for anything unusable", () => {
    expect(normalizeRequest(null)).toEqual(DEFAULT_REQUEST);
    expect(normalizeRequest({ age: "elderly", kind: "x", duration: 5, activities: "quiz", topic: 3 })).toEqual(DEFAULT_REQUEST);
  });

  it("swaps a kind the age cannot use and drops activities the plan does not offer", () => {
    const r = normalizeRequest({ ...DEFAULT_REQUEST, age: "preschool", kind: "grammar", activities: ["fill-blank", "memory"] });
    // Falls back to the default kind, which every age can use.
    expect(r.kind).toBe(DEFAULT_REQUEST.kind);
    expect(lessonKindsFor("preschool").map((k) => k.id)).toContain(r.kind);
    expect(r.activities).toEqual(["memory"]);
  });
});

describe("parseWordList", () => {
  it("splits on commas, enumeration marks and new lines", () => {
    expect(parseWordList("猫, 狗、兔子\n\n熊猫；猫")).toEqual(["猫", "狗", "兔子", "熊猫"]);
  });
});

describe("checkAgainstRequest", () => {
  const slide = (type: string, content: unknown): Slide => ({ id: "s_1", type, content });

  it("names required Chinese words the lesson never uses", () => {
    const slides = [slide("vocabulary", { words: [{ hanzi: "猫", pinyin: "māo", meaning: "con mèo" }] })];
    const warnings = checkAgainstRequest(slides, request({ words: "猫, 狗, con thỏ", duration: "short" }), templates);
    expect(warnings).toContain("Thiếu từ bắt buộc: 狗.");
  });

  it("names excluded Chinese words the lesson still uses", () => {
    const slides = [slide("vocabulary", { words: [{ hanzi: "狗", pinyin: "gǒu", meaning: "con chó" }] })];
    const warnings = checkAgainstRequest(slides, request({ exclude: "狗, 猪, không dùng động vật hoang dã", duration: "short" }), templates);
    expect(warnings).toContain("Có nội dung bạn muốn loại khỏi bài: 狗.");
  });

  it("flags slide types too hard for the age and a lesson far from the planned length", () => {
    const slides = [slide("fill-blank", { sentences: [{ text: "我[是]学生" }] })];
    const warnings = checkAgainstRequest(slides, request({ age: "preschool" }), templates);
    expect(warnings.some((w) => w.startsWith("Slide 1 (") && w.includes("Mầm non"))).toBe(true);
    expect(warnings.some((w) => w.startsWith("Bài có 1 slide"))).toBe(true);
  });
});
