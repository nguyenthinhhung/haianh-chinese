use crate::error::{AppError, AppResult};
use crate::fsutil::{atomic_write, modified_ms, sha256_hex};
use crate::state::{check_lesson_id, AppState};
use chrono::{Local, NaiveDate};
use serde::Serialize;
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use tauri::State;
use unicode_normalization::UnicodeNormalization;

const LESSON_FILE: &str = "lesson.html";
const KEEP_RECENT_BACKUPS: usize = 10;
const KEEP_DAILY_BACKUP_DAYS: i64 = 7;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonLocation {
    dir: String,
    folder_name: String,
    /// From the file's `<title>`; `None` when it cannot be read.
    title: Option<String>,
    modified_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonFile {
    html: String,
    hash: String,
    modified_ms: u64,
}

#[derive(Serialize)]
pub struct WriteResult {
    hash: String,
}

/// NFC so names from macOS (which may return NFD) compare equal to typed ones.
fn nfc(s: &str) -> String {
    s.nfc().collect()
}

/// Same comparison the file systems use by default: case-insensitive.
fn name_key(s: &str) -> String {
    nfc(s).to_lowercase()
}

/// Defensive check of a folder name proposed by the frontend, which slugs
/// titles to ASCII (`folderNameFromTitle`: "Hoa quả" → "Hoa-qua").
fn check_folder_name(name: &str) -> AppResult<()> {
    let ok = !name.is_empty()
        && name.len() <= 120
        && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
        && !name.starts_with('-')
        && !name.ends_with('-');
    if ok {
        Ok(())
    } else {
        Err(AppError::new("invalid-path", "Tên thư mục bài học không hợp lệ."))
    }
}

/// Reverses the escaping `esc()` applies in `src/renderer/escape.ts`.
fn unescape_html(s: &str) -> String {
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

/// Reads the lesson title from `<title>`, which the serializer writes near the
/// top of the file, so listing the library never parses whole lessons.
fn read_title(path: &Path) -> Option<String> {
    let mut head = Vec::with_capacity(4096);
    File::open(path).ok()?.take(4096).read_to_end(&mut head).ok()?;
    let head = String::from_utf8_lossy(&head);
    let start = head.find("<title>")? + "<title>".len();
    let end = start + head[start..].find("</title>")?;
    Some(unescape_html(&head[start..end]))
}

fn location(dir: PathBuf, folder_name: String) -> LessonLocation {
    let file = dir.join(LESSON_FILE);
    LessonLocation {
        title: read_title(&file),
        modified_ms: modified_ms(&file).or_else(|_| modified_ms(&dir)).unwrap_or(0),
        dir: dir.to_string_lossy().into_owned(),
        folder_name,
    }
}

/// Creates `<library>/<base>`, or `<base>-2`, `-3`… when the name is taken.
/// Names compare case-insensitively and NFC-normalised, like the file systems do.
fn create_unique_dir(library: &Path, base: &str) -> AppResult<(PathBuf, String)> {
    check_folder_name(base)?;
    fs::create_dir_all(library)?;
    let taken: HashSet<String> = fs::read_dir(library)?
        .filter_map(|e| e.ok())
        .map(|e| name_key(&e.file_name().to_string_lossy()))
        .collect();

    for n in 1..1000 {
        let candidate = if n == 1 { base.to_string() } else { format!("{base}-{n}") };
        if taken.contains(&name_key(&candidate)) {
            continue;
        }
        let dir = library.join(&candidate);
        match fs::create_dir(&dir) {
            Ok(()) => {
                fs::create_dir(dir.join("assets"))?;
                return Ok((dir, candidate));
            }
            Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.into()),
        }
    }
    Err(AppError::new("io", "Không tạo được thư mục bài học."))
}

#[tauri::command]
pub async fn library_dir(state: State<'_, AppState>) -> AppResult<String> {
    Ok(state.library.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn list_lessons(state: State<'_, AppState>) -> AppResult<Vec<LessonLocation>> {
    fs::create_dir_all(&state.library)?;
    let mut lessons = Vec::new();
    for entry in fs::read_dir(&state.library)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        if !entry.path().join(LESSON_FILE).is_file() {
            continue;
        }
        lessons.push(location(entry.path(), nfc(&entry.file_name().to_string_lossy())));
    }
    lessons.sort_by_key(|l| std::cmp::Reverse(l.modified_ms));
    Ok(lessons)
}

#[tauri::command]
pub async fn create_lesson_dir(state: State<'_, AppState>, folder_name: String) -> AppResult<LessonLocation> {
    let (dir, name) = create_unique_dir(&state.library, folder_name.trim())?;
    Ok(location(dir, name))
}

/// Creates a new lesson folder holding copies of `dir`'s assets. The frontend
/// then writes the copy's `lesson.html` with a new lesson ID, so the two
/// lessons never share drafts, backups or locks.
#[tauri::command]
pub async fn duplicate_lesson_dir(
    state: State<'_, AppState>,
    dir: String,
    folder_name: String,
) -> AppResult<LessonLocation> {
    let source = state.lesson_dir(&dir)?.join("assets");
    let (target, name) = create_unique_dir(&state.library, folder_name.trim())?;
    let copied = (|| -> AppResult<()> {
        if let Ok(entries) = fs::read_dir(&source) {
            for entry in entries.filter_map(|e| e.ok()) {
                if entry.file_type()?.is_file() {
                    fs::copy(entry.path(), target.join("assets").join(entry.file_name()))?;
                }
            }
        }
        Ok(())
    })();
    if let Err(e) = copied {
        let _ = fs::remove_dir_all(&target);
        return Err(e);
    }
    Ok(location(target, name))
}

/// Moves a lesson folder to the Recycle Bin / Trash, so a mistaken delete can
/// be undone from the OS. Refused while the lesson is open in another window.
/// Backups are kept; the draft and lock file are removed.
#[tauri::command]
pub async fn trash_lesson(state: State<'_, AppState>, dir: String, lesson_id: Option<String>) -> AppResult<()> {
    let path = state.lesson_dir(&dir)?;
    // Holding the lock across the move stops another window opening the
    // lesson halfway through. A folder whose lesson.html is unreadable has
    // no known ID and is simply moved.
    let lock = match &lesson_id {
        Some(id) => {
            check_lesson_id(id)?;
            Some(
                crate::session::lock_lesson(&state, id)?
                    .ok_or_else(|| AppError::new("locked", "Bài học đang được mở ở một cửa sổ khác."))?,
            )
        }
        None => None,
    };
    trash::delete(&path).map_err(|e| AppError::new("io", format!("Không chuyển được vào Thùng rác: {e}")))?;
    if let (Some(id), Some(lock)) = (lesson_id, lock) {
        drop(lock);
        let _ = fs::remove_file(state.locks_dir().join(format!("{id}.lock")));
        let _ = fs::remove_file(state.drafts_dir().join(format!("{id}.json")));
    }
    Ok(())
}

#[tauri::command]
pub async fn read_lesson(state: State<'_, AppState>, dir: String) -> AppResult<LessonFile> {
    let path = state.lesson_dir(&dir)?.join(LESSON_FILE);
    let bytes = fs::read(&path)?;
    let hash = sha256_hex(&bytes);
    let html = String::from_utf8(bytes)
        .map_err(|_| AppError::new("unsupported-file", "lesson.html không phải văn bản UTF-8."))?;
    Ok(LessonFile { html, hash, modified_ms: modified_ms(&path)? })
}

/// Safe save: refuse if the file changed on disk since it was read, back up
/// the current file, then atomically replace it.
#[tauri::command]
pub async fn write_lesson(
    state: State<'_, AppState>,
    dir: String,
    lesson_id: String,
    html: String,
    expected_hash: Option<String>,
) -> AppResult<WriteResult> {
    check_lesson_id(&lesson_id)?;
    // The frontend validates the document; this only stops something that is
    // plainly not a lesson from replacing one.
    if !html.contains("name=\"lesson-studio-schema\"") || !html.contains("id=\"lesson-data\"") {
        return Err(AppError::new("unsupported-file", "Nội dung không phải bài học hợp lệ."));
    }

    let path = state.lesson_dir(&dir)?.join(LESSON_FILE);
    let current = match fs::read(&path) {
        Ok(bytes) => Some(bytes),
        Err(e) if e.kind() == ErrorKind::NotFound => None,
        Err(e) => return Err(e.into()),
    };

    if let Some(expected) = &expected_hash {
        match &current {
            Some(bytes) if &sha256_hex(bytes) == expected => {}
            _ => return Err(AppError::conflict()),
        }
    }

    if let Some(bytes) = &current {
        backup(&state, &lesson_id, bytes)?;
    }

    atomic_write(&path, html.as_bytes())?;
    Ok(WriteResult { hash: sha256_hex(html.as_bytes()) })
}

fn backup(state: &AppState, lesson_id: &str, bytes: &[u8]) -> AppResult<()> {
    let dir = state.backups_dir(lesson_id);
    fs::create_dir_all(&dir)?;
    let now = Local::now();
    let stamp = now.format("%Y%m%d-%H%M%S-%3f").to_string();

    let mut attempt = 0;
    loop {
        let name = if attempt == 0 { format!("{stamp}.html") } else { format!("{stamp}-{attempt}.html") };
        match OpenOptions::new().write(true).create_new(true).open(dir.join(&name)) {
            Ok(mut f) => {
                f.write_all(bytes)?;
                f.sync_all()?;
                break;
            }
            Err(e) if e.kind() == ErrorKind::AlreadyExists && attempt < 100 => attempt += 1,
            Err(e) => return Err(e.into()),
        }
    }

    // Pruning is housekeeping; failing it must not block the save.
    let _ = prune_backups(&dir, now.date_naive());
    Ok(())
}

fn prune_backups(dir: &Path, today: NaiveDate) -> std::io::Result<()> {
    let names: Vec<String> = fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| n.ends_with(".html"))
        .collect();
    for name in backups_to_delete(names, today) {
        let _ = fs::remove_file(dir.join(name));
    }
    Ok(())
}

/// Keeps the 10 newest backups plus the newest one of each of the last 7 days.
/// Names start with `YYYYMMDD-HHMMSS-mmm`, so they sort chronologically.
fn backups_to_delete(mut names: Vec<String>, today: NaiveDate) -> Vec<String> {
    names.sort_unstable_by(|a, b| b.cmp(a));
    let mut keep: HashSet<&str> = names.iter().take(KEEP_RECENT_BACKUPS).map(String::as_str).collect();
    let mut days = HashSet::new();
    for name in &names {
        let Some(day) = name.get(0..8) else { continue };
        let Ok(date) = NaiveDate::parse_from_str(day, "%Y%m%d") else { continue };
        let age = today.signed_duration_since(date).num_days();
        if (0..KEEP_DAILY_BACKUP_DAYS).contains(&age) && days.insert(day) {
            keep.insert(name.as_str());
        }
    }
    names.iter().filter(|n| !keep.contains(n.as_str())).cloned().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_names() {
        assert!(check_folder_name("Hoa-qua").is_ok());
        assert!(check_folder_name("Bai-1-2").is_ok());
        for bad in ["", "Hoa quả", "Hoa qua", ".hidden", "-lead", "trail-", "a/b", "a\\b", "a:b", "a\nb", ".."] {
            assert!(check_folder_name(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn titles_are_read_from_the_head() {
        let dir = std::env::temp_dir().join(format!("ls-title-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join(LESSON_FILE);
        fs::write(&file, "<html><head><title>Hoa quả &amp; &lt;con vật&gt; &#39;1&#39;</title>").unwrap();
        assert_eq!(read_title(&file).as_deref(), Some("Hoa quả & <con vật> '1'"));
        fs::write(&file, "<html><body>no title</body>").unwrap();
        assert_eq!(read_title(&file), None);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn unique_dirs_get_a_number_suffix() {
        let library = std::env::temp_dir().join(format!("ls-unique-{}", std::process::id()));
        let _ = fs::remove_dir_all(&library);
        let (_, a) = create_unique_dir(&library, "Hoa-qua").unwrap();
        let (_, b) = create_unique_dir(&library, "hoa-qua").unwrap();
        assert_eq!((a.as_str(), b.as_str()), ("Hoa-qua", "hoa-qua-2"));
        assert!(library.join("hoa-qua-2").join("assets").is_dir());
        fs::remove_dir_all(&library).unwrap();
    }

    #[test]
    fn nfd_and_nfc_names_compare_equal() {
        let nfd: String = "Hoa quả".nfd().collect();
        assert_ne!(nfd, "Hoa quả");
        assert_eq!(name_key(&nfd), name_key("HOA QUẢ"));
    }

    #[test]
    fn backup_rotation_keeps_recent_and_daily() {
        let today = NaiveDate::from_ymd_opt(2026, 10, 13).unwrap();
        let mut names: Vec<String> = (0..15).map(|i| format!("20261013-1000{i:02}-000.html")).collect();
        names.push("20261012-090000-000.html".into());
        names.push("20261012-080000-000.html".into());
        names.push("20261001-090000-000.html".into());

        let deleted = backups_to_delete(names, today);
        // 15 from today: the 10 newest stay, today's daily slot is one of them.
        assert_eq!(deleted.iter().filter(|n| n.starts_with("20261013")).count(), 5);
        assert!(deleted.contains(&"20261013-100000-000.html".to_string()));
        // Yesterday: only the newest survives as the daily backup.
        assert!(!deleted.contains(&"20261012-090000-000.html".to_string()));
        assert!(deleted.contains(&"20261012-080000-000.html".to_string()));
        // Older than 7 days and not among the newest 10.
        assert!(deleted.contains(&"20261001-090000-000.html".to_string()));
    }
}
