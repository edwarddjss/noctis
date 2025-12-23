mod gamma;
mod sensor;
mod magnification;

use gamma::MonitorInfo;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

#[tauri::command]
fn set_gamma(value: f32, monitor: u32) -> Result<(), String> {
    gamma::set_gamma(value, monitor)
}

#[tauri::command]
fn dim_monitor(brightness: f32, monitor: u32) -> Result<(), String> {
    gamma::dim_monitor(brightness, monitor)
}

/// Apply smart auto-adjustment based on screen brightness
/// Uses Magnification API for instant system-wide effect
/// brightness: 0.0-1.0 (screen brightness from sensor)
#[tauri::command]
fn apply_smart_adjustment(brightness: f32) -> Result<(), String> {
    magnification::apply_smart_adjustment(brightness)
}

/// Disable all screen adjustments (restore normal)
#[tauri::command]
fn disable_adjustment() -> Result<(), String> {
    magnification::remove_effects()
}

#[tauri::command]
fn get_sensor_data(x: i32, y: i32, width: i32, height: i32) -> Result<f32, String> {
    sensor::get_screen_brightness(x, y, width, height)
}

#[tauri::command]
fn get_monitors() -> Vec<MonitorInfo> {
    gamma::get_monitors()
}

#[tauri::command]
fn set_hotkey(app: AppHandle, key: String) -> Result<(), String> {
    let key_upper = key.to_uppercase();
    let code = match key_upper.as_str() {
        // Letters A-Z
        "A" | "KEYA" => Code::KeyA,
        "B" | "KEYB" => Code::KeyB,
        "C" | "KEYC" => Code::KeyC,
        "D" | "KEYD" => Code::KeyD,
        "E" | "KEYE" => Code::KeyE,
        "F" | "KEYF" => Code::KeyF,
        "G" | "KEYG" => Code::KeyG,
        "H" | "KEYH" => Code::KeyH,
        "I" | "KEYI" => Code::KeyI,
        "J" | "KEYJ" => Code::KeyJ,
        "K" | "KEYK" => Code::KeyK,
        "L" | "KEYL" => Code::KeyL,
        "M" | "KEYM" => Code::KeyM,
        "N" | "KEYN" => Code::KeyN,
        "O" | "KEYO" => Code::KeyO,
        "P" | "KEYP" => Code::KeyP,
        "Q" | "KEYQ" => Code::KeyQ,
        "R" | "KEYR" => Code::KeyR,
        "S" | "KEYS" => Code::KeyS,
        "T" | "KEYT" => Code::KeyT,
        "U" | "KEYU" => Code::KeyU,
        "V" | "KEYV" => Code::KeyV,
        "W" | "KEYW" => Code::KeyW,
        "X" | "KEYX" => Code::KeyX,
        "Y" | "KEYY" => Code::KeyY,
        "Z" | "KEYZ" => Code::KeyZ,
        // Numbers
        "0" | "DIGIT0" => Code::Digit0,
        "1" | "DIGIT1" => Code::Digit1,
        "2" | "DIGIT2" => Code::Digit2,
        "3" | "DIGIT3" => Code::Digit3,
        "4" | "DIGIT4" => Code::Digit4,
        "5" | "DIGIT5" => Code::Digit5,
        "6" | "DIGIT6" => Code::Digit6,
        "7" | "DIGIT7" => Code::Digit7,
        "8" | "DIGIT8" => Code::Digit8,
        "9" | "DIGIT9" => Code::Digit9,
        // Function keys
        "F1" => Code::F1, "F2" => Code::F2, "F3" => Code::F3, "F4" => Code::F4,
        "F5" => Code::F5, "F6" => Code::F6, "F7" => Code::F7, "F8" => Code::F8,
        "F9" => Code::F9, "F10" => Code::F10, "F11" => Code::F11, "F12" => Code::F12,
        // Navigation
        "INSERT" => Code::Insert,
        "DELETE" => Code::Delete,
        "HOME" => Code::Home,
        "END" => Code::End,
        "PAGEUP" => Code::PageUp,
        "PAGEDOWN" => Code::PageDown,
        "ARROWUP" => Code::ArrowUp,
        "ARROWDOWN" => Code::ArrowDown,
        "ARROWLEFT" => Code::ArrowLeft,
        "ARROWRIGHT" => Code::ArrowRight,
        // Special
        "ESCAPE" => Code::Escape,
        "PAUSE" => Code::Pause,
        "SCROLLLOCK" => Code::ScrollLock,
        "BACKQUOTE" | "`" => Code::Backquote,
        "MINUS" | "-" => Code::Minus,
        "EQUAL" | "=" => Code::Equal,
        "BRACKETLEFT" | "[" => Code::BracketLeft,
        "BRACKETRIGHT" | "]" => Code::BracketRight,
        "BACKSLASH" | "\\" => Code::Backslash,
        "SEMICOLON" | ";" => Code::Semicolon,
        "QUOTE" | "'" => Code::Quote,
        "COMMA" | "," => Code::Comma,
        "PERIOD" | "." => Code::Period,
        "SLASH" | "/" => Code::Slash,
        "SPACE" | " " => Code::Space,
        "TAB" => Code::Tab,
        "CAPSLOCK" => Code::CapsLock,
        "NUMLOCK" => Code::NumLock,
        // Numpad
        "NUMPAD0" => Code::Numpad0, "NUMPAD1" => Code::Numpad1, "NUMPAD2" => Code::Numpad2,
        "NUMPAD3" => Code::Numpad3, "NUMPAD4" => Code::Numpad4, "NUMPAD5" => Code::Numpad5,
        "NUMPAD6" => Code::Numpad6, "NUMPAD7" => Code::Numpad7, "NUMPAD8" => Code::Numpad8,
        "NUMPAD9" => Code::Numpad9,
        "NUMPADADD" => Code::NumpadAdd,
        "NUMPADSUBTRACT" => Code::NumpadSubtract,
        "NUMPADMULTIPLY" => Code::NumpadMultiply,
        "NUMPADDIVIDE" => Code::NumpadDivide,
        "NUMPADDECIMAL" => Code::NumpadDecimal,
        "NUMPADENTER" => Code::NumpadEnter,
        _ => return Err(format!("Unsupported key: {}", key)),
    };
    
    // Unregister all existing shortcuts
    let _ = app.global_shortcut().unregister_all();
    
    // Register new shortcut
    app.global_shortcut()
        .on_shortcut(Shortcut::new(None, code), move |app, _, event| {
            if event.state == ShortcutState::Released {
                let _ = app.emit("toggle-system", ());
            }
        })
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state == ShortcutState::Released && shortcut == &Shortcut::new(None, Code::Insert) {
                        let _ = app.emit("toggle-system", ());
                    }
                })
                .build(),
        )
        .setup(|app| {
            // Register INSERT key as global hotkey
            app.global_shortcut().register(Shortcut::new(None, Code::Insert))?;
            
            // Create tray menu
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            
            // Create tray icon using app's default icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().expect("no icon"))
                .menu(&menu)
                .tooltip("Noctis - Night Vision")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quit" => {
                            // Reset all monitor gamma before quitting
                            let monitors = gamma::get_monitors();
                            for m in &monitors {
                                let _ = gamma::set_gamma(1.0, m.index);
                            }
                            app.exit(0);
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        } else {
                        }
                    }
                })
                .build(app)?;
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![set_gamma, dim_monitor, get_sensor_data, get_monitors, set_hotkey, apply_smart_adjustment, disable_adjustment])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
