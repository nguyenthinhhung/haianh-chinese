import { describe, expect, it } from "vitest";
import { createFromSample } from "../samples";
import { testEnv } from "../test/env";
import { parseLessonHtml, readAssetData, serializeLessonHtml } from "./codec";
import { addAsset, addSlide, setSlideField } from "./document";
import type { LessonDocument } from "./schema";
import { TemplateRegistry } from "./templateRegistry";

const env = testEnv();
const roundTrip = (doc: LessonDocument) => parseLessonHtml(serializeLessonHtml(doc, env), env.templates);

function lessonHtmlWithJson(json: string, schemaMeta = true): string {
  return `<!doctype html><html><head>${schemaMeta ? '<meta name="lesson-studio-schema" content="1">' : ""}</head>
<body><script type="application/json" id="lesson-data">${json}</script></body></html>`;
}

describe("LessonCodec", () => {
  it("round-trips every sample lesson", () => {
    for (const sample of ["fruits", "blank"] as const) {
      const doc = createFromSample(sample, "Hoa quả", "0.0.0");
      const result = roundTrip(doc);
      expect(result).toEqual({ ok: true, doc });
    }
  });

  it("round-trips a slide of every registered type with its defaults", () => {
    let doc = createFromSample("blank", "Mọi loại slide", "0.0.0");
    for (const t of env.templates.list()) doc = addSlide(doc, env.templates, t.type, undefined, { sample: true }).doc;
    expect(roundTrip(doc)).toEqual({ ok: true, doc });
  });

  it("round-trips assets and keeps relative asset paths in the DOM", () => {
    let doc = createFromSample("fruits", "Hoa quả", "0.0.0");
    const added = addAsset(doc, { file: "assets/img-0123456789ab.webp", kind: "image", mime: "image/webp", alt: "táo" });
    doc = setSlideField(added.doc, doc.slides[1]!.id, ["words", 0, "image"], added.assetId);
    const html = serializeLessonHtml(doc, env);
    expect(html).toContain('src="assets/img-0123456789ab.webp"');
    expect(parseLessonHtml(html, env.templates)).toEqual({ ok: true, doc });
  });

  it("points pictures at the web server's copies in a published page", () => {
    let doc = createFromSample("fruits", "Hoa quả", "0.0.0");
    const added = addAsset(doc, { file: "assets/img-0123456789ab.webp", kind: "image", mime: "image/webp", alt: "táo" });
    doc = setSlideField(added.doc, doc.slides[1]!.id, ["words", 0, "image"], added.assetId);
    const html = serializeLessonHtml(doc, { ...env, assetUrl: () => "/f/11b879ced09e1bad9c295af3.webp" });
    expect(html).toContain('src="/f/11b879ced09e1bad9c295af3.webp"');
  });

  it("keeps hostile text inert in both the DOM and the embedded JSON", () => {
    const evil = `</script><script>alert(1)</script><!-- "' &`;
    let doc = createFromSample("fruits", evil, "0.0.0");
    doc = setSlideField(doc, doc.slides[0]!.id, ["title"], evil);
    const html = serializeLessonHtml(doc, env);
    expect(html.match(/<script/g)).toHaveLength(2);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;/script&gt;");
    expect(roundTrip(doc)).toEqual({ ok: true, doc });
  });

  it("writes the contract skeleton with language tags", () => {
    const html = serializeLessonHtml(createFromSample("fruits", "Hoa quả", "0.0.0"), env);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<meta name="lesson-studio-schema" content="1">');
    expect(html).toContain('<meta name="generator" content="Chinese Lesson Studio">');
    expect(html).toContain('<title>Hoa quả</title>');
    expect(html).toContain('<main class="ls-deck" data-theme="classic"');
    expect(html).toContain('<h1 class="ls-cover-title" lang="zh-CN">水果</h1>');
    expect(html).toContain('lang="vi">Hoa quả</p>');
  });

  it("tags Chinese as zh-CN whatever the lesson's script", () => {
    const doc = { ...createFromSample("fruits", "Hoa quả", "0.0.0"), script: "traditional" as const };
    const html = serializeLessonHtml(doc, env);
    expect(html).not.toContain("zh-TW");
    expect(html).toContain('lang="zh-CN">苹果</span>');
  });

  it("embeds only the CSS and runtime of templates the lesson uses", () => {
    // A stand-in template with its own interaction script, registered next to the real ones.
    const vocabulary = env.templates.require("vocabulary");
    const withScript = { ...vocabulary, type: "scripted", interaction: { source: "/* scripted-interaction */" } };
    const scriptedEnv = { ...env, templates: new TemplateRegistry([...env.templates.list(), withScript]) };

    const coverOnly = serializeLessonHtml(createFromSample("blank", "Trống", "0.0.0"), scriptedEnv);
    expect(coverOnly).toContain("registerInteraction = function");
    expect(coverOnly).not.toContain("scripted-interaction");
    expect(coverOnly).not.toContain("ls-vocab-grid");

    const doc = createFromSample("blank", "Trống", "0.0.0");
    const scripted = { ...doc, slides: [...doc.slides, { id: "s_scripted01", type: "scripted", content: vocabulary.defaults() }] };
    expect(serializeLessonHtml(scripted, scriptedEnv)).toContain("scripted-interaction");
  });

  it("reads only the JSON and ignores the DOM and other scripts", () => {
    const doc = createFromSample("fruits", "Hoa quả", "0.0.0");
    const html = serializeLessonHtml(doc, env)
      .replace("<main", '<script>window.pwned = true</script><main data-x="tampered"')
      .replace("苹果</span>", "TAMPERED</span>");
    expect(parseLessonHtml(html, env.templates)).toEqual({ ok: true, doc });
  });

  it("finds the data block whatever the attribute order", () => {
    const doc = createFromSample("blank", "Trống", "0.0.0");
    const html = `<meta content="1" name='lesson-studio-schema'><script id='lesson-data' type='application/json'>${JSON.stringify(doc)}</script>`;
    expect(parseLessonHtml(html, env.templates)).toEqual({ ok: true, doc });
  });

  it("rejects HTML that does not follow the contract", () => {
    const plain = parseLessonHtml("<html><body><h1>Hello</h1></body></html>", env.templates);
    expect(plain).toMatchObject({ ok: false, code: "not-lesson" });
    const noMeta = parseLessonHtml(lessonHtmlWithJson("{}", false), env.templates);
    expect(noMeta).toMatchObject({ ok: false, code: "not-lesson" });
  });

  it("rejects broken JSON", () => {
    expect(parseLessonHtml(lessonHtmlWithJson("{not json"), env.templates)).toMatchObject({ ok: false, code: "bad-json" });
  });

  it("refuses a newer schema version instead of downgrading it", () => {
    const doc = { ...createFromSample("blank", "Trống", "0.0.0"), schemaVersion: 99 };
    const result = parseLessonHtml(lessonHtmlWithJson(JSON.stringify(doc)), env.templates);
    expect(result).toMatchObject({ ok: false, code: "too-new" });
  });

  it("refuses unknown slide types rather than dropping slides", () => {
    const doc = createFromSample("fruits", "Hoa quả", "0.0.0");
    const raw = { ...doc, slides: [...doc.slides, { id: "s_future0001", type: "hologram", content: {} }] };
    const result = parseLessonHtml(lessonHtmlWithJson(JSON.stringify(raw)), env.templates);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("invalid");
      expect(result.details[0]).toMatch(/^Slide 3, type: Loại slide "hologram" không được hỗ trợ/);
    }
  });

  it("fills safe defaults for missing optional fields", () => {
    const doc = createFromSample("blank", "Trống", "0.0.0");
    const { script, settings, theme, assets, ...minimal } = doc;
    void script, settings, theme, assets;
    const result = parseLessonHtml(lessonHtmlWithJson(JSON.stringify(minimal)), env.templates);
    expect(result).toEqual({ ok: true, doc });
  });

  it("rejects unsafe asset paths", () => {
    const doc = createFromSample("blank", "Trống", "0.0.0");
    for (const file of ["../secret.png", "/etc/passwd", "file:///c:/x.png", "javascript:alert(1)", "https://x.test/a.png", "assets/../x.png"]) {
      const raw = { ...doc, assets: [{ id: "a_abcdef", file, kind: "image", mime: "image/png" }] };
      const result = parseLessonHtml(lessonHtmlWithJson(JSON.stringify(raw)), env.templates);
      expect(result, file).toMatchObject({ ok: false, code: "invalid" });
    }
  });

  it("embeds asset files once in an export and reads them back as JSON", () => {
    const doc = createFromSample("fruits", "Hoa quả", "0.0.0");
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const html = serializeLessonHtml(doc, env, {
      assets: { "assets/img-aaaaaaaaaaaa.png": png },
    });
    expect(html.split(png)).toHaveLength(2);
    expect(readAssetData(html)).toEqual({ "assets/img-aaaaaaaaaaaa.png": png });
    expect(parseLessonHtml(html, env.templates)).toEqual({ ok: true, doc });
  });

  it("ignores embedded assets with unsafe paths or non-media data", () => {
    const doc = createFromSample("blank", "x", "0.0.0");
    const html = serializeLessonHtml(doc, env, {
      assets: {
        "assets/ok.png": "data:image/png;base64,AAAA",
        "../evil.png": "data:image/png;base64,AAAA",
        "assets/x.html": "data:text/html;base64,PHNjcmlwdD4=",
        "assets/y.svg": "javascript:alert(1)",
      },
    });
    expect(readAssetData(html)).toEqual({ "assets/ok.png": "data:image/png;base64,AAAA" });
    expect(readAssetData(serializeLessonHtml(doc, env))).toEqual({});
  });
});
