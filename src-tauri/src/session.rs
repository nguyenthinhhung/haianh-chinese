//! Drafts (unsaved edits, written continuously) and per-lesson locks.

use crate::error::{AppError, AppResult};
use crate::fsutil::{atomic_write, modified_ms};
use crate::state::{check_lesson_id, AppState};
use serde::Serialize;
use std::fs::{self, File, OpenOptions, TryLockError};
use std::io::ErrorKind;
use tauri::State;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    json: String,
    modified_ms: u64,
}

#[tauri::command]
pub async fn write_draft(state: State<'_, AppState>, lesson_id: String, json: String) -> AppResult<()> {
    check_lesson_id(&lesson_id)?;
    let dir = state.drafts_dir();
    fs::create_dir_all(&dir)?;
    atomic_write(&dir.join(format!("{lesson_id}.json")), json.as_bytes())?;
    Ok(())
}

#[tauri::command]
pub async fn read_draft(state: State<'_, AppState>, lesson_id: String) -> AppResult<Option<Draft>> {
    check_lesson_id(&lesson_id)?;
    let path = state.drafts_dir().join(format!("{lesson_id}.json"));
    match fs::read_to_string(&path) {
        Ok(json) => Ok(Some(Draft { json, modified_ms: modified_ms(&path)? })),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

#[tauri::command]
pub async fn delete_draft(state: State<'_, AppState>, lesson_id: String) -> AppResult<()> {
    check_lesson_id(&lesson_id)?;
    match fs::remove_file(state.drafts_dir().join(format!("{lesson_id}.json"))) {
        Err(e) if e.kind() != ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}

/// Takes an OS-level lock on `locks/<id>.lock` and hands over its handle,
/// taking it out of this process's lock table if it was there. `None` means
/// another window or process holds it. The OS drops the lock when the
/// process dies, so a crash never leaves a lesson stuck as "open".
pub fn lock_lesson(state: &AppState, lesson_id: &str) -> AppResult<Option<File>> {
    let mut locks = state.locks.lock().map_err(|_| AppError::new("io", "lock table poisoned"))?;
    if let Some(file) = locks.remove(lesson_id) {
        return Ok(Some(file));
    }
    let dir = state.locks_dir();
    fs::create_dir_all(&dir)?;
    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(false)
        .open(dir.join(format!("{lesson_id}.lock")))?;
    match file.try_lock() {
        Ok(()) => Ok(Some(file)),
        Err(TryLockError::WouldBlock) => Ok(None),
        Err(TryLockError::Error(e)) => Err(e.into()),
    }
}

/// Re-acquiring a lock this process already holds succeeds.
#[tauri::command]
pub async fn acquire_lock(state: State<'_, AppState>, lesson_id: String) -> AppResult<bool> {
    check_lesson_id(&lesson_id)?;
    let Some(file) = lock_lesson(&state, &lesson_id)? else { return Ok(false) };
    state.locks.lock().map_err(|_| AppError::new("io", "lock table poisoned"))?.insert(lesson_id, file);
    Ok(true)
}

#[tauri::command]
pub async fn release_lock(state: State<'_, AppState>, lesson_id: String) -> AppResult<()> {
    let mut locks = state.locks.lock().map_err(|_| AppError::new("io", "lock table poisoned"))?;
    // Dropping the handle releases the OS lock.
    locks.remove(&lesson_id);
    Ok(())
}
