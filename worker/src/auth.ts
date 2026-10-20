const COOKIE = "teacher";
const WEEK = 7 * 24 * 3600;

const encoder = new TextEncoder();

/** Constant-time comparison, so response timing does not leak how much of a guess matched. */
export function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function sign(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A session cookie value: expiry timestamp plus its HMAC under the teacher password. */
export async function makeSession(password: string, now = Date.now()): Promise<string> {
  const expires = String(Math.floor(now / 1000) + WEEK);
  return `${expires}.${await sign(expires, password)}`;
}

export async function sessionValid(value: string | undefined, password: string, now = Date.now()): Promise<boolean> {
  if (!value) return false;
  const [expires, mac] = value.split(".");
  if (!expires || !mac || Number(expires) * 1000 < now) return false;
  return safeEqual(mac, await sign(expires, password));
}

export function sessionCookie(value: string): string {
  return `${COOKIE}=${value}; Path=/; Max-Age=${WEEK}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function readCookie(header: string | null, name = COOKIE): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

/** The desktop app sends the password as a bearer token; the browser uses the cookie. */
export async function isTeacher(request: Request, password: string): Promise<boolean> {
  const bearer = /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (bearer && safeEqual(bearer, password)) return true;
  return sessionValid(readCookie(request.headers.get("Cookie")), password);
}
