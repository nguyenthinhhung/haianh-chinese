import { describe, expect, it } from "vitest";
import { setTitle } from "../core/document";
import type { LessonDocument } from "../core/schema";
import type { Draft, Persistence } from "../platform/persistence";
import { createFromSample } from "../samples";
import { testEnv } from "../test/env";
import { importLessonFile, libraryHtml, openLesson } from "./lessonFiles";
import { serializeLessonHtml } from "../core/codec";
import { addAsset, setSlideField } from "../core/document";
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

describe("importLessonFile", () => {
  it("brings an exported lesson in under a new ID, writing its embedded media", async () => {
    const env = testEnv();
    const base = createFromSample("fruits", "Hoa quả", "0.0.0");
    const vocab = base.slides[1]!;
    const withImg = addAsset(base, { file: "assets/img-aaaaaaaaaaaa.png", kind: "image", mime: "image/png" });
    const withAudio = addAsset(withImg.doc, { file: "assets/audio-bbbbbbbbbbbb.mp3", kind: "audio", mime: "audio/mpeg" });
    let doc = setSlideField(withAudio.doc, vocab.id, ["words", 0, "image"], withImg.assetId);
    doc = setSlideField(doc, vocab.id, ["words", 0, "audio"], withAudio.assetId);
    const html = serializeLessonHtml(doc, env, { assets: { "assets/img-aaaaaaaaaaaa.png": "data:image/png;base64,iVBORw0KGgo=" } });

    const written: Record<string, number> = {};
    const lessons: Record<string, string> = {};
    const services = { templates: env.templates, themes: env.themes, appVersion: "9.9.9" } as Services;
    services.persistence = {
      pickLessonFile: async () => ({ path: "D:/usb/Hoa-qua.html", html }),
      createLessonDir: async (name: string) => ({ dir: `/lib/${name}`, folderName: name, title: null, modifiedMs: 0 }),
      writeAsset: async (_dir: string, file: string, bytes: Uint8Array) => void (written[file] = bytes.length),
      copySiblingAssets: async () => [],
      writeLesson: async (dir: string, _id: string, out: string) => {
        lessons[dir] = out;
        return { hash: "h" };
      },
    } as unknown as Persistence;

    const result = await importLessonFile(services);
    expect(result?.ok).toBe(true);
    if (!result?.ok) return;
    expect(result.lesson.doc.id).not.toBe(doc.id);
    expect(result.lesson.doc.title).toBe("Hoa quả");
    expect(Object.keys(written)).toEqual(["assets/img-aaaaaaaaaaaa.png"]);
    // The audio was neither embedded nor beside the file.
    expect(result.missing).toEqual(["assets/audio-bbbbbbbbbbbb.mp3"]);
    expect(lessons["/lib/Hoa-qua"]).toContain(result.lesson.doc.id);
  });
});
