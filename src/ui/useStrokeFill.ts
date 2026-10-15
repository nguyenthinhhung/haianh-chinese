import { useEffect, useRef } from "react";
import { fillStrokes, strokeJobs } from "../core/autoStrokes";
import { useServices } from "./services";
import type { LessonSession } from "./useLessonSession";

/** Wait after typing before fetching, so a character still being changed is not fetched. */
const DELAY_MS = 600;

/**
 * Fetches the stroke order of each slide's "write" character in the
 * background and keeps it in the slide. A character that fails (no data, or
 * offline) is not asked for again until the editor reopens.
 */
export function useStrokeFill(session: LessonSession) {
  const { persistence } = useServices();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const asked = useRef(new Set<string>());
  const jobs = strokeJobs(session.doc);
  const key = jobs.map((j) => `${j.slideId}:${j.character}`).join("|");

  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(() => {
      for (const job of strokeJobs(sessionRef.current.doc)) {
        const id = `${job.slideId}:${job.character}`;
        if (asked.current.has(id)) continue;
        asked.current.add(id);
        // fillStrokes ignores an answer for a character the slide no longer asks for.
        void persistence
          .hanziStrokes(job.character)
          .then((strokes) => sessionRef.current.applyInBackground((d) => fillStrokes(d, job, strokes)))
          .catch(() => {
            // The slide shows the plain character instead.
          });
      }
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [key, persistence]);
}
