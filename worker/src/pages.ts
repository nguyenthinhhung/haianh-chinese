/** The teacher's pages on the web: sign-in and the list of published lessons. */

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

const LIBRARY_CSS = `
header{background:linear-gradient(135deg,#c8102e,#9e0c24);color:#fff}
.bar{display:flex;align-items:center;gap:14px;max-width:1080px;margin:0 auto;padding:20px 24px}
.bar h1{margin:0;font-size:20px}
.bar p{margin:0;opacity:.85;font-size:13px}
.bar form{margin-left:auto}
.ghost{padding:8px 14px;border:1px solid rgb(255 255 255/.45);border-radius:10px;background:transparent;color:#fff;cursor:pointer}
.ghost:hover{background:rgb(255 255 255/.12)}
main{max-width:1080px;margin:0 auto;padding:24px}
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
.play,.copy{white-space:nowrap}
.play{flex:1;padding:9px 12px;border-radius:10px;background:var(--accent);color:#fff;font-weight:600;text-align:center;text-decoration:none}
.play:hover{background:var(--accent-hover)}
.copy{padding:9px 12px;border:1px solid var(--border);border-radius:10px;background:var(--panel);cursor:pointer}
.copy:hover{border-color:var(--muted)}
.empty{padding:56px 24px;border:2px dashed var(--border);border-radius:20px;text-align:center;color:var(--muted)}
.empty .mark{margin:0 auto 14px;background:var(--accent);color:#fff}
.empty strong{display:block;margin-bottom:6px;color:var(--text);font-size:17px}
.none{display:none;padding:24px;text-align:center;color:var(--muted)}
@media (max-width:520px){.bar{padding:16px}main{padding:16px}.bar p{display:none}}
`;

const LIBRARY_SCRIPT = `
const q=document.getElementById("q"),cards=[...document.querySelectorAll(".lesson")],none=document.querySelector(".none");
const fold=s=>s.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/đ/g,"d").toLowerCase();
q&&q.addEventListener("input",()=>{const t=fold(q.value.trim());let n=0;for(const c of cards){const ok=!t||fold(c.dataset.search).includes(t);c.hidden=!ok;if(ok)n++}none.style.display=n?"none":"block"});
document.addEventListener("click",async e=>{const b=e.target.closest(".copy");if(!b)return;try{await navigator.clipboard.writeText(location.origin+b.dataset.href);b.textContent="Đã chép";setTimeout(()=>b.textContent="Chép link",1500)}catch{prompt("Sao chép link:",location.origin+b.dataset.href)}});
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
  return page(
    "Bài học · Chinese Lesson Studio",
    LIBRARY_CSS,
    `<header><div class="bar"><div class="mark">汉</div><div><h1>Bài học của tôi</h1><p>Chinese Lesson Studio</p></div>
<form method="post" action="/logout"><button class="ghost">Đăng xuất</button></form></div></header>
<main>${content}</main>`,
    sorted.length ? LIBRARY_SCRIPT : "",
  );
}
