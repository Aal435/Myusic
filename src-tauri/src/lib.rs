mod media;

use media::{create_shared_controller, MediaController, MediaInfo, SharedMediaController};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub width: f64,
    pub height: f64,
    pub position_x: f64,
    pub position_y: f64,
    pub background_color: String,
    pub text_color: String,
    pub control_color: String,
    pub font_size: f64,
    pub idle_opacity: f64,
    pub show_album_art: bool,
    pub show_controls: bool,
    pub active_duration_ms: u64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            width: 500.0,
            height: 160.0,
            position_x: 100.0,
            position_y: 100.0,
            background_color: "rgba(0, 0, 0, 0.0)".to_string(),
            text_color: "#ffffff".to_string(),
            control_color: "#ffffff".to_string(),
            font_size: 24.0,
            idle_opacity: 1.0,
            show_album_art: true,
            show_controls: true,
            active_duration_ms: 5000,
        }
    }
}

fn settings_path() -> PathBuf {
    let config_dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let app_dir = config_dir.join("AppMus");
    fs::create_dir_all(&app_dir).ok();
    app_dir.join("settings.json")
}

#[tauri::command]
async fn get_media_info(controller: State<'_, SharedMediaController>) -> Result<MediaInfo, String> {
    let lock = controller.lock().await;
    match lock.as_ref() {
        Some(ctrl) => ctrl.get_media_info(),
        None => Err("Media controller not initialized".to_string()),
    }
}

#[tauri::command]
async fn send_command(
    command: String,
    controller: State<'_, SharedMediaController>,
) -> Result<(), String> {
    let lock = controller.lock().await;
    let ctrl = lock
        .as_ref()
        .ok_or("Media controller not initialized".to_string())?;

    match command.as_str() {
        "play" => ctrl.play(),
        "pause" => ctrl.pause(),
        "toggle" => ctrl.toggle_play_pause(),
        "next" => ctrl.next(),
        "previous" => ctrl.previous(),
        "shuffle" => ctrl.toggle_shuffle(),
        "repeat" => ctrl.toggle_repeat(),
        _ => Err(format!("Unknown command: {}", command)),
    }
}

#[tauri::command]
fn load_settings() -> Result<AppSettings, String> {
    let path = settings_path();
    if path.exists() {
        let data = fs::read_to_string(&path).map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&data).map_err(|e| format!("Failed to parse settings: {}", e))
    } else {
        Ok(AppSettings::default())
    }
}

#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<(), String> {
    let path = settings_path();
    let data =
        serde_json::to_string_pretty(&settings).map_err(|e| format!("Failed to serialize: {}", e))?;
    fs::write(&path, data).map_err(|e| format!("Failed to write settings: {}", e))
}

// Background poller that emits media updates to the frontend
fn start_media_poller(app: AppHandle, controller: SharedMediaController) {
    tauri::async_runtime::spawn(async move {
        let mut last_title = String::new();
        let mut last_is_playing: Option<bool> = None;

        loop {
            tokio::time::sleep(std::time::Duration::from_millis(1000)).await;

            let lock = controller.lock().await;
            if let Some(ctrl) = lock.as_ref() {
                if let Ok(info) = ctrl.get_media_info() {
                    let title_changed = info.title != last_title;
                    let status_changed = last_is_playing.map_or(true, |p| p != info.is_playing);

                    // Always emit media-update for position syncing
                    let _ = app.emit("media-update", &info);

                    if title_changed || status_changed {
                        last_title = info.title.clone();
                        last_is_playing = Some(info.is_playing);

                        if title_changed {
                            let _ = app.emit("song-changed", &info);
                        }
                    }
                }
            }
            drop(lock);
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let controller = create_shared_controller();
    let controller_clone = controller.clone();

    tauri::Builder::default()
        .manage(controller)
        .invoke_handler(tauri::generate_handler![
            get_media_info,
            send_command,
            load_settings,
            save_settings,
        ])
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let ctrl = controller_clone.clone();

            let quit_i = tauri::menu::MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&quit_i])?;
            let _tray = tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Initialize media controller in background
            tauri::async_runtime::spawn(async move {
                match MediaController::new() {
                    Ok(mc) => {
                        {
                            let mut lock = ctrl.lock().await;
                            *lock = Some(mc);
                        }
                        // Start polling for media changes
                        start_media_poller(app_handle, ctrl);
                    }
                    Err(e) => {
                        eprintln!("Failed to initialize media controller: {}", e);
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
