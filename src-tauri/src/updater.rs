//! Mise à jour automatique via les Releases GitHub.
//!
//! - macOS : le .dmg est téléchargé, son SHA256 vérifié, puis monté ; l'app qu'il contient
//!   remplace l'ancienne et PicTone est relancé.
//! - Autres systèmes : le téléchargement s'ouvre dans le navigateur.

use crate::logging::{update_log, update_log_path};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

const REPO: &str = "Kyosuke01/PicTone";
const DOWNLOAD_PREFIX: &str = "https://github.com/Kyosuke01/PicTone/releases/download/";
const SUMS_NAME: &str = "SHA256SUMS.txt";

#[derive(Clone, Debug, Default, Serialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub up_to_date: bool,
    pub version: String,
    #[serde(skip)]
    pub exe_name: String,
    #[serde(skip)]
    pub exe_url: String,
    #[serde(skip)]
    pub sums_url: String,
}

/// "v3.0.1" -> Some([3, 0, 1]) ; None si la version est illisible.
pub fn parse_version(text: &str) -> Option<Vec<u32>> {
    let t = text.trim();
    let t = t.strip_prefix('v').unwrap_or(t);
    if t.is_empty() {
        return None;
    }
    let parts: Option<Vec<u32>> = t.split('.').map(|p| p.parse::<u32>().ok()).collect();
    parts.filter(|p| p.len() <= 4)
}

/// Compare deux versions (les composantes manquantes valent 0).
pub fn is_newer(latest: &[u32], current: &[u32]) -> bool {
    let n = latest.len().max(current.len());
    for i in 0..n {
        let a = latest.get(i).copied().unwrap_or(0);
        let b = current.get(i).copied().unwrap_or(0);
        if a != b {
            return a > b;
        }
    }
    false
}

/// Nom d'asset attendu pour la plateforme : PicTone_vX.Y.Z_macOS.dmg ou ..._Windows.exe.
pub fn asset_matches(name: &str) -> bool {
    let suffix = if cfg!(target_os = "macos") { "_macOS.dmg" } else { "_Windows.exe" };
    match name.strip_prefix("PicTone_v").and_then(|n| n.strip_suffix(suffix)) {
        Some(v) => parse_version(v).is_some(),
        None => false,
    }
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(10))
        .user_agent("PicTone-updater")
        .build()
}

/// Chemin du .app contenant l'exécutable courant (macOS), sinon None.
pub fn app_bundle_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let bundle = exe.parent()?.parent()?.parent()?.to_path_buf();
    (bundle.extension().and_then(|e| e.to_str()) == Some("app")).then_some(bundle)
}

pub fn can_update_macos() -> bool {
    cfg!(target_os = "macos") && app_bundle_path().is_some()
}

/// Les contrôles n'ont lieu que dans l'application installée (bundle macOS, build final).
fn is_packaged() -> bool {
    if cfg!(target_os = "macos") {
        app_bundle_path().is_some()
    } else {
        !cfg!(debug_assertions)
    }
}

pub fn check(current_version: &str) -> UpdateInfo {
    update_log(&format!(
        "Vérification (version installée : {current_version}, empaquetée : {})",
        is_packaged()
    ));
    let none = UpdateInfo::default();
    let Some(current) = parse_version(current_version) else {
        update_log("Vérification ignorée : version illisible.");
        return none;
    };
    if !is_packaged() {
        update_log("Vérification ignorée : application non empaquetée.");
        return none;
    }
    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let release: serde_json::Value = match agent().get(&url).call().and_then(|r| r.into_json().map_err(Into::into)) {
        Ok(v) => v,
        Err(e) => {
            update_log(&format!("Erreur réseau ou réponse invalide : {e}"));
            return none;
        }
    };
    interpret_release(&release, &current)
}

