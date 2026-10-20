import { describe, expect, it } from "vitest";
import { isTeacher, makeSession, readCookie, safeEqual, sessionValid } from "./auth";

const PASSWORD = "correct horse";

describe("safeEqual", () => {
  it("matches equal strings only", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("session", () => {
  it("accepts a fresh session", async () => {
    expect(await sessionValid(await makeSession(PASSWORD), PASSWORD)).toBe(true);
  });

  it("rejects a different password, a tampered expiry and an expired session", async () => {
    const now = Date.now();
    const session = await makeSession(PASSWORD, now);
    expect(await sessionValid(session, "other", now)).toBe(false);
    const [, mac] = session.split(".");
    expect(await sessionValid(`${Math.floor(now / 1000) + 99999999}.${mac}`, PASSWORD, now)).toBe(false);
    expect(await sessionValid(session, PASSWORD, now + 8 * 24 * 3600 * 1000)).toBe(false);
    expect(await sessionValid(undefined, PASSWORD)).toBe(false);
    expect(await sessionValid("garbage", PASSWORD)).toBe(false);
  });
});

describe("isTeacher", () => {
  it("accepts the bearer password or a valid cookie, nothing else", async () => {
    const cookie = `teacher=${await makeSession(PASSWORD)}`;
    expect(await isTeacher(new Request("https://x/", { headers: { Authorization: `Bearer ${PASSWORD}` } }), PASSWORD)).toBe(true);
    expect(await isTeacher(new Request("https://x/", { headers: { Cookie: `a=b; ${cookie}` } }), PASSWORD)).toBe(true);
    expect(await isTeacher(new Request("https://x/", { headers: { Authorization: "Bearer nope" } }), PASSWORD)).toBe(false);
    expect(await isTeacher(new Request("https://x/"), PASSWORD)).toBe(false);
  });
});

describe("readCookie", () => {
  it("reads one cookie out of several", () => {
    expect(readCookie("a=1; teacher=x.y; b=2")).toBe("x.y");
    expect(readCookie(null)).toBeUndefined();
  });
});
