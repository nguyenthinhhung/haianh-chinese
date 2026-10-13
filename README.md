# Chinese Lesson Studio

Offline-first desktop app (Tauri 2 + React + TypeScript) for teachers to build
and present Chinese lessons for children. Design decisions: [ARCHITECTURE.md](ARCHITECTURE.md).

Current state: roadmap phases 1–2 done on Windows (editor, safe save, drafts and
recovery, undo/redo, lesson management), plus web image search and Chinese
text-to-speech. Status per phase: [ARCHITECTURE.md §8.1](ARCHITECTURE.md).

## Requirements

- Node.js 20+
- Rust 1.89+ (`rustup`) and the Tauri prerequisites for your OS
  (Windows: MSVC Build Tools + WebView2; macOS: Xcode Command Line Tools)

## Commands

```bash
npm install
npm test             # Vitest: core, renderer, templates
npm run typecheck
npm run tauri dev    # desktop app
npm run tauri build  # NSIS installer (Windows) / .app + .dmg (macOS)
npm run dev          # UI only, in a browser; lessons kept in localStorage
```

## Layout

| Path | Contents |
| --- | --- |
| `src/core/` | Zod schema, validation, commands, codec, migrations, registries — no React/Tauri |
| `src/renderer/` | Shared 16:9 stage CSS, render functions, presentation runtime (`runtime/core.js`) |
| `src/templates/<type>/` | One slide type per folder (schema, render, CSS, editor spec, interaction); auto-discovered |
| `src/themes/<id>/` | One theme per folder; auto-discovered |
| `src/platform/` | `Persistence` interface; Tauri bridge and browser dev stand-in |
| `src/ui/` | React screens: Library, Editor, auto-built Properties panel |
| `src-tauri/` | Rust: atomic write, backups, drafts, locks, asset import and shrinking, confined to the library; `web.rs` holds the only network calls (Bing image search, image download, Google Translate speech) |

## Third-party assets

- Nunito (Latin, Latin Extended, Vietnamese subsets) — SIL Open Font License 1.1,
  via `@fontsource-variable/nunito`, embedded in every lesson file.
- Theme decorations and the app icon were drawn for this project.
