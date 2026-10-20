/** The teacher's pages on the web: sign-in, the published lessons, and the results of exercises. */

export interface LessonEntry {
  id: string;
  title: string;
  /** Chinese title from the lesson's cover, shown large on its card. */
  hanzi?: string;
  updatedAt: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const BASE_CSS = `
:root{--bg:#f4f2ee;--panel:#fff;--border:#e2ddd5;--text:#1f2933;--muted:#6b7280;--accent:#c8102e;--accent-hover:#a50d26;--focus:#2a6f97;--shadow:0 1px 2px rgb(0 0 0/.06),0 8px 24px rgb(0 0 0/.06);color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#17191c;--panel:#22252a;--border:#353a41;--text:#eceae6;--muted:#9aa1ab;--accent:#e2364f;--accent-hover:#f0566c;--shadow:0 1px 2px rgb(0 0 0/.3);color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--text);font:15px/1.5 "Segoe UI",-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif}
button,input{font:inherit;color:inherit}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.mark{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:#fff;color:#c8102e;font:700 26px/1 "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif;box-shadow:inset 0 0 0 2px rgb(255 255 255/.6)}
`;

function page(title: string, css: string, body: string, script = ""): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>${BASE_CSS}${css}</style></head><body>${body}${script ? `<script>${script}</script>` : ""}</body></html>`;
}

/** Inline style and script only; nothing loads from elsewhere. */
export const PAGE_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

const LOGIN_CSS = `
body{display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 20% 0%,rgb(200 16 46/.14),transparent 55%),radial-gradient(circle at 100% 100%,rgb(242 169 0/.14),transparent 50%),var(--bg)}
.card{width:min(380px,100%);padding:32px 28px 28px;border-radius:20px;background:var(--panel);box-shadow:var(--shadow);border:1px solid var(--border)}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:24px}
.brand .mark{background:var(--accent);color:#fff}
.brand strong{display:block;font-size:17px}
.brand span{color:var(--muted);font-size:13px}
label{display:block;margin-bottom:6px;font-weight:600}
input{width:100%;padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--bg)}
button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:12px;background:var(--accent);color:#fff;font-weight:600;cursor:pointer}
button:hover{background:var(--accent-hover)}
.error{margin:0 0 14px;padding:10px 12px;border-radius:10px;background:rgb(180 35 24/.1);color:var(--accent)}
.hint{margin:12px 0 0;color:var(--muted);font-size:13px}
`;

export function loginPage(error = ""): string {
  return page(
    "Đăng nhập · Chinese Lesson Studio",
    LOGIN_CSS,
    `<form class="card" method="post" action="/login">