/// Analyse la réponse de l'API GitHub (séparé de `check` pour être testable).
pub fn interpret_release(release: &serde_json::Value, current: &[u32]) -> UpdateInfo {
    let none = UpdateInfo::default();
    let tag = release.get("tag_name").and_then(|t| t.as_str()).unwrap_or("");
    let Some(latest) = parse_version(tag) else {
        update_log(&format!("Tag de release illisible : {tag:?}"));
        return none;
    };
    let latest_text = latest.iter().map(|n| n.to_string()).collect::<Vec<_>>().join(".");
    if !is_newer(&latest, current) {
        update_log(&format!("À jour (dernière release : {latest_text})."));
        return UpdateInfo { up_to_date: true, version: latest_text, ..none };
    }
    let mut setup: Option<(String, String)> = None;
    let mut sums: Option<String> = None;
    for asset in release.get("assets").and_then(|a| a.as_array()).into_iter().flatten() {
        let name = asset.get("name").and_then(|n| n.as_str()).unwrap_or("");
        let url = asset.get("browser_download_url").and_then(|n| n.as_str()).unwrap_or("");
        if name == SUMS_NAME {
            sums = Some(url.to_string());
        } else if setup.is_none() && asset_matches(name) {
            setup = Some((name.to_string(), url.to_string()));
        }
    }
    let (Some((exe_name, exe_url)), Some(sums_url)) = (setup, sums) else {
        update_log(&format!("Release {latest_text} sans fichier attendu."));
        return none;
    };
    // Sécurité : on ne télécharge que depuis les releases du dépôt.
    if !(exe_url.starts_with(DOWNLOAD_PREFIX) && sums_url.starts_with(DOWNLOAD_PREFIX)) {
        update_log("URL de téléchargement hors du dépôt : refusée.");
        return none;
    }
    update_log(&format!("Mise à jour disponible : {latest_text} ({exe_name})."));
    UpdateInfo { available: true, up_to_date: false, version: latest_text, exe_name, exe_url, sums_url }
}

/// Lit SHA256SUMS.txt et renvoie l'empreinte (minuscules) de `exe_name`.
pub fn expected_hash(sums: &str, exe_name: &str) -> Option<String> {
    sums.lines().find_map(|line| {
        let (digest, name) = line.trim().split_once("  ")?;
        (name == exe_name).then(|| digest.to_lowercase())
    })
}

