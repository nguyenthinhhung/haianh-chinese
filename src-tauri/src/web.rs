//! Everything that talks to the network: image search, downloading an image
//! and Chinese text-to-speech. Search and speech use unofficial endpoints
//! that can change without notice, so each lives in one function here.
//! The webview never makes these requests itself; its CSP stays closed.

use crate::assets::{self, ImportedAsset, MAX_IMAGE_BYTES};
use crate::error::{AppError, AppResult};
use crate::fsutil;
use crate::state::AppState;
use base64::Engine;
use futures_util::future::join_all;
use reqwest::redirect;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::net::IpAddr;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
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

/// One search result, without its preview.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImageCandidate {
    /// Full-size image.
    url: String,
    /// Bing's small copy; a fallback when the original host refuses downloads.
    thumbnail_url: String,
    source_page: Option<String>,
    title: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageHit {
    #[serde(flatten)]
    candidate: ImageCandidate,
    /// The thumbnail as a data: URL, so the webview needs no network access.
    thumbnail: String,
}

/// Bing serves its thumbnails at any size; the picker shows them at about
/// 150 px, so asking for 240 px keeps them sharp at a quarter of the bytes.
fn small_thumbnail_url(turl: &str) -> String {
    match Url::parse(turl) {
        Ok(u) if u.host_str().is_some_and(|h| h.ends_with(".mm.bing.net")) && u.path() == "/th" => {
            format!("{turl}&w=240&h=240")
        }
        _ => turl.to_string(),
    }
}

async fn thumbnail_data_url(turl: &str) -> Option<String> {
    let bytes = fetch(&small_thumbnail_url(turl), MAX_THUMBNAIL_BYTES, Duration::from_secs(8)).await.ok()?;
    let (_, mime) = assets::sniff_image(&bytes)?;
    Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

/// Pause between two requests to Bing's search page, with up to 300 ms added
/// at random, so filling a lesson's pictures does not look like a bot burst.
/// Thumbnails and images come from other hosts and are not spaced out.
const SEARCH_GAP: Duration = Duration::from_millis(700);
const CACHE_FILE: &str = "image-search-cache.json";
const CACHE_TTL_SECS: u64 = 7 * 24 * 3600;
const CACHE_MAX_ENTRIES: usize = 150;

#[derive(Serialize, Deserialize)]
struct CachedSearch {
    /// Seconds since the Unix epoch.
    at: u64,
    results: Vec<ImageCandidate>,
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn cache_key(query: &str, page: u32, clipart: bool) -> String {
    format!("{}|{page}|{}", u8::from(clipart), query.to_lowercase())
}

/// Searches already made, kept on disk for a week so swapping a picture or
/// reusing a word in another lesson does not ask Bing again.
fn cache(state: &AppState) -> &'static Mutex<HashMap<String, CachedSearch>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CachedSearch>>> = OnceLock::new();
    CACHE.get_or_init(|| {
        let mut entries: HashMap<String, CachedSearch> = fs::read(state.data.join(CACHE_FILE))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        let now = now_secs();
        entries.retain(|_, e| now.saturating_sub(e.at) < CACHE_TTL_SECS);
        Mutex::new(entries)
    })
}

fn cached(state: &AppState, key: &str) -> Option<Vec<ImageCandidate>> {
    let entries = cache(state).lock().ok()?;
    let entry = entries.get(key)?;
    (now_secs().saturating_sub(entry.at) < CACHE_TTL_SECS).then(|| entry.results.clone())
}

fn remember(state: &AppState, key: String, results: &[ImageCandidate]) {
    let Ok(mut entries) = cache(state).lock() else { return };
    entries.insert(key, CachedSearch { at: now_secs(), results: results.to_vec() });
    while entries.len() > CACHE_MAX_ENTRIES {
        let Some(oldest) = entries.iter().min_by_key(|(_, e)| e.at).map(|(k, _)| k.clone()) else { break };
        entries.remove(&oldest);
    }
    // Losing the cache only costs a repeated search.
    if let Ok(bytes) = serde_json::to_vec(&*entries) {
        let _ = fsutil::atomic_write(&state.data.join(CACHE_FILE), &bytes);
    }
}

/// Waits until the previous search is at least SEARCH_GAP old. Holding the
/// returned guard while searching keeps searches one at a time.
async fn search_turn() -> tokio::sync::MutexGuard<'static, Option<Instant>> {
    static LAST: OnceLock<tokio::sync::Mutex<Option<Instant>>> = OnceLock::new();
    let guard = LAST.get_or_init(|| tokio::sync::Mutex::new(None)).lock().await;
    if let Some(last) = *guard {
        let jitter = Duration::from_millis(u64::from(SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().subsec_millis() % 300));
        let wait = (SEARCH_GAP + jitter).saturating_sub(last.elapsed());
        if !wait.is_zero() {
            tokio::time::sleep(wait).await;
        }
    }
    guard
}

