use crate::error::{AppError, AppResult};
use crate::fsutil::{atomic_write, sha256_hex};
use crate::state::AppState;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, ImageDecoder, ImageFormat, ImageReader};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::io::Cursor;
use std::path::Path;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

pub const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_AUDIO_BYTES: u64 = 30 * 1024 * 1024;
/// Longest side kept on import: sharp on a 1080p projector, and keeps the
/// exported single-file lesson small.
const MAX_IMAGE_SIDE: u32 = 1920;
const JPEG_QUALITY: u8 = 85;

/// (extension, MIME). SVG is deliberately absent: it can carry scripts.
/// Extensions offered in the picker; the content decides the actual type.
const IMAGE_TYPES: &[(&str, &str)] = &[
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("webp", "image/webp"),
    ("gif", "image/gif"),
];
const AUDIO_TYPES: &[(&str, &str)] = &[
    ("mp3", "audio/mpeg"),
    ("m4a", "audio/mp4"),
    ("aac", "audio/aac"),
    ("wav", "audio/wav"),
];

#[derive(Serialize)]
pub struct ImportedAsset {
    file: String,
    mime: String,
}

/// Identifies an image by its content, never by a name or a server's
/// Content-Type, and returns (extension, MIME). SVG is never accepted: it can
/// carry scripts.
pub fn sniff_image(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some(("png", "image/png"))
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some(("jpg", "image/jpeg"))
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some(("gif", "image/gif"))
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some(("webp", "image/webp"))
    } else {
        None
    }
}

fn bad_image(e: impl std::fmt::Display) -> AppError {
    AppError::new("unsupported-file", format!("Không đọc được ảnh: {e}"))
}

/// Shrinks an image whose longest side exceeds MAX_IMAGE_SIDE and returns the
/// re-encoded bytes with their extension and MIME; `None` means keep the
/// original. Phone photos store their rotation in EXIF, which re-encoding
/// drops, so it is applied to the pixels first. GIFs are left alone because
/// they may be animated.
fn shrink_image(bytes: &[u8], mime: &str) -> AppResult<Option<(Vec<u8>, &'static str, &'static str)>> {
    if mime == "image/gif" {
        return Ok(None);
    }
    let mut decoder = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(bad_image)?
        .into_decoder()
        .map_err(bad_image)?;
    let (w, h) = decoder.dimensions();
    if w.max(h) <= MAX_IMAGE_SIDE {
        return Ok(None);
    }
    let orientation = decoder.orientation().map_err(bad_image)?;
    let mut img = DynamicImage::from_decoder(decoder).map_err(bad_image)?;
    img.apply_orientation(orientation);
    let img = img.resize(MAX_IMAGE_SIDE, MAX_IMAGE_SIDE, FilterType::Lanczos3);

    let mut out = Vec::new();
    if img.color().has_alpha() {
        img.write_to(&mut Cursor::new(&mut out), ImageFormat::Png).map_err(bad_image)?;
        Ok(Some((out, "png", "image/png")))
    } else {
        DynamicImage::ImageRgb8(img.to_rgb8())
            .write_with_encoder(JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY))
            .map_err(bad_image)?;
        Ok(Some((out, "jpg", "image/jpeg")))
    }
}

/// Writes `bytes` into the lesson's `assets/`, named by content hash:
/// identical files are stored once and replacing an image never overwrites
/// the old file.
fn store(lesson: &Path, prefix: &str, ext: &str, mime: &str, bytes: &[u8]) -> AppResult<ImportedAsset> {
    let name = format!("{prefix}-{}.{ext}", &sha256_hex(bytes)[..12]);
    let assets = lesson.join("assets");
    fs::create_dir_all(&assets)?;
    let target = assets.join(&name);
    if !target.exists() {
        atomic_write(&target, bytes)?;
    }
    Ok(ImportedAsset { file: format!("assets/{name}"), mime: mime.to_string() })
}

/// Validates, shrinks and stores an image from any source: a picked file,
/// a download or the clipboard.
pub fn store_image(lesson: &Path, bytes: Vec<u8>) -> AppResult<ImportedAsset> {
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err(too_large(MAX_IMAGE_BYTES));
    }
    let Some((ext, mime)) = sniff_image(&bytes) else {
        return Err(AppError::new("unsupported-file", "Không phải ảnh PNG, JPEG, WebP hoặc GIF."));
    };
    match shrink_image(&bytes, mime)? {
        Some((smaller, ext, mime)) => store(lesson, "img", ext, mime, &smaller),
        None => store(lesson, "img", ext, mime, &bytes),
    }
}

pub fn store_audio(lesson: &Path, ext: &str, mime: &str, bytes: &[u8]) -> AppResult<ImportedAsset> {
    store(lesson, "audio", ext, mime, bytes)
}

pub fn too_large(max_bytes: u64) -> AppError {
    AppError::new("too-large", format!("File lớn hơn {} MB.", max_bytes / 1024 / 1024))
}