fn download(url: &str, dest: &Path) -> Result<String, String> {
    let response = agent().get(url).call().map_err(|e| e.to_string())?;
    let mut reader = response.into_reader();
    let mut out = File::create(dest).map_err(|e| e.to_string())?;
    let mut sha = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        sha.update(&buf[..n]);
        out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
    }
    Ok(sha.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

fn download_verified(update: &UpdateInfo, dest: &Path) -> Result<(), String> {
    let sums = agent().get(&update.sums_url).call().map_err(|e| e.to_string())?
        .into_string().map_err(|e| e.to_string())?;
    let expected = expected_hash(&sums, &update.exe_name)
        .ok_or_else(|| format!("Empreinte introuvable pour {}.", update.exe_name))?;
    update_log(&format!("Téléchargement de {}…", update.exe_name));
    if download(&update.exe_url, dest)? != expected {
        update_log("Empreinte SHA256 différente : téléchargement rejeté.");
        return Err("Le fichier téléchargé est corrompu (empreinte SHA256 différente).".into());
    }
    update_log("Empreinte vérifiée.");
    Ok(())
}

/// Ouvre une URL dans le navigateur par défaut.
pub fn open_url(url: &str) {
    #[cfg(target_os = "macos")]
    let _ = Command::new("open").arg(url).spawn();
    #[cfg(target_os = "windows")]
    let _ = Command::new("cmd").args(["/C", "start", "", url]).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let _ = Command::new("xdg-open").arg(url).spawn();
}

#[cfg(target_os = "macos")]
fn stage_macos_app(update: &UpdateInfo, work: &Path) -> Result<PathBuf, String> {
    let dmg = work.join(&update.exe_name);
    download_verified(update, &dmg)?;
    let mount = work.join("volume");
    std::fs::create_dir_all(&mount).map_err(|e| e.to_string())?;
    let attach = Command::new("hdiutil")
        .args(["attach", "-nobrowse", "-readonly", "-noverify", "-noautoopen", "-mountpoint"])
        .arg(&mount).arg(&dmg).output().map_err(|e| e.to_string())?;
    if !attach.status.success() {
        return Err("Impossible de monter le .dmg.".into());
    }
    let staged = work.join("PicTone.app");
    let source = mount.join("PicTone.app");
    let result = if source.is_dir() {
        Command::new("ditto").arg(&source).arg(&staged).status().map_err(|e| e.to_string())
            .and_then(|s| if s.success() { Ok(()) } else { Err("Copie de l'application impossible.".to_string()) })
    } else {
        Err("Le .dmg ne contient pas PicTone.app.".to_string())
    };
    let _ = Command::new("hdiutil").args(["detach", "-quiet"]).arg(&mount).output();
    result?;
    update_log("Nouvelle version copiée et prête.");
    Ok(staged)
}

/// Remplace l'app par la nouvelle version puis la relance (script détaché).
#[cfg(target_os = "macos")]
pub fn install_macos(update: &UpdateInfo) -> Result<(), String> {
    let app = app_bundle_path().ok_or("La mise à jour automatique n'est disponible que dans l'application Mac.")?;
    let parent = app.parent().ok_or("Dossier de l'application introuvable.")?.to_path_buf();
    if !is_writable(&parent) {
        return Err(format!("PicTone ne peut pas être remplacé dans {}. Place-le dans Applications.", parent.display()));
    }
    let work = std::env::temp_dir().join(format!("PicTone_update_{}", std::process::id()));
    std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let staged = stage_macos_app(update, &work)?;
    let backup = work.join("previous.app");
    let script = work.join("apply_update.sh");
    let log_file = update_log_path();
    let pid = std::process::id();
    let body = format!(
        r#"#!/bin/sh
trap '' HUP INT TERM
LOG="{log}"
log() {{ mkdir -p "$(dirname "$LOG")" 2>/dev/null; echo "[$(date '+%Y-%m-%d %H:%M:%S')] script : $1" >> "$LOG"; }}
log "démarrage, attente de la fermeture de PicTone (pid {pid})"
waited=0
while kill -0 {pid} 2>/dev/null; do
  sleep 0.2
  waited=$((waited + 1))
  if [ "$waited" -ge 600 ]; then log "PicTone est toujours ouvert après 120 s : abandon"; exit 1; fi
done
log "PicTone fermé, remplacement de l'application"
if mv "{app}" "{backup}" 2>>"$LOG"; then
  if ditto "{staged}" "{app}" 2>>"$LOG"; then
    log "nouvelle version installée"
  else
    log "échec de la copie : restauration de l'ancienne version"
    rm -rf "{app}"
    mv "{backup}" "{app}" 2>>"$LOG"
  fi
else
  log "échec : ancienne version impossible à déplacer"
fi
if open "{app}" 2>>"$LOG"; then log "relance de PicTone demandée"; else log "échec de la relance"; fi
rm -rf "{work}"
"#,
        log = log_file.display(),
        pid = pid,
        app = app.display(),
        backup = backup.display(),
        staged = staged.display(),
        work = work.display(),
    );
    std::fs::write(&script, body).map_err(|e| e.to_string())?;
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    use std::os::unix::process::CommandExt;
    Command::new("/bin/sh")
        .arg(&script)
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .map_err(|e| e.to_string())?;
    update_log("Remplacement lancé : PicTone va redémarrer.");
    Ok(())
}

/// Windows : l'application est installée (le désinstalleur de l'installeur est à côté de l'exécutable).
/// La version portable n'en a pas : elle se met à jour par téléchargement manuel.
#[cfg(windows)]
pub fn can_update_windows() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("uninstall.exe").is_file()))
        .unwrap_or(false)
}