/// Bing answers a client it distrusts with an error status or a challenge
/// page instead of results.
fn looks_blocked(status: u16, html: &str) -> bool {
    matches!(status, 403 | 429 | 503) || (!html.contains(" m=\"") && html.to_ascii_lowercase().contains("captcha"))
}

fn rate_limited() -> AppError {
    AppError::new("rate-limited", "Bing đang tạm chặn tìm ảnh vì tìm nhiều quá. Hãy thử lại sau vài phút.")
}

/// One page of results for `query`, from the cache when possible. Bing is
/// asked with SafeSearch on strict, since the lessons are for children;
/// `clipart` keeps to drawings, which suit young children better than photos.
async fn search_page(state: &AppState, query: &str, page: u32, clipart: bool) -> AppResult<Vec<ImageCandidate>> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 100 {
        return Err(AppError::new("invalid-path", "Từ khoá tìm ảnh không hợp lệ."));
    }
    let key = cache_key(query, page, clipart);
    if let Some(results) = cached(state, &key) {
        return Ok(results);
    }

    let mut turn = search_turn().await;
    let first = (page as usize * RESULTS_PER_PAGE).to_string();
    let count = RESULTS_PER_PAGE.to_string();
    let mut params = vec![("q", query), ("first", &first), ("count", &count), ("adlt", "strict"), ("mmasync", "1")];
    if clipart {
        params.push(("qft", "+filterui:photo-clipart"));
    }
    let url = Url::parse_with_params("https://www.bing.com/images/async", params).expect("static URL");
    let response = client().get(url).timeout(Duration::from_secs(15)).send().await.map_err(offline);
    *turn = Some(Instant::now());
    drop(turn);
    let response = response?;
    let status = response.status().as_u16();
    let html = response.text().await.map_err(offline)?;
    if looks_blocked(status, &html) {
        return Err(rate_limited());
    }
    if !(200..300).contains(&status) {
        return Err(AppError::new("network", format!("Máy chủ trả về lỗi {status}.")));
    }

    let results: Vec<ImageCandidate> = parse_bing(&html)
        .into_iter()
        .take(RESULTS_PER_PAGE)
        .map(|m| ImageCandidate { url: m.murl, thumbnail_url: m.turl, source_page: m.purl, title: m.t.unwrap_or_default() })
        .collect();
    if !results.is_empty() {
        remember(state, key, &results);
    }
    Ok(results)
}

/// Results with previews, for the picture picker. `page` starts at 0.
#[tauri::command]
pub async fn search_images(state: State<'_, AppState>, query: String, page: u32, clipart: bool) -> AppResult<Vec<ImageHit>> {
    let results = search_page(&state, &query, page, clipart).await?;
    let thumbnails = join_all(results.iter().map(|c| thumbnail_data_url(&c.thumbnail_url))).await;
    // A result whose preview cannot be shown is left out rather than shown blank.
    Ok(results
        .into_iter()
        .zip(thumbnails)
        .filter_map(|(candidate, thumbnail)| Some(ImageHit { candidate, thumbnail: thumbnail? }))
        .collect())
}

