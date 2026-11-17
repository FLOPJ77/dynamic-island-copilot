pub mod notes;
pub mod ollama;
pub mod search;
pub mod settings;
pub mod whatsapp;
pub mod window;

use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_shadow(false);
                let _ = window.show();
                let _ = window::resize_island(window, 320.0, 36.0, Some(8.0));
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "whatsapp" {
                if let tauri::WindowEvent::Focused(false) = event {
                    let _ = window.app_handle().emit("whatsapp-window-blur", ());
                }
            }
            if let tauri::WindowEvent::DragDrop(drag_event) = event {
                match drag_event {
                    tauri::DragDropEvent::Enter { .. } => {
                        if let Some(w) = window.app_handle().get_webview_window(window.label()) {
                            let _ = window::resize_island(w, 380.0, 160.0, None);
                        }
                        let _ = window.emit("island-drag-enter", ());
                    }
                    tauri::DragDropEvent::Drop { paths, .. } => {
                        let name = paths
                            .first()
                            .and_then(|p| p.file_name())
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_else(|| "document.pdf".to_string());
                        if let Some(w) = window.app_handle().get_webview_window(window.label()) {
                            let _ = window::resize_island(w, 480.0, 200.0, None);
                        }
                        let _ = window.emit("island-file-dropped", name);
                    }
                    tauri::DragDropEvent::Leave => {
                        let _ = window.emit("island-drag-leave", ());
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            window::resize_island,
            window::exit_app,
            notes::save_note_file,
            notes::get_notes_folder,
            notes::open_notes_folder,
            ollama::query_ai,
            ollama::query_ollama,
            ollama::list_ollama_models,
            search::open_browser_url,
            search::instant_web_search,
            search::search_web_results,
            search::search_youtube_videos,
            settings::get_soul_file_content,
            settings::save_soul_file_content,
            settings::reset_soul_file_content,
            settings::open_soul_file,
            settings::load_app_settings,
            settings::save_app_settings,
            whatsapp::sync_whatsapp_webview,
            whatsapp::destroy_whatsapp_webview,
            whatsapp::is_island_or_whatsapp_focused,
        ])
        .run(tauri::generate_context!())
        .expect("error while running dynamic island copilot");
}
