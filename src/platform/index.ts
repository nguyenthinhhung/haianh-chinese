import { createBrowserPersistence } from "./browser";
import type { Persistence } from "./persistence";
import { createTauriPersistence } from "./tauri";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function createPersistence(): Persistence {
  return isTauri() ? createTauriPersistence() : createBrowserPersistence();
}
