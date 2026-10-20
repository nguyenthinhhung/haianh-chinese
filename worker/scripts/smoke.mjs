// End-to-end check of a deployed Worker: upload, Range read, lesson page, delete.
// Usage: node scripts/smoke.mjs https://<worker>.workers.dev   (asks for the teacher password)
import readline from "node:readline";

const base = process.argv[2]?.replace(/\/$/, "");
if (!base) {
  console.error("Usage: node scripts/smoke.mjs <worker url>");
  process.exit(2);
}

function askHidden(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => {
    if (s.includes(question)) process.stdout.write(s);
  };
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    }),
  );
}

const password = await askHidden("Teacher password: ");
const auth = { Authorization: `Bearer ${password}` };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let failed = 0;

function check(name, ok, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
}

let res = await fetch(`${base}/api/assets/smoke-test.png`, { method: "PUT", headers: auth, body: PNG });
check("upload asset", res.ok, String(res.status));

res = await fetch(`${base}/f/smoke-test.png`);
const body = Buffer.from(await res.arrayBuffer());
check("read asset back", res.status === 200 && body.equals(PNG) && res.headers.get("content-type") === "image/png", `${res.status} ${body.length} bytes`);

res = await fetch(`${base}/f/smoke-test.png`, { headers: { Range: "bytes=0-9" } });
const part = Buffer.from(await res.arrayBuffer());
check("Range read", res.status === 206 && part.length === 10, `${res.status} ${part.length} bytes`);

check("reject wrong password", (await fetch(`${base}/api/assets/x.png`, { method: "PUT", headers: { Authorization: "Bearer nope" }, body: PNG })).status === 401);
check("reject svg", (await fetch(`${base}/api/assets/x.svg`, { method: "PUT", headers: auth, body: "<svg/>" })).status === 400);

const page = "<!doctype html><title>Smoke</title><p>ok</p>";
res = await fetch(`${base}/api/lessons/smoke-test?title=${encodeURIComponent("Bài thử")}`, { method: "PUT", headers: auth, body: page });
check("publish lesson", res.ok, String(res.status));

res = await fetch(`${base}/l/smoke-test`, { headers: auth });
check("open lesson as teacher", res.status === 200 && (await res.text()) === page && !!res.headers.get("content-security-policy"), String(res.status));
check("lesson hidden without login", (await fetch(`${base}/l/smoke-test`, { redirect: "manual" })).status === 303);

res = await fetch(`${base}/`, { headers: auth });
check("lesson listed", res.status === 200 && (await res.text()).includes("Bài thử"), String(res.status));

res = await fetch(`${base}/api/lessons/smoke-test`, { method: "DELETE", headers: auth });
check("delete lesson", res.ok, String(res.status));
check("lesson gone", (await fetch(`${base}/l/smoke-test`, { headers: auth })).status === 404);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
