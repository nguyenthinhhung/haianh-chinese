import { describe, expect, it } from "vitest";
import { newExercise } from "../../src/core/exercise";
import { attemptDeadline, cleanAnswers, cleanName, isOpen, vietnamTimeToIso } from "./assignments";

describe("cleanName", () => {
  it("keeps one tidy line with a letter in it", () => {
    expect(cleanName("  Nguyễn   Minh\nAn ")).toBe("Nguyễn Minh An");
    expect(cleanName("x".repeat(80))).toHaveLength(60);
    for (const bad of ["", "   ", "123", 42, null]) expect(cleanName(bad)).toBeNull();
  });
});

describe("cleanAnswers", () => {
  it("keeps every shape a question can take", () => {
    const answers = {
      q_choice01: "o_option01",
      q_tf000001: false,
      q_typed001: "我喜欢学习汉语。",
      q_order001: ["我", "是", "学生"],
      q_match001: { o_left0001: "o_right001" },
    };
    expect(cleanAnswers(answers)).toEqual(answers);
  });

  it("drops what no question takes, and refuses what is not an object", () => {
    expect(
      cleanAnswers({
        bad: "o_option01",
        q_long0001: "x".repeat(2001),
        q_list0001: Array.from({ length: 31 }, () => "字"),
        q_map00001: { "not an id": "o_right001" },
        q_num00001: 3,
      }),
    ).toEqual({});
    expect(cleanAnswers(["q_x"])).toBeNull();
    expect(cleanAnswers(null)).toBeNull();
  });
});

describe("deadlines", () => {
  it("reads the teacher's deadline as Vietnam time", () => {
    expect(vietnamTimeToIso("2026-10-25T21:00")).toBe("2026-10-25T14:00:00.000Z");
    expect(vietnamTimeToIso("25/10/2026 21:00")).toBeNull();
  });

  it("is open until closed or past the deadline", () => {
    const now = Date.parse("2026-10-20T00:00:00Z");
    expect(isOpen({ closed: 0, closes_at: null }, now)).toBe(true);
    expect(isOpen({ closed: 1, closes_at: null }, now)).toBe(false);
    expect(isOpen({ closed: 0, closes_at: "2026-10-19T23:59:00.000Z" }, now)).toBe(false);
    expect(isOpen({ closed: 0, closes_at: "2026-10-20T00:01:00.000Z" }, now)).toBe(true);
  });

  it("ends an attempt at its time limit or the deadline, whichever comes first", () => {
    const ex = newExercise("Đề");
    const timed = { ...ex, settings: { ...ex.settings, timeLimit: 10 } };
    const start = "2026-10-20T00:00:00.000Z";
    expect(attemptDeadline(ex, { closes_at: null }, start)).toBeNull();
    expect(attemptDeadline(timed, { closes_at: null }, start)).toBe(Date.parse("2026-10-20T00:10:00Z"));
    expect(attemptDeadline(timed, { closes_at: "2026-10-20T00:05:00.000Z" }, start)).toBe(Date.parse("2026-10-20T00:05:00Z"));
    // A clock that starts with the first answer runs in the browser; only the deadline holds on the server.
    const firstAnswer = { ...timed, settings: { ...timed.settings, timerStart: "first-answer" as const } };
    expect(attemptDeadline(firstAnswer, { closes_at: null }, start)).toBeNull();
  });
});
