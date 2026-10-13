use serde::Serialize;

/// Error returned to the frontend as `{ code, message }`. The codes match
/// `PersistenceErrorCode` in `src/platform/persistence.ts`.
#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: &'static str,
    pub message: String,
}

impl AppError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }

    pub fn conflict() -> Self {
        Self::new("conflict", "lesson.html đã bị thay đổi bên ngoài ứng dụng (ví dụ do OneDrive hoặc iCloud).")
    }

    pub fn invalid_path() -> Self {
        Self::new("invalid-path", "Đường dẫn nằm ngoài thư viện bài học.")
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        match e.kind() {
            std::io::ErrorKind::NotFound => Self::new("not-found", e.to_string()),
            _ => Self::new("io", e.to_string()),
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
