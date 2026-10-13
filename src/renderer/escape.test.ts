import { describe, expect, it } from "vitest";
import { esc, isSafeUrl, jsonForScript } from "./escape";
import { FONT_CSS } from "./fonts";

describe("escape", () => {
  it("escapes HTML-significant characters", () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("produces JSON that cannot close its script block", () => {
    const json = jsonForScript({ t: "</script><!--" });
    expect(json).not.toContain("<");
    expect(JSON.parse(json)).toEqual({ t: "</script><!--" });
  });

  it("allows only asset, data, blob and webview asset URLs", () => {
    for (const ok of [
      "assets/img-abc.webp",
      "data:image/png;base64,iVBORw0KGgo=",
      "blob:http://localhost:1420/1c9f",
      "http://asset.localhost/C%3A%2Fx%2Fassets%2Fa.png",
      "asset://localhost/%2FUsers%2Fx%2Fa.png",
    ]) {
      expect(isSafeUrl(ok), ok).toBe(true);
    }
    for (const bad of [
      "javascript:alert(1)",
      "assets/../../secret",
      "/assets/a.png",
      "file:///C:/a.png",
      "https://example.com/a.png",
      'assets/a.png" onerror="x',
      "data:text/html;base64,PHNjcmlwdD4=",
    ]) {
      expect(isSafeUrl(bad), bad).toBe(false);
    }
  });

  it("embeds the Latin font as data, not as an external file", () => {
    expect(FONT_CSS.match(/url\(data:font\/woff2;base64,/g)).toHaveLength(3);
  });
});
