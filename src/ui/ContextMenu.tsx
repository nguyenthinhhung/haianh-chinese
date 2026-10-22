import { useEffect } from "react";

export interface MenuItem {
  label: string;
  run(): void;
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
}

interface Props {
  x: number;
  y: number;
  label: string;
  /** "-" draws a separator. */
  items: (MenuItem | "-")[];
  onClose(): void;
}

/** A right-click menu at the pointer; any click elsewhere, Escape, scrolling or resizing closes it. */
export function ContextMenu({ x, y, label, items, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", onClose);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    // Capturing catches scrolling inside any list, not only the page.
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("pointerdown", onClose);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return (
    <div className="context-menu" role="menu" aria-label={label} style={{ left: x, top: Math.min(y, window.innerHeight - 40 - items.length * 30) }}>
      {items.map((item, i) =>
        item === "-" ? (
          <hr key={i} />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={item.danger ? "danger" : undefined}
            disabled={item.disabled}
            // Stopped so the pointerdown that closes the menu doesn't beat the click.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              onClose();
              item.run();
            }}
          >
            <span>{item.label}</span>
            {item.hint && <kbd>{item.hint}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}
