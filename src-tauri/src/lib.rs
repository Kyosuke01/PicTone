//! PicTone — éditeur d'images local (Tauri : WebKit sous macOS, WebView2 sous Windows).

mod logging;
mod menus;
mod updater;

use base64::Engine;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, Window, WindowEvent};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;

use logging::{log_error, update_log, version, APP_NAME};

#[derive(Default)]
struct UpdateState(Mutex<updater::UpdateInfo>);

/// Vrai une fois que l'utilisateur a confirmé la fermeture (après la fenêtre de modifications non enregistrées).
static QUIT_CONFIRMED: AtomicBool = AtomicBool::new(false);

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

/// Type MIME d'un fichier ouvrable, d'après son extension (vide si l'extension est inconnue).
fn mime_for_extension(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "bmp" => "image/bmp",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "pictone" => "application/json",
        _ => "",
    }
}

/// Extensions proposées par la boîte d'enregistrement : « jpg » et « jpeg » vont ensemble.
fn save_extensions(ext: &str) -> Vec<String> {
    match ext {
        "jpg" | "jpeg" => vec!["jpg".into(), "jpeg".into()],
        other => vec![other.into()],
    }
}

/// Extension (en minuscules) d'un nom de fichier, « png » par défaut.
fn extension_of(filename: &str) -> String {
    filename.rsplit_once('.').map(|(_, e)| e.to_lowercase()).unwrap_or_else(|| "png".into())
}

/// Boîte native « Ouvrir ». mode = « open » (image ou projet .pictone) ou « layer » (image seulement).
/// Renvoie {name, mime, data_url}, ou None si l'utilisateur annule.
#[tauri::command]
async fn pick_file(app: AppHandle, mode: String) -> Result<Option<Value>, String> {
    let mut dialog = app.dialog().file();
    dialog = if mode == "layer" {
        dialog.add_filter("Images", &["png", "jpg", "jpeg", "bmp", "webp", "gif"])
    } else {
        dialog
            .add_filter("Images et projets PicTone", &["png", "jpg", "jpeg", "bmp", "webp", "gif", "pictone"])
            .add_filter("Projet PicTone", &["pictone"])
            .add_filter("Images", &["png", "jpg", "jpeg", "bmp", "webp", "gif"])
    };
    let Some(picked) = dialog.blocking_pick_file() else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let bytes = std::fs::read(&path).map_err(|e| {
        log_error(&format!("Ouverture : lecture de {} impossible : {e}", path.display()));
        format!("Lecture impossible : {e}")
    })?;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "image".into());
    let mime = mime_for_extension(&extension_of(&name));
    let data_url = format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes));
    Ok(Some(json!({"name": name, "mime": mime, "data_url": data_url})))
}

/// Ouvre toujours la boîte « Enregistrer sous » : une image n'est jamais écrasée sans choix explicite.
/// Renvoie false si l'utilisateur annule ou en cas d'erreur.
#[tauri::command]
async fn save_file(app: AppHandle, data_url: String, filename: String) -> Result<bool, ()> {
    let ext = extension_of(&filename);
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
        .add_filter(format!("Fichier {}", ext.to_uppercase()), &save_extensions(&ext).iter().map(String::as_str).collect::<Vec<_>>())
        .blocking_save_file();
    let Some(picked) = picked else { return Ok(false) }; // annulé
    let Ok(path) = picked.into_path() else { return Ok(false) };
    match std::fs::write(&path, bytes) {
        Ok(()) => Ok(true),
        Err(e) => {
            log_error(&format!("Erreur lors de l'enregistrement : {e}"));
            Ok(false)
        }
    }
}

/// Lit l'image du presse-papiers (pixels RGBA, en base64). None s'il n'y a pas d'image.
#[tauri::command]
fn read_clipboard_image(app: AppHandle) -> Option<Value> {
    let image = app.clipboard().read_image().ok()?;
    Some(json!({
        "width": image.width(),
        "height": image.height(),
        "rgba": base64::engine::general_purpose::STANDARD.encode(image.rgba()),
    }))
}

/// Ferme PicTone sans nouvelle demande (appelée après le choix « Quitter » ou une sauvegarde réussie).
#[tauri::command]
fn quit_app(app: AppHandle) {
    QUIT_CONFIRMED.store(true, Ordering::SeqCst);
    app.exit(0);
}

/// Envoie une commande de menu à l'interface (picToneCommand, web/js/ui.js).
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
        .plugin(tauri_plugin_clipboard_manager::init())
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
        .on_window_event(|window: &Window, event| {
            // Fermer la fenêtre (bouton rouge, ⌘W…) : l'interface demande d'abord s'il faut enregistrer.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if !QUIT_CONFIRMED.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.app_handle().emit("quit-request", ());
                }
            }
        })
        .on_menu_event(|app, event| {
            // Quitter : même confirmation que la fermeture de la fenêtre (⌘Q ne passe pas par elle).
            if event.id().as_ref() == "quit" {
                let _ = app.emit("quit-request", ());
                return;
            }
            // Toutes les commandes (dont « À propos ») passent par l'interface : alert() n'y marche pas.
            send_command(app, event.id().as_ref());
        })
        .invoke_handler(tauri::generate_handler![
            get_version, log_js, check_update, set_command_states, install_update, save_file, pick_file, quit_app, read_clipboard_image
        ])
        .build(tauri::generate_context!());
    let result = result.map(|app| {
        app.run(|app, event| {
            // Cmd+Q / Quitter : même demande que pour la fenêtre.
            if let RunEvent::ExitRequested { api, .. } = event {
                if !QUIT_CONFIRMED.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    let _ = app.emit("quit-request", ());
                }
            }
        })
    });
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

    #[test]
    fn types_mime_des_fichiers_ouvrables() {
        assert_eq!(crate::mime_for_extension("PNG"), "image/png");
        assert_eq!(crate::mime_for_extension("jpg"), "image/jpeg");
        assert_eq!(crate::mime_for_extension("jpeg"), "image/jpeg");
        assert_eq!(crate::mime_for_extension("pictone"), "application/json");
        assert_eq!(crate::mime_for_extension("txt"), "");
    }

    #[test]
    fn extension_du_nom_de_fichier() {
        assert_eq!(crate::extension_of("photo.JPG"), "jpg");
        assert_eq!(crate::extension_of("mon.projet.pictone"), "pictone");
        assert_eq!(crate::extension_of("sans-extension"), "png");
    }

    #[test]
    fn la_boite_d_enregistrement_accepte_jpg_et_jpeg() {
        assert_eq!(crate::save_extensions("jpg"), vec!["jpg", "jpeg"]);
        assert_eq!(crate::save_extensions("jpeg"), vec!["jpg", "jpeg"]);
        assert_eq!(crate::save_extensions("pictone"), vec!["pictone"]);
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
