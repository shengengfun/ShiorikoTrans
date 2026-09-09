// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod analytics;
mod cleaner;
mod cli;
mod cmd;
mod config;
mod diagnostics;
mod dictation_indicator;
mod error;
mod ffmpeg;
mod logging;
mod setup;
mod sona;
mod transcript;
use tauri::{Emitter, Manager};

#[cfg(target_os = "macos")]
mod dock;

#[cfg(windows)]
mod custom_protocol;

use eyre::{eyre, Result};
use tauri_plugin_window_state::StateFlags;

use error::LogError;

#[tokio::main]
async fn main() -> Result<()> {
    // Attach console in Windows:
    #[cfg(all(windows, not(debug_assertions)))]
    cli::attach_console();

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            tracing::debug!("{}, {argv:?}, {cwd}", app.package_info().name);
            if let Some(webview) = app.get_webview_window("main") {
                webview.set_focus().map_err(|e| eyre!("{:?}", e)).log_error();
            }
            app.emit("single-instance", argv).map_err(|e| eyre!("{:?}", e)).log_error();
        }))
        .setup(|app| {
            setup::setup(app)?;
            analytics::track_event(app, analytics::events::APP_STARTED);
            Ok(())
        })
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(!StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init());

    if analytics::is_aptabase_configured() {
        let options = tauri_plugin_aptabase::InitOptions {
            host: Some(analytics::APTABASE_BASE_URL.to_string()),
            ..Default::default()
        };
        builder = builder.plugin(
            tauri_plugin_aptabase::Builder::new(analytics::APTABASE_APP_KEY)
                .with_options(options)
                .build(),
        );
    }

    #[cfg(feature = "keepawake")]
    {
        builder = builder.plugin(tauri_plugin_keepawake::init());
    }

    let app = builder
        .invoke_handler(tauri::generate_handler![
            cmd::download::download_file,
            cmd::app::get_cargo_features,
            cmd::transcribe::transcribe,
            cmd::files::glob_files,
            cmd::download::download_model,
            cmd::sona_cmd::load_model,
            cmd::sona_cmd::get_gpu_devices,
            cmd::sona_cmd::get_model_metadata,
            cmd::sona_cmd::get_api_base_url,
            cmd::sona_cmd::start_api_server,
            cmd::sona_cmd::stop_api_server,
            cmd::app::track_analytics_event,
            cmd::app::get_commit_hash,
            cmd::app::is_avx2_enabled,
            cmd::app::is_online,
            cmd::files::get_path_dst,
            cmd::app::get_logs,
            cmd::files::open_path,
            cmd::files::get_save_path,
            cmd::files::get_argv,
            cmd::files::get_default_recording_path,
            cmd::audio::get_audio_devices,
            cmd::audio::start_record,
            cmd::app::get_models_folder,
            cmd::app::get_system_stats,
            cmd::app::get_logs_folder,
            cmd::app::show_log_path,
            cmd::app::show_temp_path,
            cmd::files::get_ffmpeg_path,
            cmd::ytdlp::download_audio,
            cmd::ytdlp::get_temp_path,
            cmd::ytdlp::get_latest_ytdlp_version,
            cmd::app::is_crashed_recently,
            cmd::app::rename_crash_file,
            cmd::app::type_text,
            cmd::permissions::request_system_audio_permission,
            cmd::permissions::open_system_audio_settings,
            dictation_indicator::get_dictation_indicator_enabled,
            dictation_indicator::set_dictation_indicator_enabled,
            dictation_indicator::show_dictation_indicator,
            dictation_indicator::get_dictation_indicator_state,
            dictation_indicator::dictation_indicator_ready,
            dictation_indicator::hide_dictation_indicator
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| match event {
        // When the main window is closed (X button or custom window control), exit
        // the whole app immediately. A hidden background window (e.g. the
        // dictation indicator) would otherwise keep the process alive, which made
        // the app impossible to quit except via the Task Manager.
        tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::CloseRequested { .. },
            ..
        } if label == "main" => {
            kill_sona_process_tree();
            std::process::exit(0);
        }
        tauri::RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::Destroyed,
            ..
        } if label == "main" => {
            app.exit(0);
        }
        tauri::RunEvent::ExitRequested { .. } => {
            kill_sona_process_tree();
        }
        tauri::RunEvent::Exit => {
            kill_sona_process_tree();
            // Force immediate process exit to prevent the tokio runtime from
            // hanging on unfinished async tasks (e.g. sona HTTP requests with
            // long timeouts) during shutdown. This guarantees the app and all
            // its child processes terminate instantly.
            std::process::exit(0);
        }
        _ => {}
    });
    Ok(())
}

/// Kills the sona process tree synchronously using the globally stored PID.
/// This function does NOT use any async operations or locks, making it safe
/// to call during application shutdown when the async runtime may be unavailable.
fn kill_sona_process_tree() {
    let pid = sona::SONA_PID.load(std::sync::atomic::Ordering::SeqCst);
    if pid == 0 {
        return;
    }
    tracing::info!("killing sona process tree (PID {}) on exit", pid);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("kill").args(["-9", &pid.to_string()]).output();
    }

    sona::SONA_PID.store(0, std::sync::atomic::Ordering::SeqCst);
}
