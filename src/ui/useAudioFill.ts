import { useCallback, useEffect, useRef, useState } from "react";
import { fillAudioSlot, speechText, type AudioJob } from "../core/autoAudio";
import { slotKey } from "../core/autoImages";
import type { ImportedAsset } from "../platform/persistence";
import { PersistenceError } from "../platform/persistence";
import { useServices } from "./services";
import type { LessonSession } from "./useLessonSession";
import type { ImageFillProgress } from "./useImageFill";

/** Pause between two recordings, so a lesson's words are not fired at the speech service at once. */
const GAP_MS = 300;

/**
 * Reads pronunciation slots aloud in the background, one at a time; a text
 * shared by several slots is recorded once. Stops when the connection drops.
 */
export function useAudioFill(session: LessonSession) {
  const { persistence } = useServices();
  const [progress, setProgress] = useState<ImageFillProgress>({ total: 0, done: 0, failed: 0, running: false, paused: null });
  const queue = useRef<AudioJob[]>([]);
  const running = useRef(false);
  const alive = useRef(true);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const recordings = useRef(new Map<string, ImportedAsset | null>());

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setProgress((p) => ({ ...p, running: true, paused: null }));
    try {
      while (alive.current && queue.current.length) {
        const job = queue.current[0]!;
        let sound = recordings.current.get(job.text) ?? null;
        if (!recordings.current.has(job.text)) {
          try {
            sound = await persistence.speakChinese(sessionRef.current.dir, speechText(job.text));
          } catch (e) {
            if (e instanceof PersistenceError && e.code === "network") {
              if (alive.current) setProgress((p) => ({ ...p, paused: e.message }));
              return;
            }
            sound = null;
          }
          recordings.current.set(job.text, sound);
          await new Promise((r) => setTimeout(r, GAP_MS));
        }
        if (!alive.current) return;
        queue.current.shift();
        if (sound) sessionRef.current.applyInBackground((d) => fillAudioSlot(d, job, sound));
        setProgress((p) => ({ ...p, done: p.done + 1, failed: p.failed + (sound ? 0 : 1) }));
      }
    } finally {
      running.current = false;
      if (alive.current) setProgress((p) => ({ ...p, running: false }));
    }
  }, [persistence]);

  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    // Set on every mount: StrictMode mounts twice in development.
    alive.current = true;
    if (queue.current.length) void runRef.current();
    return () => {
      alive.current = false;
    };
  }, []);

  /** Adds jobs (slots already queued are skipped) and starts working if idle. */
  const enqueue = useCallback(
    (jobs: AudioJob[]) => {
      const queued = new Set(queue.current.map((j) => slotKey(j.ownerId, j.path)));
      const fresh = jobs.filter((j) => !queued.has(slotKey(j.ownerId, j.path)));
      if (!fresh.length) return 0;
      const restart = !running.current && queue.current.length === 0;
      queue.current.push(...fresh);
      setProgress((p) =>
        restart ? { total: fresh.length, done: 0, failed: 0, running: p.running, paused: null } : { ...p, total: p.total + fresh.length },
      );
      void run();
      return fresh.length;
    },
    [run],
  );

  return { progress, enqueue, resume: run };
}
