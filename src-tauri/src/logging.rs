//! Journaux : crash_log.txt, update.log (même dossier que la version Python).

use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

pub const APP_NAME: &str = "PicTone";

/// Version de l'application (source unique : version.txt à la racine du dépôt).
pub fn version() -> &'static str {
    include_str!("../../version.txt").trim()
}

/// Dossiers de journal, par ordre de préférence.
pub fn log_candidates() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    #[cfg(target_os = "macos")]
    if let Some(home) = std::env::var_os("HOME") {
        dirs.push(PathBuf::from(home).join("Library/Logs").join(APP_NAME));
    }
    #[cfg(target_os = "windows")]
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        dirs.push(PathBuf::from(local).join(APP_NAME).join("logs"));
    }
    dirs.push(std::env::temp_dir().join(APP_NAME));
    dirs
}

/// Ajoute `msg` à `file_name`. Renvoie le chemin, ou None si aucun dossier n'est utilisable.
pub fn log_to(file_name: &str, msg: &str) -> Option<PathBuf> {
    let stamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let line = format!("[{stamp}] v{}\n{msg}\n", version());
    for dir in log_candidates() {
        if create_dir_all(&dir).is_err() {
            continue;
        }
        let path = dir.join(file_name);
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
            if f.write_all(line.as_bytes()).is_ok() {
                return Some(path);
            }
        }
    }
    None
}

pub fn log_error(msg: &str) -> Option<PathBuf> {
    log_to("crash_log.txt", msg)
}

pub fn update_log(msg: &str) {
    log_to("update.log", msg);
}

pub fn update_log_path() -> PathBuf {
    log_candidates()
        .into_iter()
        .next()
        .unwrap_or_else(std::env::temp_dir)
        .join("update.log")
}
