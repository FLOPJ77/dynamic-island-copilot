use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "windows")]
extern "system" {
    fn SetWindowPos(
        hwnd: *mut std::ffi::c_void,
        hwnd_insert_after: *mut std::ffi::c_void,
        x: i32,
        y: i32,
        cx: i32,
        cy: i32,
        flags: u32,
    ) -> i32;

    fn SetWindowLongPtrW(
        hwnd: *mut std::ffi::c_void,
        n_index: i32,
        dw_new_long: isize,
    ) -> isize;
}

const WHATSAPP_INIT_SCRIPT: &str = r#"
(function() {
  const injectCompactStyle = () => {
    if (document.getElementById('island-wa-compact-style')) return;
    const style = document.createElement('style');
    style.id = 'island-wa-compact-style';
    style.textContent = `
      html, body, #app, #app > div, .app-wrapper-web, .app-wrapper-web > div, ._aigs {
        min-width: 0 !important;
        min-height: 0 !important;
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      ::-webkit-scrollbar {
        width: 4px !important;
        height: 4px !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCompactStyle);
  } else {
    injectCompactStyle();
  }
  setInterval(injectCompactStyle, 1500);
})();
"#;

#[tauri::command]
pub async fn sync_whatsapp_webview(
    app: AppHandle,
    visible: bool,
    slot_x: f64,
    slot_y: f64,
    slot_w: f64,
    slot_h: f64,
    zoom: Option<f64>,
) -> Result<bool, String> {
    if !visible {
        if let Some(wa_win) = app.get_webview_window("whatsapp") {
            let _ = wa_win.hide();
        }
        return Ok(app.get_webview_window("whatsapp").is_some());
    }

    let main_win = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let scale_factor = main_win.scale_factor().unwrap_or(1.0);
    let main_pos = main_win
        .outer_position()
        .unwrap_or(PhysicalPosition::new(0, 0));

    let phys_x = main_pos.x + (slot_x * scale_factor).round() as i32;
    let phys_y = main_pos.y + (slot_y * scale_factor).round() as i32;
    let phys_w = (slot_w * scale_factor).round().max(100.0) as i32;
    let phys_h = (slot_h * scale_factor).round().max(80.0) as i32;

    let wa_win = if let Some(existing) = app.get_webview_window("whatsapp") {
        existing
    } else {
        let parsed_url = "https://web.whatsapp.com"
            .parse()
            .map_err(|e| format!("Invalid URL: {}", e))?;

        let win = WebviewWindowBuilder::new(&app, "whatsapp", WebviewUrl::External(parsed_url))
            .title("WhatsApp Dynamic Island")
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .visible(false)
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
            .initialization_script(WHATSAPP_INIT_SCRIPT)
            .build()
            .map_err(|e| format!("Failed to create WhatsApp webview: {}", e))?;

        #[cfg(target_os = "windows")]
        {
            if let (Ok(wa_hwnd), Ok(main_hwnd)) = (win.hwnd(), main_win.hwnd()) {
                unsafe {
                    // GWLP_HWNDPARENT (-8): Set main island window as owner so WhatsApp always stays directly above it
                    SetWindowLongPtrW(wa_hwnd.0, -8, main_hwnd.0 as isize);
                }
            }
        }

        win
    };

    if let Some(z) = zoom {
        let _ = wa_win.set_zoom(z);
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = wa_win.hwnd() {
            unsafe {
                // SWP_NOACTIVATE (0x0010) | SWP_NOZORDER (0x0004) | SWP_NOOWNERZORDER (0x0200)
                SetWindowPos(
                    hwnd.0,
                    std::ptr::null_mut(),
                    phys_x,
                    phys_y,
                    phys_w,
                    phys_h,
                    0x0214,
                );
            }
        } else {
            let _ = wa_win.set_position(Position::Physical(PhysicalPosition::new(phys_x, phys_y)));
            let _ = wa_win.set_size(Size::Physical(PhysicalSize::new(phys_w as u32, phys_h as u32)));
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = wa_win.set_position(Position::Physical(PhysicalPosition::new(phys_x, phys_y)));
        let _ = wa_win.set_size(Size::Physical(PhysicalSize::new(phys_w as u32, phys_h as u32)));
    }

    let _ = wa_win.show();
    Ok(true)
}

#[tauri::command]
pub async fn destroy_whatsapp_webview(app: AppHandle) -> Result<(), String> {
    if let Some(wa_win) = app.get_webview_window("whatsapp") {
        let _ = wa_win.hide();
        let _ = wa_win.destroy();
    }
    Ok(())
}

#[tauri::command]
pub fn is_island_or_whatsapp_focused(app: AppHandle) -> bool {
    let main_focused = app
        .get_webview_window("main")
        .and_then(|w| w.is_focused().ok())
        .unwrap_or(false);
    let wa_focused = app
        .get_webview_window("whatsapp")
        .and_then(|w| w.is_focused().ok())
        .unwrap_or(false);
    main_focused || wa_focused
}
