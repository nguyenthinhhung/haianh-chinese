//! Moving lessons in and out of the library: the single-file export for a
//! classroom computer, and opening a lesson file from elsewhere.

use crate::assets::sniff_image;
use crate::error::{AppError, AppResult};
use crate::fsutil::atomic_write;
use crate::state::AppState;
use base64::Engine;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::ipc::Request;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

/// Lesson files from outside the library; exports with many photos are big.
const MAX_LESSON_FILE_BYTES: u64 = 200 * 1024 * 1024;
const MAX_ASSET_BYTES: usize = 30 * 1024 * 1024;

/// `assets/<name>` with a plain file name, like `isSafeAssetPath` in the
/// frontend. Returns the name.
fn safe_asset_name(file: &str) -> AppResult<&str> {
    let name = file
        .strip_prefix("assets/")
        .ok_or_else(|| AppError::new("invalid-path", "Đường dẫn tài nguyên không hợp lệ."))?;
    let ok = !name.is_empty()
        && name.len() <= 128
        && !name.starts_with('.')
        && !name.contains("..")
        && name.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'));
    if ok {
        Ok(name)
    } else {
        Err(AppError::new("invalid-path", "Đường dẫn tài nguyên không hợp lệ."))
    }
}

/// Identifies audio by its content: MP3, M4A/AAC in MP4, ADTS AAC or WAV.
fn sniff_audio(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"ID3") || (bytes.len() >= 2 && bytes[0] == 0xFF && (bytes[1] & 0xE0) == 0xE0) {
        // ADTS AAC shares the MP3 frame sync; its layer bits are zero.
        if bytes.len() >= 2 && bytes[0] == 0xFF && (bytes[1] & 0xF6) == 0xF0 {
            return Some("audio/aac");
        }
        return Some("audio/mpeg");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE" {
        return Some("audio/wav");
    }
    if bytes.len() >= 8 && &bytes[4..8] == b"ftyp" {
        return Some("audio/mp4");
    }
    None
}

fn media_type(bytes: &[u8]) -> Option<&'static str> {
    sniff_image(bytes).map(|(_, mime)| mime).or_else(|| sniff_audio(bytes))
}

/// The lesson's asset files as `data:` URLs, keyed by their `assets/…` path,
/// for embedding in an exported file. Files that are missing or not a known
/// image or audio type are left out.
#[tauri::command]
pub async fn read_assets_data(
    state: State<'_, AppState>,
    dir: String,
    files: Vec<String>,
) -> AppResult<HashMap<String, String>> {
    let lesson = state.lesson_dir(&dir)?;
    let mut out = HashMap::new();
    for file in files {
        let Ok(name) = safe_asset_name(&file) else { continue };
        let Ok(bytes) = fs::read(lesson.join("assets").join(name)) else { continue };
        let Some(mime) = media_type(&bytes) else { continue };
        let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
        out.insert(file, format!("data:{mime};base64,{data}"));
    }
    Ok(out)
}

/// Asks where to save the exported lesson and writes it. `None` if cancelled.
#[tauri::command]
pub async fn save_export(app: AppHandle, html: String, file_name: String) -> AppResult<Option<String>> {
    let picked = app
        .dialog()
        .file()
        .set_title("Xuất bài học thành một file")
        .set_file_name(&file_name)
        .add_filter("Trang web (HTML)", &["html"])
        .blocking_save_file();
    let Some(picked) = picked else { return Ok(None) };
    let mut path = picked
        .into_path()
        .map_err(|_| AppError::new("invalid-path", "Không ghi được vào vị trí đã chọn."))?;
    if path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()) != Some("html".into()) {
        path.set_extension("html");
    }
    atomic_write(&path, html.as_bytes())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[derive(Serialize)]
pub struct PickedLesson {
    path: String,
    html: String,
}

