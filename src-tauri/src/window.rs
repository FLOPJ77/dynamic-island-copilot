use tauri::{AppHandle, LogicalSize, PhysicalPosition, PhysicalSize, Position, Size, WebviewWindow};

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
}

#[tauri::command]
pub fn resize_island(window: WebviewWindow, width: f64, height: f64, offset_y: Option<f64>) -> Result<(), String> {
    let y_offset = offset_y.unwrap_or(8.0);

    if let Ok(Some(monitor)) = window.current_monitor() {
        let monitor_size: PhysicalSize<u32> = *monitor.size();
        let monitor_pos: PhysicalPosition<i32> = *monitor.position();
        let scale_factor = monitor.scale_factor();

        let physical_w = (width * scale_factor).round() as i32;
        let physical_h = (height * scale_factor).round() as i32;
        let physical_y_offset = (y_offset * scale_factor).round();

        let screen_w = monitor_size.width as f64;
        let pos_x = (monitor_pos.x as f64 + (screen_w - physical_w as f64) / 2.0).round() as i32;
        let pos_y = (monitor_pos.y as f64 + physical_y_offset).round() as i32;

        #[cfg(target_os = "windows")]
        {
            if let Ok(hwnd) = window.hwnd() {
                unsafe {
                    // SWP_NOZORDER (0x0004) | SWP_NOACTIVATE (0x0010) | SWP_NOCOPYBITS (0x0100) | SWP_NOOWNERZORDER (0x0200)
                    SetWindowPos(hwnd.0, std::ptr::null_mut(), pos_x, pos_y, physical_w, physical_h, 0x0314);
                }
            } else {
                let _ = window.set_size(Size::Logical(LogicalSize::new(width, height)));
                let _ = window.set_position(Position::Physical(PhysicalPosition::new(pos_x, pos_y)));
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = window.set_size(Size::Logical(LogicalSize::new(width, height)));
            let _ = window.set_position(Position::Physical(PhysicalPosition::new(pos_x, pos_y)));
        }
    } else {
        let _ = window.set_size(Size::Logical(LogicalSize::new(width, height)));
    }

    Ok(())
}

#[tauri::command]
pub fn exit_app(app_handle: AppHandle) {
    app_handle.exit(0);
}
