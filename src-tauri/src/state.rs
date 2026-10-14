use crate::error::{AppError, AppResult};
use std::collections::HashMap;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct AppState {
    /// Folder holding one sub-folder per lesson (Documents/Chinese Lesson Studio).
    pub library: PathBuf,
    /// Internal data: drafts, backups, locks (AppData / Application Support).
    pub data: PathBuf,
    /// Lock files held open by this process, keyed by lesson ID.
    pub locks: Mutex<HashMap<String, File>>,
    /// Lesson file last chosen in the "open" dialog; only the assets beside
    /// it may be copied into the library.
    pub picked_lesson: Mutex<Option<PathBuf>>,
}

impl AppState {
    pub fn new(library: PathBuf, data: PathBuf) -> Self {
        Self { library, data, locks: Mutex::new(HashMap::new()), picked_lesson: Mutex::new(None) }
    }

    /// Resolves a lesson folder sent by the frontend, accepting only direct
    /// children of the library so no command can touch files elsewhere.
    pub fn lesson_dir(&self, dir: &str) -> AppResult<PathBuf> {
        let library = self.library.canonicalize()?;
        let resolved = Path::new(dir).canonicalize()?;
        if resolved.parent() != Some(library.as_path()) || !resolved.is_dir() {
            return Err(AppError::invalid_path());
        }
        Ok(resolved)
    }

    pub fn drafts_dir(&self) -> PathBuf {
        self.data.join("drafts")
    }

    pub fn backups_dir(&self, lesson_id: &str) -> PathBuf {
        self.data.join("backups").join(lesson_id)
    }

    pub fn locks_dir(&self) -> PathBuf {
        self.data.join("locks")
    }
}

/// Lesson IDs become file names, so only the generated shape is accepted.
pub fn check_lesson_id(id: &str) -> AppResult<()> {
    let ok = id.len() >= 6
        && id.len() <= 34
        && id.starts_with("l_")
        && id[2..].bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit());
    if ok {
        Ok(())
    } else {
        Err(AppError::new("invalid-path", "ID bài học không hợp lệ."))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lesson_ids() {
        assert!(check_lesson_id("l_abc123").is_ok());
        assert!(check_lesson_id("l_ab").is_err());
        assert!(check_lesson_id("l_../../x").is_err());
        assert!(check_lesson_id("s_abc123").is_err());
        assert!(check_lesson_id("l_ABC123").is_err());
    }
}
