const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);

/** Shortcut labels as each OS writes them: `Ctrl+S` on Windows, `⌘S` on macOS. */
export const SHORTCUTS = IS_MAC
  ? { save: "⌘S", undo: "⌘Z", redo: "⇧⌘Z", duplicate: "⌘D" }
  : { save: "Ctrl+S", undo: "Ctrl+Z", redo: "Ctrl+Y", duplicate: "Ctrl+D" };
