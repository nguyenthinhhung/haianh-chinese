//! Closing the main window. The page saves the open lesson before the window
//! goes, so Rust asks it first; but a page that cannot answer (reloaded onto
//! an error page, crashed, or stuck) must never keep the window open. The
//! page acknowledges at once and closes when done; without an acknowledgement
//! the window closes after a short wait. The lesson's draft, written every
//! second while editing, is offered for recovery next time.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{Emitter, Window, WindowEvent};

/// Event the page listens for; it answers with `close_ack`, then `close_window`.
const CLOSE_REQUESTED: &str = "app-close-requested";
/// How long a page has to acknowledge before the window closes without it.
const ACK_TIMEOUT: Duration = Duration::from_secs(3);

/// Set once closing is decided, so the next close request is let through.
static CLOSING: AtomicBool = AtomicBool::new(false);
/// Whether the page acknowledged the latest close request.
static ACKED: AtomicBool = AtomicBool::new(false);

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else { return };
    if CLOSING.load(Ordering::SeqCst) {
        return;
    }
    api.prevent_close();
    ACKED.store(false, Ordering::SeqCst);
    if window.emit(CLOSE_REQUESTED, ()).is_err() {
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
