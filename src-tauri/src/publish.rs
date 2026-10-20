//! Publishing a lesson to the teacher's own web server (the Cloudflare Worker
//! in `worker/`), so it can be presented from any browser. The server address
//! lives in the app data folder; the password in the OS credential store.

use crate::error::{AppError, AppResult};
use crate::fsutil::{atomic_write, sha256_hex};
use crate::state::{check_lesson_id, AppState};
use crate::transfer::{media_type, safe_asset_name};
use crate::web::is_public_url;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::State;
use url::Url;

const KEYRING_SERVICE: &str = "Chinese Lesson Studio";
const KEYRING_USER: &str = "publish-password";
const SETTINGS_FILE: &str = "publish.json";

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StoredSettings {
    server_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishSettings {
    server_url: Option<String>,
    has_password: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedAssets {
    /// Published file name for each `assets/…` path that was read.
    names: HashMap<String, String>,
    /// Paths that could not be read or are not a picture or sound.
    missing: Vec<String>,
    uploaded: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedLesson {
    url: String,
}

fn settings_path(state: &AppState) -> PathBuf {
    state.data.join(SETTINGS_FILE)
}

fn read_settings(state: &AppState) -> StoredSettings {
    fs::read(settings_path(state)).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn keyring_entry() -> AppResult<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| AppError::new("io", format!("Không mở được kho mật khẩu: {e}")))
}

fn read_password() -> AppResult<Option<String>> {
    match keyring_entry()?.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::new("io", format!("Không đọc được mật khẩu đã lưu: {e}"))),
    }
}

/// Only the origin of an https address on the public web: the password is
/// sent to it, so it must never be a plain-http or local address.
fn normalize_server_url(raw: &str) -> AppResult<String> {
    let bad = || AppError::new("invalid-path", "Địa chỉ máy chủ phải có dạng https://tên.workers.dev");
    let url = Url::parse(raw.trim()).map_err(|_| bad())?;
    if url.scheme() != "https" || !is_public_url(&url) || url.host_str().is_none() {
        return Err(bad());
    }
    Ok(url.origin().ascii_serialization())
}

/// HTTP headers carry ASCII only; a Vietnamese keyboard easily slips accents in.
fn check_password(password: &str) -> AppResult<()> {
    if password.is_empty() || password.len() > 200 || !password.bytes().all(|b| (0x21..=0x7e).contains(&b)) {
        return Err(AppError::new(
            "invalid-path",
            "Mật khẩu chỉ được gồm chữ không dấu, số và ký hiệu, không có dấu cách. Tắt bộ gõ tiếng Việt khi nhập.",
        ));
    }
    Ok(())
}

/// Published files are named by content, so one already on the server is
/// never uploaded twice and a name never points at different bytes.
fn published_name(bytes: &[u8], mime: &str) -> Option<String> {
    let ext = match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "audio/mpeg" => "mp3",
        "audio/mp4" => "m4a",
        "audio/aac" => "aac",
        "audio/wav" => "wav",
        _ => return None,
    };
    Some(format!("{}.{ext}", &sha256_hex(bytes)[..24]))
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(180))
            // The password travels in a header; never follow it anywhere else.
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .expect("HTTP client configuration is static")
    })
}

struct Server {
    base: String,
    password: String,
}

fn server(state: &AppState) -> AppResult<Server> {
    let not_set = || AppError::new("not-configured", "Chưa nhập địa chỉ máy chủ và mật khẩu để đăng bài.");
    let base = read_settings(state).server_url.ok_or_else(not_set)?;
    let password = read_password()?.ok_or_else(not_set)?;
    Ok(Server { base, password })
}

/// Sends the request, retrying twice on a dropped connection or a 5xx answer.
/// Every publish request is safe to repeat: it checks or replaces the same file.
async fn send(request: reqwest::RequestBuilder) -> AppResult<reqwest::Response> {
    const ATTEMPTS: u64 = 3;
    for attempt in 1..=ATTEMPTS {
        let retry = attempt < ATTEMPTS;
        let this = request.try_clone().ok_or_else(|| AppError::new("io", "Yêu cầu không gửi lại được."))?;
        let response = match this.send().await {
            Ok(r) => r,
            Err(_) if retry => {
                tokio::time::sleep(Duration::from_millis(700 * attempt)).await;
                continue;
            }
            Err(e) => return Err(AppError::new("network", format!("Không kết nối được máy chủ: {e}"))),
        };
        let status = response.status().as_u16();
        match status {
            200..=299 => return Ok(response),
            401 => return Err(AppError::new("unauthorized", "Máy chủ từ chối mật khẩu. Kiểm tra lại mật khẩu đăng bài.")),
            413 => return Err(AppError::new("too-large", "File quá lớn để đăng lên máy chủ.")),
            500..=599 if retry => tokio::time::sleep(Duration::from_millis(700 * attempt)).await,
            _ => {
                let body = response.text().await.unwrap_or_default();
                let detail: String = body.chars().filter(|c| !c.is_control()).take(160).collect();
                return Err(AppError::new("network", format!("Máy chủ trả về lỗi {status}: {detail}")));
            }
        }
    }
    unreachable!("the last attempt always returns")
}

