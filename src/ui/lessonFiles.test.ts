import { describe, expect, it } from "vitest";
import { setTitle } from "../core/document";
import type { LessonDocument } from "../core/schema";
import type { Draft, Persistence } from "../platform/persistence";
import { createFromSample } from "../samples";
import { testEnv } from "../test/env";
import { libraryHtml, openLesson } from "./lessonFiles";
import type { Services } from "./services";

const FILE_MS = 1_000_000;

function setup(fileDoc: LessonDocument, draft: Draft | null) {
  const drafts = new Map<string, Draft>(draft ? [[fileDoc.id, draft]] : []);
  const env = testEnv();
  const services = { templates: env.templates, themes: env.themes, appVersion: "0.0.0" } as Services;
  const html = libraryHtml(fileDoc, services);
  services.persistence = {
    readLesson: async () => ({ html, hash: "h", modifiedMs: FILE_MS }),
    readDraft: async (id: string) => drafts.get(id) ?? null,
    deleteDraft: async (id: string) => void drafts.delete(id),
  } as unknown as Persistence;
  return { services, drafts };
}

describe("openLesson drafts", () => {
  const fileDoc = createFromSample("fruits", "Hoa quả", "0.0.0");
  const edited = setTitle(fileDoc, "Hoa quả (sửa)");

  it("offers a draft that is newer than the file and differs from it", async () => {
    const { services, drafts } = setup(fileDoc, { json: JSON.stringify(edited), modifiedMs: FILE_MS + 1 });
    const result = await openLesson("/lib/Hoa-qua", services);
    expect(result.ok && result.draft?.doc).toEqual(edited);
    expect(drafts.size).toBe(1);
  });

  it("deletes a draft older than the file", async () => {
    const { services, drafts } = setup(fileDoc, { json: JSON.stringify(edited), modifiedMs: FILE_MS - 1 });
    const result = await openLesson("/lib/Hoa-qua", services);
    expect(result.ok && result.draft).toBeUndefined();
    expect(drafts.size).toBe(0);
  });

  it("deletes a draft identical to the file", async () => {
    const { services, drafts } = setup(fileDoc, { json: JSON.stringify(fileDoc), modifiedMs: FILE_MS + 1 });
    const result = await openLesson("/lib/Hoa-qua", services);
    expect(result.ok && result.draft).toBeUndefined();
    expect(drafts.size).toBe(0);
  });

  it("ignores a draft that does not validate", async () => {
    const { services } = setup(fileDoc, { json: '{"schemaVersion":1}', modifiedMs: FILE_MS + 1 });
    const result = await openLesson("/lib/Hoa-qua", services);
    expect(result.ok && result.draft).toBeUndefined();
  });
});
