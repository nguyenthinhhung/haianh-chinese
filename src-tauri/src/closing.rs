//! Closing the main window. The page saves the open lesson before the window
//! goes, so Rust asks it first; but a page that cannot answer (reloaded onto
//! an error page, crashed, or stuck) must never keep the window open. The
//! page acknowledges at once and closes when done; without an acknowledgement
//! the window closes after a short wait. The lesson's draft, written every
//! second while editing, is offered for recovery next time.
//!
//! Only the main window holds a lesson. Other windows (the slide show on a
//! projector) close at once, and go with the main window.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{Emitter, Manager, Window, WindowEvent};

const MAIN: &str = "main";

/// Event the page listens for; it answers with `close_ack`, then `close_window`.
const CLOSE_REQUESTED: &str = "app-close-requested";
/// How long a page has to acknowledge before the window closes without it.
const ACK_TIMEOUT: Duration = Duration::from_secs(3);

/// Set once closing is decided, so the next close request is let through.
static CLOSING: AtomicBool = AtomicBool::new(false);
/// Whether the page acknowledged the latest close request.
static ACKED: AtomicBool = AtomicBool::new(false);

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != MAIN {
        return;
    }
    if let WindowEvent::Destroyed = event {
        for (label, other) in window.app_handle().webview_windows() {
            if label != MAIN {
                let _ = other.destroy();
            }
        }
        return;
    }
    let WindowEvent::CloseRequested { api, .. } = event else { return };
    if CLOSING.load(Ordering::SeqCst) {
        return;
    }
    api.prevent_close();
    ACKED.store(false, Ordering::SeqCst);
    if window.emit_to(MAIN, CLOSE_REQUESTED, ()).is_err() {
        close(window);
        return;
    }
    let window = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(ACK_TIMEOUT).await;
        if !ACKED.load(Ordering::SeqCst) {
            close(&window);
        }
    });
}

fn close(window: &Window) {
    CLOSING.store(true, Ordering::SeqCst);
    let _ = window.destroy();
}

/// The page has the close request and is saving; it closes or stays itself.
#[tauri::command]
pub fn close_ack() {
    ACKED.store(true, Ordering::SeqCst);
}

/// The page is done (lesson saved, or the teacher closes anyway).
#[tauri::command]
pub fn close_window(window: Window) {
    close(&window);
}
