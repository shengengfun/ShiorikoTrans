use crate::{
    cli::{self, is_cli_detected},
    config::STORE_FILENAME,
    diagnostics::get_issue_url,
    error::LogError,
    sona::SonaProcess,
};
use eyre::eyre;
use once_cell::sync::Lazy;
use std::fs;
use tauri::{App, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

pub static STATIC_APP: Lazy<std::sync::Mutex<Option<tauri::AppHandle>>> = Lazy::new(|| std::sync::Mutex::new(None));

pub struct SonaState {
    pub process: Option<SonaProcess>,
    pub loaded_model_path: Option<String>,
    pub loaded_gpu_device: Option<i32>,
    pub unload_timeout_minutes: u32,
}

pub fn setup(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    // Create app directories
    let local_app_data_dir = app.path().app_local_data_dir()?;
    let app_config_dir = app.path().app_config_dir()?;
    fs::create_dir_all(&local_app_data_dir)
        .unwrap_or_else(|_| panic!("cant create local app data directory at {}", local_app_data_dir.display()));
    fs::create_dir_all(&app_config_dir)
        .unwrap_or_else(|_| panic!("cant create app config directory at {}", app_config_dir.display()));

    // Manage sona state
    app.manage(Mutex::new(SonaState {
        process: None,
        loaded_model_path: None,
        loaded_gpu_device: None,
        unload_timeout_minutes: 5,
    }));
    app.manage(crate::dictation_indicator::DictationIndicatorRuntime::default());

    let store = app.store(STORE_FILENAME)?;

    // Organize models into purpose sub-folders: transcribe / translate / vad /
    // diarize. Legacy models that live directly in the models folder keep working
    // (the frontend resolves them first — see resolve_aux_model_path).
    {
        let models_folder = store
            .get("models_folder")
            .and_then(|p| p.as_str().map(std::path::PathBuf::from))
            .or_else(|| {
                std::env::current_exe()
                    .ok()
                    .and_then(|exe| exe.parent().map(|dir| dir.to_path_buf()))
                    .and_then(|dir| ["models", "model"].iter().map(|f| dir.join(f)).find(|c| c.is_dir()))
            })
            .unwrap_or_else(|| local_app_data_dir.clone());
        for sub in ["transcribe", "translate", "vad", "diarize"] {
            if let Err(error) = std::fs::create_dir_all(models_folder.join(sub)) {
                tracing::warn!("failed to create models sub-folder {}: {:?}", sub, error);
            }
        }
    }

    // Setup logging to terminal
    {
        let mut app_handle = STATIC_APP.lock().expect("lock");
        *app_handle = Some(app.handle().clone());
    }
    crate::logging::setup_logging(app.handle(), store).unwrap();
    crate::cleaner::clean_old_logs(app.handle()).log_error();
    crate::cleaner::clean_old_files().log_error();
    crate::cleaner::clean_updater_files().log_error();
    tracing::debug!("shiorikotrans App Running");

    // Crash handler

    let _handler = crash_handler::CrashHandler::attach(unsafe {
        crash_handler::make_crash_event(move |cc: &crash_handler::CrashContext| {
            #[cfg(windows)]
            let info = cc.exception_code;

            #[cfg(windows)]
            tracing::error!("Crash exception code: {}", info);

            #[cfg(target_os = "macos")]
            let info = cc.exception;

            #[cfg(target_os = "linux")]
            let info = cc.siginfo;

            #[cfg(unix)]
            tracing::error!("Crash exception code: {:?}", info);

            if let Some(app_handle) = STATIC_APP.lock().expect("lock").as_ref() {
                app_handle
                    .dialog()
                    .message("App crashed with error. Please register to Github and then click report.")
                    .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                    .title("shiorikotrans Crashed")
                    .buttons(MessageDialogButtons::OkCustom("Report".into()))
                    .show(|_| {});
                let _ = tauri_plugin_opener::open_url(get_issue_url(format!("{:?}", info)), None::<&str>);
            }

            crash_handler::CrashEventResult::Handled(true)
        })
    });

    // Log some useful data
    if let Ok(version) = tauri::webview_version() {
        tracing::debug!("webview version: {}", version);
    }

    #[cfg(windows)]
    {
        if let Err(error) = crate::custom_protocol::register() {
            tracing::error!("{:?}", error);
        }
    }

    tracing::debug!("AVX2: {}", crate::cmd::app::is_avx2_enabled());
    tracing::debug!("Executable Architecture: {}", std::env::consts::ARCH);

    // CPU/memory sampling happens off the main thread: the UI polls it every
    // second and `sysinfo`'s CPU refresh blocks, which used to stall the event
    // loop (and therefore window controls) while transcribing.
    crate::cmd::app::start_system_stats_sampler();

    // ffmpeg may live in the app data folder when the slim installer was used,
    // so the lookup needs to know where that is.
    if let Ok(data_dir) = app.path().app_local_data_dir() {
        crate::ffmpeg::set_app_data_dir(data_dir);
    }

    tracing::debug!("APP VERSION: {}", app.package_info().version.to_string());
    tracing::debug!("COMMIT HASH: {}", env!("COMMIT_HASH"));
    tracing::debug!("App Info: {}", crate::diagnostics::get_app_info());

    let app_handle = app.app_handle().clone();
    if is_cli_detected() {
        tracing::debug!("CLI mode");
        tauri::async_runtime::spawn(async move {
            cli::run(&app_handle).await.map_err(|e| eyre!("{:?}", e)).log_error();
        });
    } else {
        tracing::debug!("Non CLI mode");
        // Create main window
        let mut window_builder = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
            .inner_size(1160.0, 740.0)
            .min_inner_size(900.0, 620.0)
            .center()
            .title("ShiorikoTrans")
            .resizable(true)
            .focused(true)
            .shadow(true)
            .visible(true);
        // Frameless window on Windows: the app draws its own title bar (drag
        // region + custom window controls) so the logo/icon can live in it.
        #[cfg(target_os = "windows")]
        {
            window_builder = window_builder.decorations(false);
        }
        let result = window_builder.build();
        if let Err(error) = result {
            tracing::error!("{:?}", error);
        }
        crate::dictation_indicator::initialize(app.handle());
    }
    Ok(())
}
