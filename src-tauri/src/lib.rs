mod assets;
mod error;
mod fsutil;
mod library;
mod session;
mod state;
mod transfer;
mod web;

use state::AppState;
use std::fs;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Resolved through Tauri's path API so each OS gets its own
            // conventional location (Documents, AppData / Application Support).
            let library = app.path().document_dir()?.join("Chinese Lesson Studio");
            let data = app.path().data_dir()?.join("ChineseLessonStudio");
            fs::create_dir_all(&library)?;
            fs::create_dir_all(&data)?;
            // The editor shows lesson images through the asset protocol, which
            // may read the library and nothing else.
            app.asset_protocol_scope().allow_directory(&library, true)?;
            app.manage(AppState::new(library, data));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library::library_dir,
            library::list_lessons,
            library::create_lesson_dir,
            library::read_lesson,
            library::write_lesson,
            library::duplicate_lesson_dir,
            library::trash_lesson,
            session::write_draft,
            session::read_draft,
            session::delete_draft,
            session::acquire_lock,
            session::release_lock,
            assets::import_asset,
            assets::prune_assets,
            web::search_images,
            web::import_image_url,
            web::import_image_bytes,
            web::speak_chinese,
            transfer::read_assets_data,
            transfer::save_export,
            transfer::pick_lesson_file,
            transfer::copy_sibling_assets,
            transfer::write_asset,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Chinese Lesson Studio");
}