<div class="brand"><div class="mark">汉</div><div><strong>Chinese Lesson Studio</strong><span>Bài giảng của giáo viên</span></div></div>
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ""}
<label for="pw">Mật khẩu</label>
<input id="pw" type="password" name="password" autocomplete="current-password" autofocus required>
<button>Vào</button>
<p class="hint">Tắt bộ gõ tiếng Việt khi nhập mật khẩu.</p>
</form>`,
  );
}

// Warm colours that read well behind white text, one per lesson.
const CARD_COLORS = ["#c8102e", "#d9480f", "#b7791f", "#2f855a", "#2b6cb0", "#6b46c1", "#b83280", "#0f766e"];

/** FNV-1a with a final mix, so similar IDs still land on different colours. */
function colorFor(id: string): string {
  let h = 0x811c9dc5;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return CARD_COLORS[(h >>> 0) % CARD_COLORS.length]!;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric", year: "numeric" });
}

/** Header, navigation and copy buttons shared by the teacher's pages. */
const TEACHER_CSS = `
header{background:linear-gradient(135deg,#c8102e,#9e0c24);color:#fff}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:14px;max-width:1080px;margin:0 auto;padding:18px 24px}
.bar h1{margin:0;font-size:20px}
.bar p{margin:0;opacity:.85;font-size:13px}
.nav{display:flex;gap:4px;margin-left:auto;padding:3px;border-radius:12px;background:rgb(0 0 0/.15)}
.nav a{padding:7px 14px;border-radius:9px;color:#fff;text-decoration:none;font-weight:600;opacity:.85}
.nav a[aria-current=page]{background:#fff;color:#c8102e;opacity:1}
.ghost{padding:8px 14px;border:1px solid rgb(255 255 255/.45);border-radius:10px;background:transparent;color:#fff;cursor:pointer}
.ghost:hover{background:rgb(255 255 255/.12)}
main{max-width:1080px;margin:0 auto;padding:24px}
.copy{padding:9px 12px;border:1px solid var(--border);border-radius:10px;background:var(--panel);cursor:pointer;white-space:nowrap}
.copy:hover{border-color:var(--muted)}
a.copy{display:inline-block;color:inherit;text-decoration:none}
.empty{padding:56px 24px;border:2px dashed var(--border);border-radius:20px;text-align:center;color:var(--muted)}
.empty .mark{margin:0 auto 14px;background:var(--accent);color:#fff}
.empty strong{display:block;margin-bottom:6px;color:var(--text);font-size:17px}
.muted{color:var(--muted)}
@media (max-width:620px){.bar{padding:14px 16px}main{padding:16px}.bar p{display:none}.nav{order:3;width:100%;margin-left:0}.nav a{flex:1;text-align:center}}
`;

const COPY_SCRIPT = `
document.addEventListener("click",async e=>{const b=e.target.closest(".copy[data-href]");if(!b)return;const url=location.origin+b.dataset.href;try{await navigator.clipboard.writeText(url);const t=b.textContent;b.textContent="Đã chép";setTimeout(()=>b.textContent=t,1500)}catch{prompt("Sao chép link:",url)}});
`;

function teacherPage(title: string, active: "lessons" | "results", css: string, content: string, script = ""): string {
  const link = (href: string, label: string, key: typeof active) => `<a href="${href}"${active === key ? ' aria-current="page"' : ""}>${label}</a>`;
  return page(
    `${title} · Chinese Lesson Studio`,
    TEACHER_CSS + css,
    `<header><div class="bar"><div class="mark">汉</div><div><h1>${escapeHtml(title)}</h1><p>Chinese Lesson Studio</p></div>
<nav class="nav" aria-label="Trang">${link("/", "Bài học", "lessons")}${link("/results", "Bảng điểm", "results")}</nav>
<form method="post" action="/logout"><button class="ghost">Đăng xuất</button></form></div></header>
<main>${content}</main>`,
    COPY_SCRIPT + script,
  );
}

const LIBRARY_CSS = `
.tools{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:20px}
.tools input{flex:1;min-width:200px;max-width:380px;padding:10px 14px;border:1px solid var(--border);border-radius:12px;background:var(--panel)}
.count{color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px;margin:0;padding:0;list-style:none}
.lesson{display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--border);border-radius:18px;background:var(--panel);box-shadow:var(--shadow);transition:transform .15s,box-shadow .15s}
.lesson:hover{transform:translateY(-2px);box-shadow:0 2px 4px rgb(0 0 0/.08),0 14px 32px rgb(0 0 0/.1)}
.cover{position:relative;display:grid;place-items:center;height:132px;color:#fff;text-decoration:none;background-image:radial-gradient(circle at 85% 15%,rgb(255 255 255/.22) 0 18%,transparent 19%),radial-gradient(circle at 10% 110%,rgb(255 255 255/.14) 0 30%,transparent 31%)}
.cover span{font:700 48px/1 "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif;letter-spacing:.04em;text-shadow:0 2px 8px rgb(0 0 0/.18)}
.cover.long span{font-size:34px}
.body{display:flex;flex-direction:column;gap:4px;flex:1;padding:14px 16px 16px}
.body h2{margin:0;font-size:17px;line-height:1.3}
.body time{color:var(--muted);font-size:13px}
.actions{display:flex;gap:8px;margin-top:auto;padding-top:12px}
.play{flex:1;padding:9px 12px;border-radius:10px;background:var(--accent);color:#fff;font-weight:600;text-align:center;text-decoration:none;white-space:nowrap}
.play:hover{background:var(--accent-hover)}
.none{display:none;padding:24px;text-align:center;color:var(--muted)}
`;

const LIBRARY_SCRIPT = `
const q=document.getElementById("q"),cards=[...document.querySelectorAll(".lesson")],none=document.querySelector(".none");
const fold=s=>s.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/đ/g,"d").toLowerCase();
q&&q.addEventListener("input",()=>{const t=fold(q.value.trim());let n=0;for(const c of cards){const ok=!t||fold(c.dataset.search).includes(t);c.hidden=!ok;if(ok)n++}none.style.display=n?"none":"block"});
`;

export function libraryPage(entries: LessonEntry[]): string {
  const sorted = [...entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const cards = sorted
    .map((e) => {
      const href = `/l/${e.id}`;
      const glyph = e.hanzi || [...e.title.trim()][0]?.toUpperCase() || "课";
      return `<li class="lesson" data-search="${escapeHtml(`${e.title} ${e.hanzi ?? ""}`)}">
<a class="cover${[...glyph].length > 3 ? " long" : ""}" href="${href}" style="background-color:${colorFor(e.id)}" aria-hidden="true" tabindex="-1"><span>${escapeHtml(glyph)}</span></a>
<div class="body"><h2>${escapeHtml(e.title)}</h2><time datetime="${escapeHtml(e.updatedAt)}">Cập nhật ${escapeHtml(formatTime(e.updatedAt))}</time>
<div class="actions"><a class="play" href="${href}">▶ Trình chiếu</a><button type="button" class="copy" data-href="${href}">Chép link</button></div></div></li>`;
    })
    .join("");
  const content = sorted.length
    ? `<div class="tools"><input id="q" type="search" placeholder="Tìm bài…" aria-label="Tìm bài"><span class="count">${sorted.length} bài</span></div>
<ul class="grid">${cards}</ul><p class="none">Không có bài nào khớp.</p>`
    : `<div class="empty"><div class="mark">课</div><strong>Chưa có bài nào trên web</strong>Mở bài trong ứng dụng và bấm “Đăng lên web”.</div>`;
  return teacherPage("Bài học của tôi", "lessons", LIBRARY_CSS, content, sorted.length ? LIBRARY_SCRIPT : "");
}

// Results --------------------------------------------------------------------

export interface ResultsSummary {
  id: string;
  slug: string;
  title: string;
  lessonTitle: string;
  /** Taking hand-ins: not closed by the teacher, and before the deadline. */
  open: boolean;
  closesAt: string | null;
  /** Hand-ins with written answers still to grade. */
  toGrade: number;
  submitted: number;
  students: number;
  avgPercent: number | null;
  lastSubmitted: string | null;
}

export interface ResultsAttempt {
  id: string;
  name: string;
  clientId: string;
  score: number;
  max: number;
  percent: number;
  startedAt: string;
  submittedAt: string;
  /** Handed in after the time limit or the deadline. */
  late: boolean;
  /** Points of written answers still to grade. */
  pending: number;
}

/** How one question went across every hand-in. */
export interface QuestionStat {
  number: number;
  kind: string;
  line: string;
  correct: number;
  partial: number;
  wrong: number;
  blank: number;
  pending: number;
  /** Share of its points earned, 0–100; null before any hand-in. */
  percent: number | null;
}

/** An ISO time as the value of a `datetime-local` field, in Vietnam time. */
export function vietnamInputValue(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 16);
}

function openState(open: boolean, closesAt: string | null): string {
  if (!open) return `<span class="pill fail">Đã đóng nhận bài</span>`;
  return closesAt ? `<span class="pill pass">Nhận bài đến ${escapeHtml(formatTime(closesAt))}</span>` : `<span class="pill pass">Đang nhận bài</span>`;
}

const RESULTS_CSS = `
.assignments{display:grid;gap:14px;margin:0;padding:0;list-style:none}
.assignment{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;padding:16px 18px;border:1px solid var(--border);border-radius:16px;background:var(--panel);box-shadow:var(--shadow)}
.assignment h2{margin:0;font-size:17px}
.assignment .info{flex:1;min-width:220px}
.assignment .info p{margin:2px 0 0}
.stat{display:flex;gap:16px}
.stat span{display:grid;text-align:center;font-size:12px;color:var(--muted)}
.stat strong{font-size:20px;color:var(--text)}
.open{padding:9px 14px;border:0;border-radius:10px;background:var(--accent);color:#fff;font-weight:600;text-decoration:none;white-space:nowrap;cursor:pointer}
.open:hover{background:var(--accent-hover)}
.summary{display:flex;flex-wrap:wrap;align-items:center;gap:12px 24px;margin-bottom:18px}
.summary h2{margin:0}
.summary p{margin:2px 0 0}
.summary .stat{margin-left:auto}
.linkbox{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 18px;padding:12px 14px;border:1px dashed var(--border);border-radius:14px}
.linkbox code{flex:1;min-width:200px;overflow-wrap:anywhere;font-size:14px}
.table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:16px;background:var(--panel)}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:10px 14px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}
th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
tr:last-child td{border-bottom:0}
td.name{white-space:normal;font-weight:600}
.pill{display:inline-block;padding:1px 9px;border-radius:999px;font-size:12px;font-weight:700}
.pass{background:rgb(47 133 90/.14);color:#2f855a}
.fail{background:rgb(192 57 43/.12);color:#c0392b}
.late{background:#fff4d6;color:#8a5a00}
.back{display:inline-block;margin-bottom:12px;color:var(--accent);text-decoration:none;font-weight:600}
.controls{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 18px}
.controls input{padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--panel)}
.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 14px}
.table-wrap+.toolbar{margin:14px 0 0}
h3{margin:28px 0 10px;font-size:16px}
td.answer{white-space:normal;min-width:120px}
td.name a{color:inherit}
.points{width:64px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--panel)}
.danger-zone{margin-top:28px}
.copy.danger{border-color:#c0392b;color:#c0392b}
.assignment .info p:last-child{margin-top:6px}
`;

export function resultsListPage(rows: ResultsSummary[]): string {
  const items = rows
    .map(
      (r) => `<li class="assignment"><div class="info"><h2>${escapeHtml(r.title)}</h2>
<p class="muted">${r.lessonTitle ? `${escapeHtml(r.lessonTitle)} · ` : ""}${r.lastSubmitted ? `Nộp gần nhất ${escapeHtml(formatTime(r.lastSubmitted))}` : "Chưa có bài nộp"}</p>
<p>${openState(r.open, r.closesAt)}${r.toGrade ? ` <span class="pill late">${r.toGrade} bài chờ chấm</span>` : ""}</p></div>
<div class="stat"><span><strong>${r.submitted}</strong>bài nộp</span><span><strong>${r.students}</strong>học viên</span><span><strong>${r.avgPercent === null ? "–" : `${r.avgPercent}%`}</strong>điểm TB</span></div>
<button type="button" class="copy" data-href="/a/${escapeHtml(r.slug)}">Chép link học viên</button><a class="open" href="/results/${escapeHtml(r.id)}">Xem điểm</a></li>`,
    )
    .join("");
  const content = rows.length
    ? `<p class="toolbar"><a class="copy" href="/results/export.json" download>Tải bản sao lưu (toàn bộ đề và bài nộp)</a></p><ul class="assignments">${items}</ul>`
    : `<div class="empty"><div class="mark">题</div><strong>Chưa giao bài tập nào</strong>Trong ứng dụng, mở chế độ Bài tập của một bài và bấm “Giao bài”.</div>`;
  return teacherPage("Bảng điểm", "results", RESULTS_CSS, content);
}

function seconds(fromIso: string, toIso: string): number {
  return Math.max(0, (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000);
}

function took(total: number): string {
  const s = Math.round(total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} giờ ${m} phút` : m ? `${m} phút ${s % 60} giây` : `${s} giây`;
}

export interface ResultsHeader {
  /** This server's address, to show the students' link in full. */
  origin: string;
  id: string;
  slug: string;
  /** Closed by the teacher, regardless of the deadline. */
  closed: boolean;
  open: boolean;
  closesAt: string | null;
  title: string;
  lessonTitle: string;
  /** Minutes; 0 means none. */
  timeLimit: number;
  /** Percent; 0 means none. */
  passPercent: number;
  inProgress: number;
}

function statsTable(stats: QuestionStat[]): string {
  if (!stats.some((s) => s.percent !== null)) return "";
  const rows = stats
    .map((s) => {
      const low = s.percent !== null && s.percent < 50;
      return `<tr><td>${s.number}</td><td class="muted">${escapeHtml(s.kind)}</td><td class="name">${escapeHtml(s.line)}</td><td>${s.correct}</td><td>${s.partial}</td><td>${s.wrong}</td><td>${s.blank}</td>${
        s.pending ? `<td><span class="pill late">${s.pending} chờ chấm</span></td>` : "<td></td>"
      }<td>${s.percent === null ? "–" : `<span class="pill ${low ? "fail" : "pass"}">${s.percent}%</span>`}</td></tr>`;
    })
    .join("");
  return `<h3>Thống kê theo câu</h3><div class="table-wrap"><table><thead><tr><th>Câu</th><th>Dạng</th><th>Câu hỏi</th><th>Đúng</th><th>Một phần</th><th>Sai</th><th>Bỏ trống</th><th></th><th>Điểm đạt</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function resultsPage(header: ResultsHeader, attempts: ResultsAttempt[], stats: QuestionStat[] = []): string {
  // The nth time this browser handed the exercise in, counted from the first.
  const nth = new Map<ResultsAttempt, number>();
  const counts = new Map<string, number>();
  for (const a of [...attempts].sort((x, y) => x.submittedAt.localeCompare(y.submittedAt))) {
    const n = (counts.get(a.clientId) ?? 0) + 1;
    counts.set(a.clientId, n);
    nth.set(a, n);
  }
  const avg = attempts.length ? Math.round(attempts.reduce((n, a) => n + a.percent, 0) / attempts.length) : null;
  const rows = attempts
    .map((a) => {
      const time = seconds(a.startedAt, a.submittedAt);
      const late = a.late;
      const passed = a.percent >= header.passPercent;
      const pass = header.passPercent > 0 && !a.pending ? ` <span class="pill ${passed ? "pass" : "fail"}">${passed ? "Đạt" : "Chưa đạt"}</span>` : "";
      const pending = a.pending ? ' <span class="pill late">Chờ chấm</span>' : "";
      return `<tr><td class="name"><a href="/results/${escapeHtml(header.id)}/attempts/${escapeHtml(a.id)}">${escapeHtml(a.name)}</a>${pending}</td><td>${a.score}/${a.max}</td><td>${a.percent}%${pass}</td>
<td>${took(time)}${late ? ' <span class="pill late">Nộp trễ</span>' : ""}</td><td>${escapeHtml(formatTime(a.submittedAt))}</td><td>${nth.get(a)}</td></tr>`;
    })
    .join("");
  const slug = escapeHtml(header.slug);
  const content = `<a class="back" href="/results">← Tất cả bài tập</a>
<div class="summary"><div><h2>${escapeHtml(header.title)}</h2><p class="muted">${[
    header.lessonTitle && escapeHtml(header.lessonTitle),
    header.timeLimit ? `${header.timeLimit} phút` : "Không giới hạn thời gian",
    header.passPercent ? `Điểm đạt ${header.passPercent}%` : "",
  ]
    .filter(Boolean)
    .join(" · ")}</p></div>
<div class="stat"><span><strong>${attempts.length}</strong>bài nộp</span><span><strong>${counts.size}</strong>học viên</span><span><strong>${avg === null ? "–" : `${avg}%`}</strong>điểm TB</span><span><strong>${header.inProgress}</strong>đang làm</span></div></div>
<div class="linkbox"><span class="muted">Link cho học viên:</span><code>${escapeHtml(header.origin)}/a/${slug}</code><button type="button" class="copy" data-href="/a/${slug}">Chép link</button></div>
<form class="controls" method="post" action="/results/${escapeHtml(header.id)}/settings">
<span>${openState(header.open, header.closesAt)}</span>
${header.closed ? `<button class="copy" name="action" value="open">Mở lại nhận bài</button>` : `<button class="copy" name="action" value="close">Đóng nhận bài</button>`}
<label class="muted">Hạn nộp <input type="datetime-local" name="deadline" value="${header.closesAt ? vietnamInputValue(header.closesAt) : ""}"></label>
<button class="copy" name="action" value="deadline">Lưu hạn nộp</button>
${header.closesAt ? `<button class="copy" name="action" value="clear-deadline">Bỏ hạn nộp</button>` : ""}
</form>
${
  attempts.length
    ? `<p class="toolbar"><a class="copy" href="/results/${escapeHtml(header.id)}/csv" download>Tải bảng điểm (CSV)</a> <span class="muted">Bấm tên học viên để xem bài làm.</span></p>
<div class="table-wrap"><table><thead><tr><th>Học viên</th><th>Điểm</th><th>%</th><th>Thời gian làm</th><th>Nộp lúc</th><th>Lần</th></tr></thead><tbody>${rows}</tbody></table></div>
${statsTable(stats)}`
    : `<div class="empty"><strong>Chưa có bài nộp</strong>Gửi link cho học viên; bài nộp sẽ hiện ở đây.</div>`
}
<form class="danger-zone" method="post" action="/results/${escapeHtml(header.id)}/delete" onsubmit="return confirm('Gỡ bài tập này khỏi web? Link sẽ không mở được nữa và mọi bài nộp bị xoá.')">
<button class="copy danger">Gỡ bài tập khỏi web</button> <span class="muted">Link không mở được nữa; mọi bài nộp bị xoá. Tải bảng điểm trước nếu cần giữ.</span>
</form>`;
  return teacherPage("Bảng điểm", "results", RESULTS_CSS, content);
}

/** One question of a hand-in, as the teacher sees it. */
export interface AttemptQuestion {
  id: string;
  number: number;
  kind: string;
  line: string;
  given: string;
  expected: string;
  status: "correct" | "partial" | "wrong" | "blank" | "pending";
  earned: number;
  points: number;
  /** Written answers take the teacher's points. */
  byHand: boolean;
  /** Taken out of the exercise after this hand-in; its points still count. */
  removed: boolean;
}

const STATUS_TEXT: Record<AttemptQuestion["status"], string> = {
  correct: '<span class="pill pass">Đúng</span>',
  partial: '<span class="pill late">Một phần</span>',
  wrong: '<span class="pill fail">Sai</span>',
  blank: '<span class="muted">Bỏ trống</span>',
  pending: '<span class="pill late">Chờ chấm</span>',
};

export function attemptPage(
  header: {
    assignmentId: string;
    attemptId: string;
    title: string;
    name: string;
    score: number;
    max: number;
    percent: number;
    /** Percent; 0 means none. */
    passPercent: number;
    startedAt: string;
    submittedAt: string;
    late: boolean;
    pending: number;
  },
  questions: AttemptQuestion[],
): string {
  const base = `/results/${escapeHtml(header.assignmentId)}/attempts`;
  const verdict = header.pending ? "tạm tính" : header.passPercent ? (header.percent >= header.passPercent ? "đạt" : "chưa đạt") : "tỉ lệ";
  const rows = questions
    .map((q) => {
      const points = q.byHand
        ? `<input class="points" type="number" name="${escapeHtml(q.id)}" form="grade" min="0" max="${q.points}" step="1" value="${q.status === "pending" ? "" : q.earned}" placeholder="?"> / ${q.points}`
        : `${q.earned}/${q.points}`;
      const line = q.removed ? '<span class="muted">Câu đã bỏ khỏi đề</span>' : escapeHtml(q.line);
      return `<tr><td>${q.number}</td><td class="muted">${escapeHtml(q.kind)}</td><td class="name">${line}</td><td class="answer">${escapeHtml(q.given) || '<span class="muted">—</span>'}</td><td class="answer">${escapeHtml(q.expected) || '<span class="muted">—</span>'}</td><td>${STATUS_TEXT[q.status]}</td><td>${points}</td></tr>`;
    })
    .join("");
  const byHand = questions.some((q) => q.byHand);
  const content = `<a class="back" href="/results/${escapeHtml(header.assignmentId)}">← ${escapeHtml(header.title)}</a>
<div class="summary"><div><h2>${escapeHtml(header.name)}</h2><p class="muted">Nộp lúc ${escapeHtml(formatTime(header.submittedAt))} · làm trong ${took(seconds(header.startedAt, header.submittedAt))}${
    header.late ? ' · <span class="pill late">Nộp trễ</span>' : ""
  }</p></div>
<div class="stat"><span><strong>${header.score}/${header.max}</strong>điểm</span><span><strong>${header.percent}%</strong>${verdict}</span>${header.pending ? `<span><strong>${header.pending}</strong>điểm chờ chấm</span>` : ""}</div></div>
<div class="table-wrap"><table><thead><tr><th>Câu</th><th>Dạng</th><th>Câu hỏi</th><th>Em trả lời</th><th>Đáp án</th><th></th><th>Điểm</th></tr></thead><tbody>${rows}</tbody></table></div>
${
  byHand
    ? `<form id="grade" class="toolbar" method="post" action="${base}/${escapeHtml(header.attemptId)}/grade"><button class="open">Lưu điểm phần tự luận</button> <span class="muted">Điểm tổng được tính lại; học viên mở lại link sẽ thấy điểm mới.</span></form>`
    : ""
}
<form class="danger-zone" method="post" action="${base}/${escapeHtml(header.attemptId)}/delete" onsubmit="return confirm('Xoá bài nộp này?')"><button class="copy danger">Xoá bài nộp này</button></form>`;
  return teacherPage("Bài làm", "results", RESULTS_CSS, content);
}
