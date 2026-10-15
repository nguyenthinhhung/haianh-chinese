import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { availableMonitors, currentMonitor, getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import { isTauri } from "./index";

/**
 * A second display for presenting: the slides go full screen on the projector
 * while the teacher keeps the presenter view on the laptop, as in PowerPoint.
 * The two pages talk through messages only; neither reaches into the other.
 */
export interface Screens {
  /** True when another display (a projector in Extend mode) is connected. */
  hasSecondScreen(): Promise<boolean>;
  /**
   * Opens a new audience page full screen on the other display, or with
   * `windowed` as an ordinary window on this one, for a video call to share.
   */
  openAudience(options?: { windowed?: boolean }): Promise<Channel>;
  /** The presenter's end of the channel, for the audience page itself. */
  presenter(): Channel;
}

export interface Channel {
  send(message: unknown): void;
  /** Returns a function that stops listening. */
  listen(handler: (message: unknown) => void): () => void;
  /** Closes the audience window; a no-op on the audience side. */
  close(): void;
}

/** Query string that turns the app page into the audience page. */
const AUDIENCE_VIEW = "audience";
/** Audience windows are `audience-<id>`; the capability grants that pattern. */
const AUDIENCE_PREFIX = "audience-";

export function isAudiencePage(): boolean {
  return new URLSearchParams(location.search).get("view") === AUDIENCE_VIEW;
}

export function createScreens(): Screens {
  return isTauri() ? tauriScreens() : browserScreens();
}

/**
 * Every show gets its own window and its own pair of event names, so a
 * window still closing from an earlier show (or from React running effects
 * twice in development) can never talk to the current one.
 */
const toAudience = (id: string) => `present-to-${id}`;
const toPresenter = (id: string) => `present-from-${id}`;
const newId = () => `${AUDIENCE_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function tauriScreens(): Screens {
  function channel(outgoing: string, incoming: string, close: () => void): Channel {
    return {
      send: (message) => void emit(outgoing, message),
      listen(handler) {
        let stop: (() => void) | null = null;
        let stopped = false;
        void listen(incoming, (e) => handler(e.payload)).then((un) => {
          if (stopped) un();
          else stop = un;
        });
        return () => {
          stopped = true;
          stop?.();
        };
      },
      close,
    };
  }

  async function otherMonitor() {
    const [all, here] = await Promise.all([availableMonitors(), currentMonitor()]);
    return all.find((m) => !here || m.position.x !== here.position.x || m.position.y !== here.position.y) ?? null;
  }

  return {
    async hasSecondScreen() {
      return (await otherMonitor()) !== null;
    },
    async openAudience({ windowed = false } = {}) {
      const monitor = windowed ? null : await otherMonitor();
      const label = newId();
      const at = monitor?.position.toLogical(monitor.scaleFactor);
      const audience = new WebviewWindow(label, {
        url: `index.html?view=${AUDIENCE_VIEW}`,
        title: "Trình chiếu",
        ...(at ? { x: at.x, y: at.y } : { center: true }),
        width: 1280,
        height: 720,
        visible: false,
        focus: false,
        decorations: windowed,
        backgroundColor: "#000000",
      });
      await new Promise<void>((resolve, reject) => {
        void audience.once("tauri://created", () => resolve());
        void audience.once("tauri://error", (e) => reject(new Error(String(e.payload))));
      });
      try {
        // Placed in physical pixels too: logical positions are ambiguous when
        // the two displays use different scaling.
        if (monitor) await audience.setPosition(new PhysicalPosition(monitor.position.x, monitor.position.y));
        if (!windowed) await audience.setFullscreen(true);
        await audience.show();
        // The teacher keeps typing on the laptop; the clicker's keys go there too.
        await getCurrentWindow().setFocus();
      } catch (e) {
        void audience.destroy();
        throw e;
      }
      return channel(toAudience(label), toPresenter(label), () => void audience.destroy());
    },
    presenter() {
      const label = getCurrentWindow().label;
      return channel(toPresenter(label), toAudience(label), () => {});
    },
  };
}

/** For UI work in a browser: a popup window stands in for the projector. */
function browserScreens(): Screens {
  function channel(outgoing: string, incoming: string, close: () => void): Channel {
    const port = new BroadcastChannel("lesson-studio-present");
    return {
      send: (message) => port.postMessage({ to: outgoing, message }),
      listen(handler) {
        const onMessage = (e: MessageEvent<{ to: string; message: unknown }>) => {
          if (e.data?.to === incoming) handler(e.data.message);
        };
        port.addEventListener("message", onMessage);
        return () => port.removeEventListener("message", onMessage);
      },
      close,
    };
  }

  return {
    async hasSecondScreen() {
      // Chromium tells whether the desktop spans several displays.
      return (screen as Screen & { isExtended?: boolean }).isExtended === true;
    },
    async openAudience() {
      const id = newId();
      const popup = window.open(`${location.pathname}?view=${AUDIENCE_VIEW}&id=${id}`, id, "popup,width=1280,height=720");
      return channel(toAudience(id), toPresenter(id), () => popup?.close());
    },
    presenter() {
      const id = new URLSearchParams(location.search).get("id") ?? "";
      return channel(toPresenter(id), toAudience(id), () => {});
    },
  };
}
