// Tauri IPC Bridge with seamless browser fallback
import { invoke } from '@tauri-apps/api/core';

export const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);

let lastTargetWidth = null;
let lastTargetHeight = null;
let lastTargetOffsetY = null;

/**
 * Dynamically resize and reposition the native desktop window
 */
export async function resizeNativeWindow(width, height, offsetY = null) {
  if (width === lastTargetWidth && height === lastTargetHeight && offsetY === lastTargetOffsetY) {
    return;
  }
  lastTargetWidth = width;
  lastTargetHeight = height;
  lastTargetOffsetY = offsetY;
  if (isTauri) {
    try {
      await invoke('resize_island', { width, height, offsetY });
    } catch (e) {
      console.warn('Tauri window resize failed:', e);
    }
  }
}

/**
 * Save note directly to local PC directory (.txt plain text default, or .md)
 */
export async function saveNoteToDisk(id, title, content, format = 'txt') {
  if (isTauri) {
    try {
      return await invoke('save_note_file', { id, title, content, format });
    } catch (e) {
      console.warn('Tauri save note to disk failed:', e);
    }
  }
  return false;
}

/**
 * Open local IslandNotes folder in native Windows Explorer / Mac Finder
 */
export async function openNotesFolderNative() {
  if (isTauri) {
    try {
      await invoke('open_notes_folder');
      return true;
    } catch (e) {
      console.warn('Tauri open notes folder failed:', e);
    }
  }
  return false;
}

/**
 * Universal AI query (Local Ollama, Google Gemini, OpenAI, Claude, OpenRouter)
 */
export async function queryAiNative(provider, endpoint, model, apiKey, prompt) {
  if (isTauri) {
    try {
      return await invoke('query_ai', { provider, endpoint, model, apiKey, prompt });
    } catch (e) {
      console.warn('Tauri AI query failed:', e);
      throw e;
    }
  }
  return null;
}

/**
 * Native Ollama query via Rust async client (bypasses browser CORS)
 */
export async function queryOllamaNative(endpoint, model, prompt) {
  if (isTauri) {
    try {
      return await invoke('query_ollama', { endpoint, model, prompt });
    } catch (e) {
      console.warn('Tauri native Ollama query failed:', e);
    }
  }
  return null;
}

/**
 * Query Ollama for installed models list
 */
export async function listOllamaModelsNative(endpoint) {
  if (isTauri) {
    try {
      return await invoke('list_ollama_models', { endpoint });
    } catch (e) {
      console.warn('Tauri list ollama models failed:', e);
    }
  }
  return null;
}

/**
 * Launch URL in default system browser
 */
export async function openBrowserUrlNative(url) {
  if (isTauri) {
    try {
      await invoke('open_browser_url', { url });
      return true;
    } catch (e) {
      console.warn('Tauri open browser failed:', e);
    }
  } else {
    window.open(url, '_blank');
    return true;
  }
  return false;
}

/**
 * Instant web search snippet lookup (DuckDuckGo / Wikipedia)
 */
export async function instantWebSearchNative(query) {
  if (isTauri) {
    try {
      return await invoke('instant_web_search', { query });
    } catch (e) {
      console.warn('Tauri instant web search failed:', e);
    }
  }
  return '';
}

/**
 * Real in-island web search returning up to 4 Google/DuckDuckGo result cards
 */
export async function searchWebResultsNative(query) {
  if (isTauri) {
    try {
      return await invoke('search_web_results', { query });
    } catch (e) {
      console.warn('Tauri search web results failed:', e);
    }
  }
  return [];
}

/**
 * Search YouTube videos directly inside the island without an API key
 */
export async function searchYouTubeVideosNative(query) {
  if (isTauri) {
    try {
      return await invoke('search_youtube_videos', { query });
    } catch (e) {
      console.warn('Tauri search youtube videos failed:', e);
    }
  }
  return [];
}

/**
 * Exit the desktop application
 */
export async function exitAppNative() {
  if (isTauri) {
    try {
      await invoke('exit_app');
    } catch (e) {
      console.warn('Tauri exit app failed:', e);
    }
  }
}

/**
 * Load app settings persisted on disk in IslandNotes/settings.json
 */
export async function loadAppSettingsNative() {
  if (isTauri) {
    try {
      return await invoke('load_app_settings');
    } catch (e) {
      console.warn('Tauri load settings failed:', e);
    }
  }
  return null;
}

/**
 * Save app settings to disk in IslandNotes/settings.json
 */
export async function saveAppSettingsNative(settings) {
  if (isTauri) {
    try {
      await invoke('save_app_settings', { settings });
      return true;
    } catch (e) {
      console.warn('Tauri save settings failed:', e);
    }
  }
  return false;
}

/**
 * Read the .soul prompt content from IslandNotes/assistant.soul
 */
export async function getSoulFileContentNative() {
  if (isTauri) {
    try {
      return await invoke('get_soul_file_content');
    } catch (e) {
      console.warn('Tauri get soul failed:', e);
    }
  }
  return null;
}

/**
 * Write updated soul content to IslandNotes/assistant.soul
 */
export async function saveSoulFileContentNative(content) {
  if (isTauri) {
    try {
      await invoke('save_soul_file_content', { content });
      return true;
    } catch (e) {
      console.warn('Tauri save soul failed:', e);
    }
  }
  return false;
}

/**
 * Reset IslandNotes/assistant.soul to the default stock prompt
 */
export async function resetSoulFileContentNative() {
  if (isTauri) {
    try {
      return await invoke('reset_soul_file_content');
    } catch (e) {
      console.warn('Tauri reset soul failed:', e);
    }
  }
  return "you are a good AI assistant, respond briefly dont waste too much tokens";
}

/**
 * Open IslandNotes/assistant.soul in Notepad / default OS editor
 */
export async function openSoulFileNative() {
  if (isTauri) {
    try {
      await invoke('open_soul_file');
      return true;
    } catch (e) {
      console.warn('Tauri open soul file failed:', e);
    }
  }
  return false;
}

/**
 * Sync (create/show/hide/resize/zoom) the native WhatsApp WebView2 overlay inside the Island
 */
export async function syncWhatsappWebviewNative(visible, slotX, slotY, slotW, slotH, zoom = 0.72) {
  if (isTauri) {
    try {
      return await invoke('sync_whatsapp_webview', {
        visible,
        slotX,
        slotY,
        slotW,
        slotH,
        zoom
      });
    } catch (e) {
      console.warn('Tauri sync whatsapp webview failed:', e);
    }
  }
  return false;
}

/**
 * Completely destroy the WhatsApp WebView2 process to free 100% of its RAM (0 MB)
 */
export async function destroyWhatsappWebviewNative() {
  if (isTauri) {
    try {
      await invoke('destroy_whatsapp_webview');
      return true;
    } catch (e) {
      console.warn('Tauri destroy whatsapp webview failed:', e);
    }
  }
  return false;
}

/**
 * Check if either the main Island window or the docked WhatsApp overlay window is currently focused
 */
export async function isIslandOrWhatsappFocusedNative() {
  if (isTauri) {
    try {
      return await invoke('is_island_or_whatsapp_focused');
    } catch (e) {
      console.warn('Tauri check focus failed:', e);
    }
  }
  return false;
}



