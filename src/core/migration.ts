import { SCHEMA_VERSION } from "./schema";

type RawLesson = Record<string, unknown>;

/** Upgrades a raw document from version `n` (the key) to `n + 1`. */
export type Migration = (raw: RawLesson) => RawLesson;

/** Register `vN → vN+1` steps here when the schema changes. */
export const MIGRATIONS: Record<number, Migration> = {
  // v2 adds exercises; a v1 lesson has none.
  1: (raw) => ({ ...raw, exercises: Array.isArray(raw.exercises) ? raw.exercises : [] }),
};

export type MigrationResult =
  | { ok: true; raw: RawLesson; fromVersion: number }
  | { ok: false; code: "missing-version" | "too-new" | "no-path"; message: string; fromVersion?: number };

/**
 * Runs the migration chain on raw JSON. Never downgrades: a file from a newer
 * app is refused so the original stays untouched.
 */
export function migrate(
  raw: unknown,
  migrations: Record<number, Migration> = MIGRATIONS,
  target: number = SCHEMA_VERSION,
): MigrationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, code: "missing-version", message: "Dữ liệu bài học không phải là một đối tượng JSON" };
  }
  const version = (raw as RawLesson).schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, code: "missing-version", message: "Thiếu hoặc sai số phiên bản schemaVersion" };
  }
  if (version > target) {
    return {
      ok: false,
      code: "too-new",
      fromVersion: version,
      message: `Bài học dùng định dạng phiên bản ${version}, mới hơn phiên bản ứng dụng hỗ trợ (${target}). Hãy cập nhật ứng dụng.`,
    };
  }

  let current = raw as RawLesson;
  for (let v = version; v < target; v++) {
    const step = migrations[v];
    if (!step) {
      return { ok: false, code: "no-path", fromVersion: version, message: `Không có bước chuyển đổi từ phiên bản ${v}` };
    }
    current = { ...step(current), schemaVersion: v + 1 };
  }
  return { ok: true, raw: current, fromVersion: version };
}
