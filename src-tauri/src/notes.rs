use std::fs;
use std::path::PathBuf;

fn resolve_notes_dir() -> Result<PathBuf, String> {
    let doc_dir = dirs::document_dir()
        .ok_or_else(|| "Could not locate user Documents directory".to_string())?;
    let notes_dir = doc_dir.join("IslandNotes");
    if !notes_dir.exists() {
        fs::create_dir_all(&notes_dir)
            .map_err(|e| format!("Failed to create IslandNotes directory: {}", e))?;
    }
    Ok(notes_dir)
}

#[tauri::command]
pub fn save_note_file(
    id: String,
    title: String,
    content: String,
    format: Option<String>,
) -> Result<String, String> {
    let notes_dir = resolve_notes_dir()?;

    // Sanitize title for Windows and macOS file systems
    let clean_title: String = title
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();

    let ext = match format.as_deref() {
        Some("md") => "md",
        _ => "txt",
    };

    let clean_title = clean_title.trim();
    let filename = if clean_title.is_empty() {
        format!("note_{}.{}", id, ext)
    } else {
        format!("{}.{}", clean_title, ext)
    };

    let file_path = notes_dir.join(&filename);
    fs::write(&file_path, content.as_bytes())
        .map_err(|e| format!("Failed to write note to {}: {}", file_path.display(), e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_notes_folder() -> Result<String, String> {
    let notes_dir = resolve_notes_dir()?;
    Ok(notes_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_notes_folder() -> Result<(), String> {
    let notes_dir = resolve_notes_dir()?;

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(notes_dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder in Explorer: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(notes_dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder in Finder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(notes_dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    Ok(())
}
