/**
 * Simple rate limits kept in D1: each counted request is a row, and a limit is
 * a count over a time window. A whole class often shares one address (school
 * Wi-Fi), so the limits for students are generous; they only stop loops and
 * guessing.
 */

const encoder = new TextEncoder();

/**
 * Who is asking, without storing the address itself: an HMAC of the client's
 * IP under a server secret, shortened.
 */
export async function clientKey(request: Request, secret: string): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(ip)));
  return Array.from(mac.slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface Limit {
  /** Requests allowed within the window. */
  max: number;
  windowSeconds: number;
}

export const LIMITS = {
  /** Wrong teacher passwords, from one address. */
  login: { max: 10, windowSeconds: 15 * 60 },
  /** Attempts started, from one address (a class of 40, each restarting a few times). */
  start: { max: 300, windowSeconds: 10 * 60 },
  /** Hand-ins, from one address. */
  submit: { max: 600, windowSeconds: 10 * 60 },
} satisfies Record<string, Limit>;

const now = () => Math.floor(Date.now() / 1000);

export async function overLimit(db: D1Database, key: string, limit: Limit): Promise<boolean> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM hits WHERE key = ? AND at > ?")
    .bind(key, now() - limit.windowSeconds)
    .first<{ n: number }>();
  return (row?.n ?? 0) >= limit.max;
}

/** Counts one request, and forgets requests older than a day. */
export async function count(db: D1Database, key: string): Promise<void> {
  const t = now();
  await db.batch([db.prepare("INSERT INTO hits (key, at) VALUES (?, ?)").bind(key, t), db.prepare("DELETE FROM hits WHERE at < ?").bind(t - 86400)]);
}
