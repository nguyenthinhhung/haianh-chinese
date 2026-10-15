import { useEffect, useMemo, useRef, useState } from "react";
import type { AnySlideTemplate, TemplateCategory } from "../core/template";
import { matchesQuery } from "../core/textSearch";
import { useServices } from "./services";

const CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: "teach", label: "Dạy" },
  { id: "qa", label: "Hỏi đáp & luyện tập" },
  { id: "game", label: "Trò chơi" },
];

// The slide types this teacher added last, kept on this computer.
const RECENT_KEY = "ls.recentSlideTypes";
const MAX_RECENT = 6;

function loadRecent(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

/** Remembers a slide type as the most recent one. */
export function rememberSlideType(type: string): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([type, ...loadRecent().filter((t) => t !== type)].slice(0, MAX_RECENT)));
  } catch {
    // Only a convenience.
  }
}

interface Props {
  onPick(type: string): void;
  onClose(): void;
}

type Tab = "recent" | TemplateCategory;

/**
 * The "add slide" chooser: slide types by category, the ones used lately
 * first, and a search box, since there are too many for one menu.
 */
export function SlidePicker({ onPick, onClose }: Props) {
  const { templates } = useServices();
  const recent = useMemo(() => loadRecent().map((t) => templates.get(t)).filter((t): t is AnySlideTemplate => !!t), [templates]);
  const [tab, setTab] = useState<Tab>(recent.length ? "recent" : "teach");
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    search.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = query.trim()
    ? templates.list().filter((t) => matchesQuery(`${t.label} ${t.description} ${t.type}`, query))
    : tab === "recent"
      ? recent
      : templates.list(tab);

  const tabs: { id: Tab; label: string; count: number }[] = [
    ...(recent.length ? [{ id: "recent" as const, label: "Dùng gần đây", count: recent.length }] : []),
    ...CATEGORIES.map((c) => ({ ...c, count: templates.list(c.id).length })),
  ];

  return (
    <>
      <div className="slide-picker-backdrop" onMouseDown={onClose} />
      <div className="slide-picker" role="dialog" aria-label="Thêm slide">
        <input
          ref={search}
          className="slide-picker-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && shown[0]) onPick(shown[0].type);
          }}
          placeholder="Tìm dạng slide: hội thoại, bảng, nghe, trò chơi…"
          aria-label="Tìm dạng slide"
        />
        <div className="slide-picker-body">
          <nav className="slide-picker-tabs" aria-label="Nhóm slide">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={!query.trim() && tab === t.id ? "slide-picker-tab current" : "slide-picker-tab"}
                aria-current={!query.trim() && tab === t.id}
                onClick={() => {
                  setQuery("");
                  setTab(t.id);
                }}
              >
                {t.label}
                <span className="muted"> {t.count}</span>
              </button>
            ))}
          </nav>
          <ul className="slide-picker-list" role="menu">
            {shown.map((t) => (
              <li key={t.type}>
                <button type="button" role="menuitem" onClick={() => onPick(t.type)}>
                  <span className="menu-item-label">{t.label}</span>
                  <span className="menu-item-desc">{t.description}</span>
                </button>
              </li>
            ))}
            {!shown.length && <li className="muted slide-picker-empty">Không có dạng slide nào khớp “{query.trim()}”.</li>}
          </ul>
        </div>
      </div>
    </>
  );
}
