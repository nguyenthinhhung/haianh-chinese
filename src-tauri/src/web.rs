//! Everything that talks to the network: image search, downloading an image
//! and Chinese text-to-speech. Search and speech use unofficial endpoints
//! that can change without notice, so each lives in one function here.
//! The webview never makes these requests itself; its CSP stays closed.

use crate::assets::{self, ImportedAsset, MAX_IMAGE_BYTES};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use base64::Engine;
use futures_util::future::join_all;
use reqwest::redirect;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::net::IpAddr;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::ipc::Request;
use tauri::State;
use url::{Host, Url};

const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const RESULTS_PER_PAGE: usize = 30;
const MAX_THUMBNAIL_BYTES: u64 = 512 * 1024;
const MAX_SPEECH_BYTES: u64 = 2 * 1024 * 1024;
/// Google Translate refuses longer text in one request.
const MAX_SPEECH_CHARS: usize = 200;

fn offline(e: impl std::fmt::Display) -> AppError {
    AppError::new("network", format!("Không kết nối được: {e}"))
}

/// Only public web addresses: a request must never reach this machine or
/// the local network, whoever supplied the URL.
fn is_public_url(url: &Url) -> bool {
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }
    match url.host() {
        Some(Host::Domain(d)) => {
            let d = d.to_ascii_lowercase();
            d != "localhost" && !d.ends_with(".localhost") && !d.ends_with(".local")
        }
        Some(Host::Ipv4(ip)) => is_public_ip(IpAddr::V4(ip)),
        Some(Host::Ipv6(ip)) => is_public_ip(IpAddr::V6(ip)),
        None => false,
    }
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            !(v4.is_private() || v4.is_loopback() || v4.is_link_local() || v4.is_unspecified() || v4.is_broadcast())
        }
        IpAddr::V6(v6) => {
            let first = v6.segments()[0];
            // fc00::/7 unique local, fe80::/10 link local.
            !(v6.is_loopback() || v6.is_unspecified() || (first & 0xfe00) == 0xfc00 || (first & 0xffc0) == 0xfe80)
        }
    }
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            // Every hop is checked, so a public URL cannot redirect inwards.
            .redirect(redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 5 || !is_public_url(attempt.url()) {
                    attempt.stop()
                } else {
                    attempt.follow()
                }
            }))
            .build()
            .expect("HTTP client configuration is static")
    })
}