/// Opens a file picker and copies the chosen file into the lesson's `assets/`.
///
/// The picker runs here rather than in the webview so the frontend never
/// gets to name an arbitrary path on disk to copy from.
#[tauri::command]
pub async fn import_asset(
    app: AppHandle,
    state: State<'_, AppState>,
    dir: String,
    kind: String,
) -> AppResult<Option<ImportedAsset>> {
    let lesson = state.lesson_dir(&dir)?;
    let (types, max_bytes, label) = match kind.as_str() {
        "image" => (IMAGE_TYPES, MAX_IMAGE_BYTES, "Ảnh"),
        "audio" => (AUDIO_TYPES, MAX_AUDIO_BYTES, "Âm thanh"),
        _ => return Err(AppError::new("unsupported-file", "Loại tài nguyên không hợp lệ.")),
    };
    let extensions: Vec<&str> = types.iter().map(|(ext, _)| *ext).collect();

    let picked = app
        .dialog()
        .file()
        .set_title(format!("Chọn {}", label.to_lowercase()))
        .add_filter(label, &extensions)
        .blocking_pick_file();
    let Some(picked) = picked else { return Ok(None) };
    let source = picked
        .into_path()
        .map_err(|_| AppError::new("unsupported-file", "Không đọc được file đã chọn."))?;

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    let Some((_, mime)) = types.iter().find(|(e, _)| *e == ext) else {
        return Err(AppError::new("unsupported-file", format!("Không hỗ trợ file .{ext}.")));
    };
    if fs::metadata(&source)?.len() > max_bytes {
        return Err(too_large(max_bytes));
    }

    let bytes = fs::read(&source)?;
    if kind == "image" {
        return store_image(&lesson, bytes).map(Some);
    }
    store_audio(&lesson, &ext, mime, &bytes).map(Some)
}

/// Matches the names `import_asset` gives files (`img-3f9a2c….webp`), so
/// cleanup never touches anything else a teacher put in the folder.
fn is_managed_asset(name: &str) -> bool {
    let Some(rest) = name.strip_prefix("img-").or_else(|| name.strip_prefix("audio-")) else {
        return false;
    };
    let Some((hash, ext)) = rest.split_once('.') else { return false };
    hash.len() == 12
        && hash.bytes().all(|b| b.is_ascii_hexdigit())
        && !ext.is_empty()
        && ext.bytes().all(|b| b.is_ascii_alphanumeric())
}

/// Deletes imported files in `assets/` that the lesson no longer uses.
/// `keep` lists the paths the saved lesson references (`assets/<name>`).
/// Returns how many files were removed.
#[tauri::command]
pub async fn prune_assets(state: State<'_, AppState>, dir: String, keep: Vec<String>) -> AppResult<u32> {
    let assets = state.lesson_dir(&dir)?.join("assets");
    let keep: HashSet<&str> = keep.iter().filter_map(|k| k.strip_prefix("assets/")).collect();
    let entries = match fs::read_dir(&assets) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(0),
        Err(e) => return Err(e.into()),
    };
    let mut removed = 0;
    for entry in entries.filter_map(|e| e.ok()) {
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.file_type().is_ok_and(|t| t.is_file()) && is_managed_asset(&name) && !keep.contains(name.as_str()) {
            // A file that cannot be removed now is retried at the next close.
            if fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            }
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn images_are_identified_by_content() {
        assert_eq!(sniff_image(b"\x89PNG\r\n\x1a\nrest"), Some(("png", "image/png")));
        assert_eq!(sniff_image(b"RIFF\0\0\0\0WEBPVP8 "), Some(("webp", "image/webp")));
        assert_eq!(sniff_image(b"<svg onload=alert(1)>"), None);
        assert_eq!(sniff_image(b"RIFF"), None);
    }

    fn png(w: u32, h: u32, alpha: bool) -> Vec<u8> {
        let img = if alpha {
            DynamicImage::new_rgba8(w, h)
        } else {
            DynamicImage::new_rgb8(w, h)
        };
        let mut out = Vec::new();
        img.write_to(&mut Cursor::new(&mut out), ImageFormat::Png).unwrap();
        out
    }

    fn dimensions(bytes: &[u8]) -> (u32, u32) {
        let img = image::load_from_memory(bytes).unwrap();
        (img.width(), img.height())
    }

    #[test]
    fn small_images_are_kept_as_is() {
        assert!(shrink_image(&png(1920, 1080, false), "image/png").unwrap().is_none());
    }

    #[test]
    fn large_opaque_images_become_jpeg_within_the_limit() {
        let (bytes, ext, mime) = shrink_image(&png(4000, 1000, false), "image/png").unwrap().unwrap();
        assert_eq!((ext, mime), ("jpg", "image/jpeg"));
        assert_eq!(dimensions(&bytes), (1920, 480));
    }

    #[test]
    fn large_transparent_images_stay_png() {
        let (bytes, ext, _) = shrink_image(&png(1000, 3000, true), "image/png").unwrap().unwrap();
        assert_eq!(ext, "png");
        assert_eq!(dimensions(&bytes), (640, 1920));
    }

    #[test]
    fn only_imported_names_are_managed() {
        assert!(is_managed_asset("img-3f9a2c0b1d4e.webp"));
        assert!(is_managed_asset("audio-81bd04aa00ff.mp3"));
        for name in ["notes.txt", "img-short.png", "img-3f9a2c0b1d4e", "img-3f9a2c0b1d4z.png", "lesson.html"] {
            assert!(!is_managed_asset(name), "{name}");
        }
    }
}