/// Results without previews, for filling pictures in the background: one
/// request to Bing per query, and nothing else until a picture is chosen.
#[tauri::command]
pub async fn search_image_candidates(state: State<'_, AppState>, query: String, clipart: bool) -> AppResult<Vec<ImageCandidate>> {
    search_page(&state, &query, 0, clipart).await
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

/// Stroke outlines from Make Me a Hanzi, as published by hanzi-writer-data.
const STROKES_URL: &str = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/";
const MAX_STROKE_BYTES: u64 = 256 * 1024;
const MAX_STROKES: usize = 64;

#[derive(Deserialize)]
struct StrokeData {
    strokes: Vec<String>,
}

fn is_han(c: char) -> bool {
    matches!(c, '\u{3400}'..='\u{4DBF}' | '\u{4E00}'..='\u{9FFF}' | '\u{F900}'..='\u{FAFF}' | '\u{20000}'..='\u{2FFFF}')
}

/// An SVG path made only of the commands and numbers stroke data uses, so it
/// can go into a slide without escaping surprises.
fn is_stroke_path(d: &str) -> bool {
    !d.is_empty() && d.len() <= 4000 && d.chars().all(|c| c.is_ascii_digit() || " MLQCZ.-".contains(c))
}

/// The strokes of one Chinese character, in writing order, as SVG paths on a
/// 1024-unit square. The slide keeps them, so presenting needs no network.
#[tauri::command]
pub async fn hanzi_strokes(character: String) -> AppResult<Vec<String>> {
    let mut chars = character.chars();
    let (Some(c), None) = (chars.next(), chars.next()) else {
        return Err(AppError::new("invalid-path", "Cần đúng một chữ Hán."));
    };
    if !is_han(c) {
        return Err(AppError::new("invalid-path", "Cần đúng một chữ Hán."));
    }
    let url = Url::parse(&format!("{STROKES_URL}{c}.json")).map_err(offline)?;
    let bytes = fetch(url.as_str(), MAX_STROKE_BYTES, Duration::from_secs(15)).await?;
    let missing = || AppError::new("network", "Không có dữ liệu nét viết cho chữ này.");
    let data: StrokeData = serde_json::from_slice(&bytes).map_err(|_| missing())?;
    if data.strokes.is_empty() || data.strokes.len() > MAX_STROKES || !data.strokes.iter().all(|d| is_stroke_path(d)) {
        return Err(missing());
    }
    Ok(data.strokes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stroke_data_is_only_path_commands_and_numbers() {
        assert!(is_stroke_path("M 465 754 Q 507 739 548 721 L 571 706 Z"));
        assert!(!is_stroke_path("M 0 0\"/><script>"));
        assert!(!is_stroke_path(""));
        assert!(is_han('现') && is_han('𠀀') && !is_han('a') && !is_han('。'));
    }

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
    fn bing_thumbnails_are_asked_for_small() {
        assert_eq!(
            small_thumbnail_url("https://ts2.mm.bing.net/th?id=OIP.x&pid=15.1"),
            "https://ts2.mm.bing.net/th?id=OIP.x&pid=15.1&w=240&h=240"
        );
        assert_eq!(small_thumbnail_url("https://example.com/th?id=1"), "https://example.com/th?id=1");
    }

    #[test]
    fn blocked_answers_are_recognised() {
        assert!(looks_blocked(429, ""));
        assert!(looks_blocked(200, "<html>Please solve this CAPTCHA</html>"));
        assert!(!looks_blocked(200, r#"<a m="{}">captcha in a title</a>"#));
        assert!(!looks_blocked(200, "<html>no results</html>"));
    }

    #[test]
    fn cache_keys_separate_pages_and_clipart() {
        assert_eq!(cache_key("Cat", 0, false), cache_key("cat", 0, false));
        assert_ne!(cache_key("cat", 0, false), cache_key("cat", 0, true));
        assert_ne!(cache_key("cat", 0, false), cache_key("cat", 1, false));
    }

    #[test]
    fn mp3_signatures() {
        assert!(is_mp3(b"ID3\x04rest"));
        assert!(is_mp3(&[0xFF, 0xF3, 0x84, 0xC4]));
        assert!(!is_mp3(b"<html>"));
    }
}