/// Downloads at most `max_bytes`, refusing larger bodies without reading them.
async fn fetch(url: &str, max_bytes: u64, timeout: Duration) -> AppResult<Vec<u8>> {
    let url = Url::parse(url).map_err(|_| AppError::new("invalid-path", "Địa chỉ không hợp lệ."))?;
    if !is_public_url(&url) {
        return Err(AppError::new("invalid-path", "Chỉ tải được từ địa chỉ web công khai."));
    }
    let mut response = client().get(url).timeout(timeout).send().await.map_err(offline)?;
    if !response.status().is_success() {
        return Err(AppError::new("network", format!("Máy chủ trả về lỗi {}.", response.status().as_u16())));
    }
    if response.content_length().is_some_and(|n| n > max_bytes) {
        return Err(assets::too_large(max_bytes));
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(offline)? {
        body.extend_from_slice(&chunk);
        if body.len() as u64 > max_bytes {
            return Err(assets::too_large(max_bytes));
        }
    }
    Ok(body)
}

/// One result's metadata as Bing embeds it in the `m` attribute.
#[derive(Deserialize)]
struct BingMeta {
    murl: String,
    turl: String,
    purl: Option<String>,
    t: Option<String>,
}

fn unescape_attr(s: &str) -> String {
    s.replace("&quot;", "\"")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

/// Pulls results out of Bing's image-results HTML: each result carries
/// HTML-escaped JSON in an `m="…"` attribute. Unparsable entries are skipped.
fn parse_bing(html: &str) -> Vec<BingMeta> {
    let mut seen = HashSet::new();
    html.split(" m=\"")
        .skip(1)
        .filter_map(|rest| rest.split_once('"').map(|(attr, _)| attr))
        .filter_map(|attr| serde_json::from_str::<BingMeta>(&unescape_attr(attr)).ok())
        .filter(|m| Url::parse(&m.murl).is_ok_and(|u| is_public_url(&u)))
        .filter(|m| seen.insert(m.murl.clone()))
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageHit {
    /// Full-size image.
    url: String,
    /// Bing's small copy; a fallback when the original host refuses downloads.
    thumbnail_url: String,
    /// The thumbnail as a data: URL, so the webview needs no network access.
    thumbnail: String,
    source_page: Option<String>,
    title: String,
}

async fn thumbnail_data_url(url: &str) -> Option<String> {
    let bytes = fetch(url, MAX_THUMBNAIL_BYTES, Duration::from_secs(8)).await.ok()?;
    let (_, mime) = assets::sniff_image(&bytes)?;
    Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

/// Searches Bing Images with SafeSearch on strict, since the lessons are for
/// children. `page` starts at 0.
#[tauri::command]
pub async fn search_images(query: String, page: u32) -> AppResult<Vec<ImageHit>> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 100 {
        return Err(AppError::new("invalid-path", "Từ khoá tìm ảnh không hợp lệ."));
    }
    let first = (page as usize * RESULTS_PER_PAGE).to_string();
    let count = RESULTS_PER_PAGE.to_string();
    let url = Url::parse_with_params(
        "https://www.bing.com/images/async",
        [("q", query), ("first", &first), ("count", &count), ("adlt", "strict"), ("mmasync", "1")],
    )
    .expect("static URL");
    let html = client()
        .get(url)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(offline)?
        .error_for_status()
        .map_err(offline)?
        .text()
        .await
        .map_err(offline)?;

    let metas: Vec<BingMeta> = parse_bing(&html).into_iter().take(RESULTS_PER_PAGE).collect();
    let thumbnails = join_all(metas.iter().map(|m| thumbnail_data_url(&m.turl))).await;
    // A result whose preview cannot be shown is left out rather than shown blank.
    Ok(metas
        .into_iter()
        .zip(thumbnails)
        .filter_map(|(m, thumbnail)| {
            Some(ImageHit {
                thumbnail: thumbnail?,
                url: m.murl,
                thumbnail_url: m.turl,
                source_page: m.purl,
                title: m.t.unwrap_or_default(),
            })
        })
        .collect())
}

/// Downloads an image into the lesson, trying each URL in turn: many sites
/// refuse direct downloads, so callers pass the original first and Bing's
/// copy second.
#[tauri::command]
pub async fn import_image_url(state: State<'_, AppState>, dir: String, urls: Vec<String>) -> AppResult<ImportedAsset> {
    let lesson = state.lesson_dir(&dir)?;
    let mut last_error = AppError::new("invalid-path", "Không có địa chỉ ảnh.");
    for url in urls.iter().take(3) {
        match fetch(url, MAX_IMAGE_BYTES, Duration::from_secs(30)).await {
            Ok(bytes) => match assets::store_image(&lesson, bytes) {
                Ok(asset) => return Ok(asset),
                Err(e) => last_error = e,
            },
            Err(e) => last_error = e,
        }
    }
    Err(last_error)
}

/// Stores image bytes pasted or dropped into the editor. The body is sent raw
/// (not as JSON) to keep large images fast; the lesson folder comes in the
/// `x-lesson-dir` header, percent-encoded since headers are ASCII-only.
#[tauri::command]
pub async fn import_image_bytes(state: State<'_, AppState>, request: Request<'_>) -> AppResult<ImportedAsset> {
    let dir = request
        .headers()
        .get("x-lesson-dir")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| percent_encoding::percent_decode_str(v).decode_utf8().ok())
        .ok_or_else(AppError::invalid_path)?;
    let lesson = state.lesson_dir(&dir)?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::new("unsupported-file", "Dữ liệu ảnh không hợp lệ."));
    };
    assets::store_image(&lesson, bytes.clone())
}

