import { useMemo, type CSSProperties } from "react";
import type { LessonDocument, Slide } from "../core/schema";
import { editorCss, renderSlide, type RenderEnv } from "../renderer/render";

/** Injects the stage, theme and template CSS once; slides render with the exact export markup. */
export function LessonStyles({ env }: { env: RenderEnv }) {
  const css = useMemo(() => editorCss(env), [env]);
  return <style>{css}</style>;
}

interface Props {
  doc: LessonDocument;
  slide: Slide;
  env: RenderEnv;
}

/**
 * A slide rendered by the same function Present and Export use. The HTML comes
 * from the renderer, which escapes all user text, so inserting it is safe.
 */
export function SlideView({ doc, slide, env }: Props) {
  const html = useMemo(() => {
    try {
      return renderSlide(doc, slide, env);
    } catch {
      return `<section class="ls-slide"></section>`;
    }
  }, [doc, slide, env]);
  return (
    <div
      className="ls-deck"
      data-theme={env.themes.resolve(doc.theme.id).id}
      data-hanzi-font={doc.settings.hanziFont}
      data-animations="off"
      style={doc.theme.overrides as CSSProperties | undefined}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
