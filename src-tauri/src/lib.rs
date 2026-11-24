//! PicTone — éditeur d'images local (Tauri : WebKit sous macOS, WebView2 sous Windows).

mod logging;
mod menus;
mod updater;

use base64::Engine;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use logging::{log_error, update_log, version, APP_NAME};

#[derive(Default)]
struct UpdateState(Mutex<updater::UpdateInfo>);

#[tauri::command]
fn get_version() -> String {
    version().to_string()
}

/// Reçoit les traces de l'interface dans update.log.
#[tauri::command]
fn log_js(message: String) -> bool {
    update_log(&format!("[interface] {}", message.chars().take(500).collect::<String>()));
    true
}

/// Renvoie {available, version, up_to_date}. Ne renvoie jamais d'erreur.
#[tauri::command]
async fn check_update(state: State<'_, UpdateState>) -> Result<Value, ()> {
    let info = tauri::async_runtime::spawn_blocking(|| updater::check(version()))
        .await
        .unwrap_or_default();
    let result = json!({"available": info.available, "version": info.version, "up_to_date": info.up_to_date});
    *state.0.lock().unwrap() = info;
    update_log(&format!("Réponse envoyée à l'interface : {result}"));
    Ok(result)
}

/// Active ou grise les éléments de menu selon les commandes disponibles dans l'interface.
#[tauri::command]
fn set_command_states(states: HashMap<String, bool>, menu: State<'_, menus::MenuState>) -> bool {
    let items = menu.0.lock().unwrap();
    let mut matched = 0;
    for (id, enabled) in &states {
        if let Some(item) = items.get(id) {
            if item.set_enabled(*enabled).is_ok() {
                matched += 1;
            }
        }
    }
    update_log(&format!("menus : {matched}/{} éléments mis à jour", states.len()));
    true
}

/// Installe la mise à jour trouvée puis ferme l'app (un script la remplace et la relance).
#[tauri::command]
async fn install_update(app: AppHandle, state: State<'_, UpdateState>) -> Result<Value, ()> {
    let info = state.0.lock().unwrap().clone();
    update_log(&format!("Clic sur « Mettre à jour » : version={}, disponible={}", info.version, info.available));
    if !info.available {
        return Ok(json!({"ok": false, "error": "Aucune mise à jour disponible."}));
    }

    let to_install = info.clone();
    let native = tauri::async_runtime::spawn_blocking(move || updater::install_native(&to_install))
        .await
        .unwrap_or_else(|e| Some(Err(e.to_string())));
    match native {
        Some(Ok(())) => {
            // Laisse le temps de répondre à l'interface, puis ferme : le script attend la fin du processus.
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                tokio_sleep(500).await;
                handle.exit(0);
            });
            Ok(json!({"ok": true}))
        }
        Some(Err(e)) => {
            update_log(&format!("ÉCHEC de l'installation : {e}"));
            Ok(json!({"ok": false, "error": e}))
        }
        None => {
            update_log(&format!("Mode : téléchargement manuel ({}).", info.exe_url));
            updater::open_url(&info.exe_url);
            Ok(json!({"ok": true, "manual": true}))
        }
    }
}

async fn tokio_sleep(ms: u64) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(std::time::Duration::from_millis(ms))).await;
}

/// Ouvre « Enregistrer sous » puis écrit l'image décodée. false si annulé ou en cas d'erreur.
#[tauri::command]
async fn save_file(app: AppHandle, data_url: String, filename: String) -> Result<bool, ()> {
    let ext = filename.rsplit_once('.').map(|(_, e)| e.to_lowercase()).unwrap_or_else(|| "png".into());
    let ext = if ext == "jpg" { "jpeg".to_string() } else { ext };
    let Some((_, encoded)) = data_url.split_once(',') else {
        log_error("Enregistrement : data URL invalide.");
        return Ok(false);
    };
    let bytes = match base64::engine::general_purpose::STANDARD.decode(encoded) {
        Ok(b) => b,
        Err(e) => {
            log_error(&format!("Enregistrement : décodage impossible : {e}"));
            return Ok(false);
        }
    };

    let picked = app
        .dialog()
        .file()
        .set_file_name(&filename)
        .add_filter(format!("Fichier {}", ext.to_uppercase()), &[ext.as_str()])
        .blocking_save_file();
    let Some(path) = picked else { return Ok(false) }; // annulé
    let Ok(path) = path.into_path() else { return Ok(false) };
    match std::fs::write(&path, bytes) {
        Ok(()) => Ok(true),
        Err(e) => {
            log_error(&format!("Erreur lors de l'enregistrement : {e}"));
            Ok(false)
        }
    }
}

/// Envoie une commande de menu à l'interface (picToneCommand, app.js).
fn send_command(app: &AppHandle, id: &str) {
    if let Some(window) = app.get_webview_window("main") {
        if window.eval(format!("picToneCommand('{id}')")).is_err() {
            log_error(&format!("Commande de menu « {id} » impossible."));
        }
    }
}

pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(UpdateState::default())
        .manage(menus::MenuState::default())
        .setup(|app| {
            let handle = app.handle();
            let (menu, items) = menus::build(handle)?;
            app.set_menu(menu)?;
            *app.state::<menus::MenuState>().0.lock().unwrap() = items;
            if let Some(window) = app.get_webview_window("main") {
                window.set_title(&format!("{APP_NAME}  —  v{}", version()))?;
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            // Toutes les commandes (dont « À propos ») passent par l'interface : alert() n'y marche pas.
            send_command(app, event.id().as_ref());
        })
        .invoke_handler(tauri::generate_handler![
            get_version, log_js, check_update, set_command_states, install_update, save_file
        ])
        .run(tauri::generate_context!());
    if let Err(e) = result {
        let path = log_error(&format!("Erreur au démarrage : {e}"));
        eprintln!("{APP_NAME} a rencontré une erreur : {e} ({path:?})");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn la_version_est_lisible() {
        assert!(crate::updater::parse_version(crate::logging::version()).is_some());
    }

    /// version.txt, Cargo.toml et package.json doivent rester alignés.
    #[test]
    fn les_versions_sont_alignees() {
        let v = crate::logging::version();
        assert_eq!(env!("CARGO_PKG_VERSION"), v, "Cargo.toml ≠ version.txt");
        let pkg = include_str!("../../package.json");
        assert!(pkg.contains(&format!("\"version\": \"{v}\"")), "package.json ≠ version.txt");
    }
}
