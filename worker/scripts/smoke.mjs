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

const password = (process.env.TEACHER_PASSWORD ?? (await askHidden("Teacher password: "))).trim();
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

res = await fetch(`${base}/api/assets/missing`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ names: ["smoke-test.png", "smoke-absent.png"] }) });
const missing = res.ok ? (await res.json()).missing : null;
check("missing-files check", JSON.stringify(missing) === JSON.stringify(["smoke-absent.png"]), `${res.status} ${JSON.stringify(missing)}`);

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

// Hand an exercise out, do it as a student, see it in the results, take it down.
const option = (id, text, correct = false) => ({ id, text, pinyin: "", correct });
const exercise = {
  id: "e_smokecheck",
  title: "Smoke test",
  intro: "",
  settings: { timeLimit: 0, timerStart: "start", attempts: "many", shuffleQuestions: false, shuffleOptions: true, maxListens: 0, showAnswers: "after-submit", pinyin: true, passPercent: 0 },
  parts: [
    {
      id: "p_smokecheck",
      skill: "reading",
      title: "",
      instruction: "",
      passage: "",
      transcript: "",
      questions: [
        { id: "q_smokecheck1", type: "choice", prompt: "猫", pinyin: "", points: 1, explanation: "secret-explanation", transcript: "", options: [option("o_smokeright", "con mèo", true), option("o_smokewrong", "con chó")] },
        { id: "q_smokecheck2", type: "true-false", prompt: "我是学生。", pinyin: "", points: 1, explanation: "", transcript: "", answer: false },
      ],
    },
  ],
};
const assignmentUrl = `${base}/api/assignments/${exercise.id}`;
res = await fetch(assignmentUrl, { method: "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ lessonTitle: "Smoke", theme: "classic", hanziFont: "sans", exercise, assetUrls: {} }) });
const handedOut = res.ok ? await res.json() : null;
check("hand out exercise", !!handedOut?.slug, String(res.status));
if (handedOut?.slug) {
  const studentApi = `${base}/api/a/${handedOut.slug}`;
  res = await fetch(`${studentApi}?seed=smoke`);
  const copyText = await res.text();
  check("student copy hides answers", res.ok && !/"correct"|"answer"|secret-explanation/.test(copyText), String(res.status));
  check("student page served", (await fetch(`${base}/a/${handedOut.slug}`)).status === 200);
  const post = (path, body) => fetch(`${studentApi}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  res = await post("start", { name: "Smoke Test", clientId: "smoketestclient" });
  const attempt = res.ok ? await res.json() : null;
  check("start attempt", !!attempt?.attemptId, String(res.status));
  res = await post("submit", { attemptId: attempt?.attemptId, answers: { q_smokecheck1: "o_smokeright", q_smokecheck2: true } });
  const graded = res.ok ? await res.json() : null;
  check("grade hand-in", graded?.grade?.score === 1 && graded?.grade?.max === 2 && !!graded?.review, `${res.status} ${JSON.stringify(graded?.grade?.score)}`);
  res = await fetch(`${base}/results/${exercise.id}`, { headers: auth });
  check("results page lists the student", res.status === 200 && (await res.text()).includes("Smoke Test"), String(res.status));
  res = await fetch(assignmentUrl, { method: "DELETE", headers: auth });
  check("take exercise down", res.ok, String(res.status));
  check("student link gone", (await fetch(`${studentApi}`)).status === 404);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