fn is_mp3(bytes: &[u8]) -> bool {
    bytes.starts_with(b"ID3") || (bytes.len() >= 2 && bytes[0] == 0xFF && (bytes[1] & 0xE0) == 0xE0)
}

/// Reads Chinese text aloud with Google Translate's voice and stores the MP3
/// in the lesson, so presenting needs no network.
#[tauri::command]
pub async fn speak_chinese(state: State<'_, AppState>, dir: String, text: String) -> AppResult<ImportedAsset> {
    let lesson = state.lesson_dir(&dir)?;
    let text = text.trim();
    if text.is_empty() || text.chars().count() > MAX_SPEECH_CHARS {
        return Err(AppError::new(
            "invalid-path",
            format!("Cần từ 1 đến {MAX_SPEECH_CHARS} ký tự để tạo giọng đọc."),
        ));
    }
    let url = Url::parse_with_params(
        "https://translate.google.com/translate_tts",
        [("ie", "UTF-8"), ("client", "tw-ob"), ("tl", "zh-CN"), ("q", text)],
    )
    .expect("static URL");
    let bytes = fetch(url.as_str(), MAX_SPEECH_BYTES, Duration::from_secs(15)).await?;
    if !is_mp3(&bytes) {
        return Err(AppError::new("network", "Dịch vụ đọc không trả về âm thanh. Thử lại sau."));
    }
    assets::store_audio(&lesson, "mp3", "audio/mpeg", &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn public(url: &str) -> bool {
        is_public_url(&Url::parse(url).unwrap())
    }

    #[test]
    fn only_public_web_addresses_are_fetched() {
        assert!(public("https://png.pngtree.com/a.png"));
        assert!(public("http://8.8.8.8/x.jpg"));
        for url in [
            "file:///C:/Windows/win.ini",
            "http://localhost:1420/",
            "http://app.localhost/",
            "http://127.0.0.1/",
            "http://192.168.1.1/router.png",
            "http://10.0.0.5/",
            "http://169.254.169.254/latest",
            "http://[::1]/",
            "http://[fd00::1]/",
            "http://printer.local/",
        ] {
            assert!(!public(url), "{url}");
        }
    }

    #[test]
    fn bing_results_are_parsed_and_deduplicated() {
        let m = |murl: &str| {
            format!(
                r##"<a class="iusc" m="{{&quot;purl&quot;:&quot;https://site.vn/p&quot;,&quot;murl&quot;:&quot;{murl}&quot;,&quot;turl&quot;:&quot;https://ts1.mm.bing.net/th?id=OIP.x&amp;pid=15.1&quot;,&quot;t&quot;:&quot;Quả táo &amp; lê&quot;}}" href="#">"##
            )
        };
        let html = format!(
            "{}{}{}<a m=\"{{broken\">{}",
            m("https://a.com/1.png"),
            m("https://a.com/1.png"),
            m("http://192.168.0.2/private.png"),
            m("https://b.com/2.jpg")
        );
        let results = parse_bing(&html);
        let urls: Vec<&str> = results.iter().map(|r| r.murl.as_str()).collect();
        assert_eq!(urls, ["https://a.com/1.png", "https://b.com/2.jpg"]);
        assert_eq!(results[0].turl, "https://ts1.mm.bing.net/th?id=OIP.x&pid=15.1");
        assert_eq!(results[0].t.as_deref(), Some("Quả táo & lê"));
    }

    #[test]
    fn mp3_signatures() {
        assert!(is_mp3(b"ID3\x04rest"));
        assert!(is_mp3(&[0xFF, 0xF3, 0x84, 0xC4]));
        assert!(!is_mp3(b"<html>"));
    }
}
