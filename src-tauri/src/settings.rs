use std::fs;
use std::path::PathBuf;

pub const DEFAULT_SOUL_PROMPT: &str = "you are a good AI assistant, respond briefly dont waste too much tokens";

pub fn resolve_app_dir() -> Result<PathBuf, String> {
    let doc_dir = dirs::document_dir()
        .ok_or_else(|| "Could not locate user Documents directory".to_string())?;
    let app_dir = doc_dir.join("IslandNotes");
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create IslandNotes directory: {}", e))?;
    }
    Ok(app_dir)
}

pub fn get_soul_file_path() -> Result<PathBuf, String> {
    let app_dir = resolve_app_dir()?;
    let soul_path = app_dir.join("assistant.soul");
    if !soul_path.exists() {
        let _ = fs::write(&soul_path, DEFAULT_SOUL_PROMPT.as_bytes());
    }
    Ok(soul_path)
}

#[tauri::command]
pub fn get_soul_file_content() -> Result<String, String> {
    let soul_path = get_soul_file_path()?;
    match fs::read_to_string(&soul_path) {
        Ok(content) => {
            let trimmed = content.trim();
            if trimmed.is_empty() {
                let _ = fs::write(&soul_path, DEFAULT_SOUL_PROMPT.as_bytes());
                Ok(DEFAULT_SOUL_PROMPT.to_string())
            } else {
                Ok(content)
            }
        }
        Err(_) => {
            let _ = fs::write(&soul_path, DEFAULT_SOUL_PROMPT.as_bytes());
            Ok(DEFAULT_SOUL_PROMPT.to_string())
        }
    }
}

#[tauri::command]
pub fn save_soul_file_content(content: String) -> Result<(), String> {
    let soul_path = get_soul_file_path()?;
    fs::write(&soul_path, content.as_bytes())
        .map_err(|e| format!("Failed to save .soul file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn reset_soul_file_content() -> Result<String, String> {
    let soul_path = get_soul_file_path()?;
    fs::write(&soul_path, DEFAULT_SOUL_PROMPT.as_bytes())
        .map_err(|e| format!("Failed to reset .soul file: {}", e))?;
    Ok(DEFAULT_SOUL_PROMPT.to_string())
}

#[tauri::command]
pub fn open_soul_file() -> Result<(), String> {
    let soul_path = get_soul_file_path()?;
    let path_str = soul_path.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("notepad.exe")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("Failed to open .soul file in Notepad: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("Failed to open .soul file: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("Failed to open .soul file: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn load_app_settings() -> Result<serde_json::Value, String> {
    let app_dir = resolve_app_dir()?;
    let settings_path = app_dir.join("settings.json");
    if !settings_path.exists() {
        return Ok(serde_json::json!({}));
    }
    let data = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;
    let val: serde_json::Value = serde_json::from_str(&data)
        .unwrap_or(serde_json::json!({}));
    Ok(val)
}

#[tauri::command]
pub fn save_app_settings(settings: serde_json::Value) -> Result<(), String> {
    let app_dir = resolve_app_dir()?;
    let settings_path = app_dir.join("settings.json");
    let json_str = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&settings_path, json_str.as_bytes())
        .map_err(|e| format!("Failed to save settings.json: {}", e))?;
    Ok(())
}