/// Windows : télécharge et vérifie l'installeur, puis lance (après la fermeture de l'app)
/// une installation silencieuse suivie de la relance de PicTone.
#[cfg(windows)]
pub fn install_windows(update: &UpdateInfo) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const DETACHED_PROCESS: u32 = 0x0000_0008;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let work = std::env::temp_dir().join(format!("PicTone_update_{}", std::process::id()));
    std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let setup = work.join(&update.exe_name);
    download_verified(update, &setup)?;

    // Pause de 3 s (l'app se ferme), installation silencieuse, relance.
    let line = format!(
        "ping -n 4 127.0.0.1 >nul & \"{}\" /S & start \"\" \"{}\"",
        setup.display(),
        exe.display()
    );
    Command::new("cmd")
        .raw_arg(format!("/C \"{line}\""))
        .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    update_log("Installation Windows lancée : PicTone va redémarrer.");
    Ok(())
}

/// Installe la mise à jour par la voie native de la plateforme.
/// None : pas de mise à jour automatique possible ici (téléchargement manuel).
pub fn install_native(update: &UpdateInfo) -> Option<Result<(), String>> {
    #[cfg(target_os = "macos")]
    if can_update_macos() {
        return Some(install_macos(update));
    }
    #[cfg(windows)]
    if can_update_windows() {
        return Some(install_windows(update));
    }
    let _ = update;
    None
}

#[cfg(target_os = "macos")]
fn is_writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".pictone_write_test_{}", std::process::id()));
    let ok = std::fs::write(&probe, b"").is_ok();
    let _ = std::fs::remove_file(&probe);
    ok
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_accepte_v_et_rejette_le_reste() {
        assert_eq!(parse_version("v3.4.0"), Some(vec![3, 4, 0]));
        assert_eq!(parse_version(" 3.4 "), Some(vec![3, 4]));
        assert_eq!(parse_version("abc"), None);
        assert_eq!(parse_version(""), None);
        assert_eq!(parse_version("1.2.3.4.5"), None);
    }

    #[test]
    fn comparaison_de_versions() {
        assert!(is_newer(&[3, 4, 0], &[3, 3, 24]));
        assert!(!is_newer(&[3, 4, 0], &[3, 4, 0]));
        assert!(!is_newer(&[3, 4], &[3, 4, 0]));
        assert!(is_newer(&[3, 4, 1], &[3, 4]));
        assert!(!is_newer(&[3, 3, 24], &[3, 4, 0]));
    }

    #[test]
    fn hash_attendu_trouve_le_bon_fichier() {
        let sums = "AAA111  PicTone_v3.4.0_macOS.dmg\nbbb222  autre.exe\n";
        assert_eq!(expected_hash(sums, "PicTone_v3.4.0_macOS.dmg").as_deref(), Some("aaa111"));
        assert_eq!(expected_hash(sums, "inconnu"), None);
    }

    fn release(tag: &str, url_prefix: &str) -> serde_json::Value {
        let name = if cfg!(target_os = "macos") { "PicTone_v9.9.9_macOS.dmg" } else { "PicTone_v9.9.9_Windows.exe" };
        json!({"tag_name": tag, "assets": [
            {"name": name, "browser_download_url": format!("{url_prefix}{name}")},
            {"name": "SHA256SUMS.txt", "browser_download_url": format!("{url_prefix}SHA256SUMS.txt")},
        ]})
    }

    #[test]
    fn release_plus_recente_est_proposee() {
        let r = release("v9.9.9", DOWNLOAD_PREFIX);
        let info = interpret_release(&r, &[3, 4, 0]);
        assert!(info.available);
        assert_eq!(info.version, "9.9.9");
    }

    #[test]
    fn release_identique_est_a_jour() {
        let info = interpret_release(&release("v3.4.0", DOWNLOAD_PREFIX), &[3, 4, 0]);
        assert!(!info.available && info.up_to_date);
    }

    #[test]
    fn url_hors_depot_est_refusee() {
        let info = interpret_release(&release("v9.9.9", "https://evil.example/"), &[3, 4, 0]);
        assert!(!info.available);
    }

    #[test]
    fn release_sans_somme_est_ignoree() {
        let r = json!({"tag_name": "v9.9.9", "assets": []});
        assert!(!interpret_release(&r, &[3, 4, 0]).available);
    }
}
