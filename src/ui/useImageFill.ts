import { useCallback, useEffect, useRef, useState } from "react";
import { fillImageSlot, slotKey, type FoundPicture, type ImageJob } from "../core/autoImages";
import type { LessonDocument } from "../core/schema";
import type { ThemeRegistry } from "../core/themeRegistry";
import { ageProfile } from "../core/ages";
import { PersistenceError } from "../platform/persistence";
import { useServices } from "./services";
import type { LessonSession } from "./useLessonSession";

export interface ImageFillProgress {
  total: number;
  done: number;
  /** Slots for which no picture could be found or downloaded. */
  failed: number;
  running: boolean;
  /** Why the queue stopped early (Bing refusing, no connection); resuming retries. */
  paused: string | null;
}

/** Results a picture download tries before giving up on a slot. */
const CANDIDATES_TRIED = 3;

/** Drawings suit lessons whose theme is meant for young children. */
export function prefersClipart(doc: LessonDocument, themes: ThemeRegistry): boolean {
  return themes.resolve(doc.theme.id).ages.some((a) => ageProfile(a).clipart);
}

/**
 * Fills picture slots one at a time in the background. The backend spaces out
 * and caches the searches; a search word shared by several slots is searched
 * and downloaded once. Stops when Bing refuses or the connection drops.
 */
export function useImageFill(session: LessonSession) {
  const { persistence } = useServices();
  const [progress, setProgress] = useState<ImageFillProgress>({ total: 0, done: 0, failed: 0, running: false, paused: null });
  const queue = useRef<ImageJob[]>([]);
  const running = useRef(false);
  const alive = useRef(true);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  // Pictures already in this lesson's folder, by search word.
  const pictures = useRef(new Map<string, FoundPicture | null>());

  useEffect(() => {
    // Set on every mount: StrictMode mounts twice in development.
    alive.current = true;
    if (queue.current.length) void runRef.current();
    return () => {
      alive.current = false;
    };
  }, []);

  const pictureFor = useCallback(
    async (job: ImageJob): Promise<FoundPicture | null> => {
      const key = `${job.clipart ? 1 : 0}|${job.query.toLowerCase()}`;
      if (pictures.current.has(key)) return pictures.current.get(key)!;
      let candidates = await persistence.searchImageCandidates(job.query, job.clipart);
      // Drawings are not found for every word; a photo beats an empty slot.
      if (!candidates.length && job.clipart) candidates = await persistence.searchImageCandidates(job.query, false);
      let picture: FoundPicture | null = null;
      for (const c of candidates.slice(0, CANDIDATES_TRIED)) {
        try {
          // Many sites refuse downloads from apps; Bing's copy is the fallback.
          const imported = await persistence.importImageUrl(sessionRef.current.dir, [c.url, c.thumbnailUrl]);
          picture = { ...imported, source: c.sourcePage ?? c.url };
          break;
        } catch {
          // Try the next result.
        }
      }
      pictures.current.set(key, picture);
      return picture;
    },
    [persistence],
  );

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setProgress((p) => ({ ...p, running: true, paused: null }));
    try {
      while (alive.current && queue.current.length) {
        const job = queue.current[0]!;
        let picture: FoundPicture | null = null;
        try {
          picture = await pictureFor(job);
        } catch (e) {
          if (e instanceof PersistenceError && (e.code === "rate-limited" || e.code === "network")) {
            if (alive.current) setProgress((p) => ({ ...p, paused: e.message }));
            return;
          }
        }
        if (!alive.current) return;
        queue.current.shift();
        if (picture) sessionRef.current.applyInBackground((d) => fillImageSlot(d, job, picture));
        setProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + (picture ? 0 : 1) }));
      }
    } finally {
      running.current = false;
      if (alive.current) setProgress((p) => ({ ...p, running: false }));
    }
  }, [pictureFor]);

  const runRef = useRef(run);
  runRef.current = run;

  /** Adds jobs (slots already queued are skipped) and starts working if idle. */
  const enqueue = useCallback(
    (jobs: ImageJob[]) => {
      const queued = new Set(queue.current.map((j) => slotKey(j.slideId, j.path)));
      const fresh = jobs.filter((j) => !queued.has(slotKey(j.slideId, j.path)));
      if (!fresh.length) return 0;
      const restart = !running.current && queue.current.length === 0;
      queue.current.push(...fresh);
      setProgress((p) =>
        restart
          ? { total: fresh.length, done: 0, failed: 0, running: p.running, paused: null }
          : { ...p, total: p.total + fresh.length },
      );
      void run();
      return fresh.length;
    },
    [run],
  );

  return { progress, enqueue, resume: run };
}