#[tauri::command]
pub async fn get_publish_settings(state: State<'_, AppState>) -> AppResult<PublishSettings> {
    Ok(PublishSettings { server_url: read_settings(&state).server_url, has_password: read_password()?.is_some() })
}

/// Saves the server address, and the password when one is given (None keeps the stored one).
#[tauri::command]
pub async fn set_publish_settings(
    state: State<'_, AppState>,
    server_url: String,
    password: Option<String>,
) -> AppResult<PublishSettings> {
    let server_url = normalize_server_url(&server_url)?;
    if let Some(password) = &password {
        check_password(password)?;
    }
    let stored = StoredSettings { server_url: Some(server_url) };
    let json = serde_json::to_vec_pretty(&stored).map_err(|e| AppError::new("io", e.to_string()))?;
    atomic_write(&settings_path(&state), &json)?;
    if let Some(password) = password {
        keyring_entry()?
            .set_password(&password)
            .map_err(|e| AppError::new("io", format!("Không lưu được mật khẩu: {e}")))?;
    }
    get_publish_settings(state).await
}

/// Uploads the lesson's pictures and sounds that the server does not have yet.
#[tauri::command]
pub async fn publish_assets(state: State<'_, AppState>, dir: String, files: Vec<String>) -> AppResult<PublishedAssets> {
    let server = server(&state)?;
    let lesson = state.lesson_dir(&dir)?;
    let mut names = HashMap::new();
    let mut paths = HashMap::new();
    let mut missing = Vec::new();
    for file in files {
        let read = safe_asset_name(&file).ok().and_then(|name| {
            let path = lesson.join("assets").join(name);
            let bytes = fs::read(&path).ok()?;
            let mime = media_type(&bytes)?;
            Some((published_name(&bytes, mime)?, path))
        });
        match read {
            Some((name, path)) => {
                paths.insert(name.clone(), path);
                names.insert(file, name);
            }
            None => missing.push(file),
        }
    }

    let mut wanted: Vec<&String> = paths.keys().collect();
    wanted.sort();
    let mut to_upload = Vec::new();
    // The server checks at most 500 names per request.
    for chunk in wanted.chunks(500) {
        #[derive(Deserialize)]
        struct Missing {
            missing: Vec<String>,
        }
        let response = send(
            client()
                .post(format!("{}/api/assets/missing", server.base))
                .bearer_auth(&server.password)
                .header("Content-Type", "application/json")
                .body(serde_json::json!({ "names": chunk }).to_string()),
        )
        .await?;
        let invalid = |e: &dyn std::fmt::Display| AppError::new("network", format!("Máy chủ trả lời không hợp lệ: {e}"));
        let bytes = response.bytes().await.map_err(|e| invalid(&e))?;
        let body: Missing = serde_json::from_slice(&bytes).map_err(|e| invalid(&e))?;
        to_upload.extend(body.missing);
    }

    for name in &to_upload {
        let Some(path) = paths.get(name) else { continue };
        let bytes = fs::read(path)?;
        send(client().put(format!("{}/api/assets/{name}", server.base)).bearer_auth(&server.password).body(bytes)).await?;
    }
    Ok(PublishedAssets { names, missing, uploaded: to_upload.len() })
}

/// Uploads the lesson page (already pointing at the published files) and returns its address.
#[tauri::command]
pub async fn publish_lesson(
    state: State<'_, AppState>,
    lesson_id: String,
    title: String,
    hanzi: Option<String>,
    html: String,
) -> AppResult<PublishedLesson> {
    check_lesson_id(&lesson_id)?;
    let server = server(&state)?;
    let mut url = Url::parse(&format!("{}/api/lessons/{lesson_id}", server.base)).map_err(|_| AppError::invalid_path())?;
    url.query_pairs_mut().append_pair("title", &title);
    if let Some(hanzi) = hanzi {
        url.query_pairs_mut().append_pair("hanzi", &hanzi);
    }
    send(client().put(url).bearer_auth(&server.password).header("Content-Type", "text/html; charset=utf-8").body(html)).await?;
    Ok(PublishedLesson { url: format!("{}/l/{lesson_id}", server.base) })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_urls() {
        assert_eq!(normalize_server_url(" https://lesson-studio.mimax.workers.dev/ ").unwrap(), "https://lesson-studio.mimax.workers.dev");
        assert_eq!(normalize_server_url("https://x.workers.dev/l/abc?y=1").unwrap(), "https://x.workers.dev");
        for bad in ["http://x.workers.dev", "https://localhost", "https://192.168.1.2", "ftp://x.dev", "x.workers.dev", ""] {
            assert!(normalize_server_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn passwords() {
        assert!(check_password("Correct-Horse_9!").is_ok());
        for bad in ["", "có dấu", "two words", "tab\there", &"x".repeat(201)] {
            assert!(check_password(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn names_follow_content() {
        let a = published_name(b"one", "audio/mpeg").unwrap();
        assert!(a.ends_with(".mp3") && a.len() == 28);
        assert_eq!(a, published_name(b"one", "audio/mpeg").unwrap());
        assert_ne!(a, published_name(b"two", "audio/mpeg").unwrap());
        assert_eq!(published_name(b"x", "image/jpeg").unwrap().rsplit('.').next(), Some("jpg"));
        assert!(published_name(b"x", "image/svg+xml").is_none());
    }
}