/// Lets the teacher pick a lesson file from anywhere and returns its text.
/// The path is remembered so that only the `assets/` folder beside this very
/// file can be copied afterwards.
#[tauri::command]
pub async fn pick_lesson_file(app: AppHandle, state: State<'_, AppState>) -> AppResult<Option<PickedLesson>> {
    let picked = app
        .dialog()
        .file()
        .set_title("Mở file bài học")
        .add_filter("Bài học (HTML)", &["html", "htm"])
        .blocking_pick_file();
    let Some(picked) = picked else { return Ok(None) };
    let path = picked
        .into_path()
        .map_err(|_| AppError::new("unsupported-file", "Không đọc được file đã chọn."))?;
    if fs::metadata(&path)?.len() > MAX_LESSON_FILE_BYTES {
        return Err(crate::assets::too_large(MAX_LESSON_FILE_BYTES));
    }
    let html = String::from_utf8(fs::read(&path)?)
        .map_err(|_| AppError::new("unsupported-file", "File không phải văn bản UTF-8."))?;
    *state.picked_lesson.lock().map_err(|_| AppError::new("io", "state poisoned"))? = Some(path.clone());
    Ok(Some(PickedLesson { path: path.to_string_lossy().into_owned(), html }))
}

fn picked_assets_dir(state: &AppState) -> AppResult<PathBuf> {
    let picked = state.picked_lesson.lock().map_err(|_| AppError::new("io", "state poisoned"))?;
    let file = picked.as_ref().ok_or_else(AppError::invalid_path)?;
    Ok(file.parent().unwrap_or(Path::new(".")).join("assets"))
}

/// Copies the listed files from the `assets/` folder beside the lesson file
/// last picked with `pick_lesson_file` into a library lesson. Returns the
/// files copied; missing ones and anything that is not an image or audio
/// are skipped.
#[tauri::command]
pub async fn copy_sibling_assets(state: State<'_, AppState>, dir: String, files: Vec<String>) -> AppResult<Vec<String>> {
    let target = state.lesson_dir(&dir)?.join("assets");
    let source = picked_assets_dir(&state)?;
    fs::create_dir_all(&target)?;
    let mut copied = Vec::new();
    for file in files {
        let Ok(name) = safe_asset_name(&file) else { continue };
        let Ok(bytes) = fs::read(source.join(name)) else { continue };
        if media_type(&bytes).is_none() {
            continue;
        }
        atomic_write(&target.join(name), &bytes)?;
        copied.push(file);
    }
    Ok(copied)
}

/// Writes one asset carried inside an exported file. The raw body is the
/// file; the `x-lesson-dir` and `x-asset-file` headers say where it goes
/// (percent-encoded, as headers are ASCII-only).
#[tauri::command]
pub async fn write_asset(state: State<'_, AppState>, request: Request<'_>) -> AppResult<()> {
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| percent_encoding::percent_decode_str(v).decode_utf8().ok())
            .map(|v| v.into_owned())
            .ok_or_else(AppError::invalid_path)
    };
    let lesson = state.lesson_dir(&header("x-lesson-dir")?)?;
    let file = header("x-asset-file")?;
    let name = safe_asset_name(&file)?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::new("unsupported-file", "Dữ liệu tài nguyên không hợp lệ."));
    };
    if bytes.len() > MAX_ASSET_BYTES || media_type(bytes).is_none() {
        return Err(AppError::new("unsupported-file", "Tài nguyên không phải ảnh hoặc âm thanh."));
    }
    let assets = lesson.join("assets");
    fs::create_dir_all(&assets)?;
    atomic_write(&assets.join(name), bytes)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asset_names() {
        assert_eq!(safe_asset_name("assets/img-3f9a2c0b1d4e.png").unwrap(), "img-3f9a2c0b1d4e.png");
        for bad in ["img.png", "assets/../x.png", "assets/.hidden", "assets/a/b.png", "assets/", "assets/a b.png", "/etc/passwd"] {
            assert!(safe_asset_name(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn media_types() {
        assert_eq!(media_type(b"\x89PNG\r\n\x1a\nrest"), Some("image/png"));
        assert_eq!(media_type(b"ID3\x04rest"), Some("audio/mpeg"));
        assert_eq!(media_type(&[0xFF, 0xF1, 0x50, 0x80]), Some("audio/aac"));
        assert_eq!(media_type(b"RIFF\0\0\0\0WAVEfmt "), Some("audio/wav"));
        assert_eq!(media_type(b"\0\0\0\x20ftypM4A "), Some("audio/mp4"));
        assert_eq!(media_type(b"<svg onload=alert(1)>"), None);
        assert_eq!(media_type(b"<html>"), None);
    }
}
