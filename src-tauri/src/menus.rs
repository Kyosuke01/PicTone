//! Menus natifs : structure en données (testable), convertie en menus Tauri au démarrage.

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Wry};

/// Raccourci affiché selon la plateforme : ⌘S sur macOS, Ctrl+S ailleurs.
pub fn kbd(key: &str) -> String {
    if cfg!(target_os = "macos") { format!("⌘{key}") } else { format!("Ctrl+{key}") }
}

pub struct Entry {
    pub id: &'static str,
    pub label: &'static str,
    pub shortcut: Option<&'static str>,
}

pub enum Item {
    Command(Entry),
    Separator,
}

pub struct MenuSpec {
    pub title: &'static str,
    pub items: Vec<Item>,
}

fn cmd(id: &'static str, label: &'static str, shortcut: Option<&'static str>) -> Item {
    Item::Command(Entry { id, label, shortcut })
}

/// Commandes pilotant l'interface (ids = noms de picToneCommand dans app.js).
pub fn spec() -> Vec<MenuSpec> {
    vec![
        MenuSpec { title: "Fichier", items: vec![
            cmd("open", "Ouvrir une image…", Some("O")),
            cmd("save", "Enregistrer l'image…", Some("S")),
            cmd("reset", "Réinitialiser", None),
        ]},
        MenuSpec { title: "Édition", items: vec![
            cmd("undo", "Annuler", Some("Z")),
            cmd("redo", "Rétablir", Some("Y")),
        ]},
        MenuSpec { title: "Affichage", items: vec![
            cmd("zoomIn", "Zoom avant", Some("+")),
            cmd("zoomOut", "Zoom arrière", Some("-")),
            cmd("zoomReset", "Taille réelle", Some("0")),
            Item::Separator,
            cmd("panelFilters", "Panneau Filtres", None),
            cmd("panelDraw", "Panneau Dessin", None),
            cmd("panelTransform", "Panneau Transformer", None),
        ]},
        MenuSpec { title: "Aide", items: vec![
            cmd("checkUpdates", "Vérifier les mises à jour", None),
            cmd("about", "À propos de PicTone", None),
        ]},
    ]
}

fn label_of(e: &Entry) -> String {
    match e.shortcut {
        Some(k) => format!("{}  ({})", e.label, kbd(k)),
        None => e.label.to_string(),
    }
}

/// Éléments de menu pilotables (id -> élément), pour griser ceux qui sont indisponibles.
#[derive(Default)]
pub struct MenuState(pub Mutex<HashMap<String, MenuItem<Wry>>>);

pub fn build(app: &AppHandle) -> tauri::Result<(Menu<Wry>, HashMap<String, MenuItem<Wry>>)> {
    let menu = Menu::new(app)?;
    let mut items = HashMap::new();

    #[cfg(target_os = "macos")]
    {
        let app_menu = Submenu::with_items(app, "PicTone", true, &[
            &PredefinedMenuItem::about(app, Some("À propos de PicTone"), None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, Some("Services"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some("Masquer PicTone"))?,
            &PredefinedMenuItem::hide_others(app, Some("Masquer les autres"))?,
            &PredefinedMenuItem::show_all(app, Some("Tout afficher"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("Quitter PicTone"))?,
        ])?;
        menu.append(&app_menu)?;
    }

    for m in spec() {
        let sub = Submenu::new(app, m.title, true)?;
        for it in &m.items {
            match it {
                Item::Separator => sub.append(&PredefinedMenuItem::separator(app)?)?,
                Item::Command(e) => {
                    let item = MenuItem::with_id(app, e.id, label_of(e), true, None::<&str>)?;
                    sub.append(&item)?;
                    items.insert(e.id.to_string(), item);
                }
            }
        }
        // Couper / copier / coller / tout sélectionner : indispensables dans les champs numériques
        // et pour coller une image (sinon macOS ignore ⌘C / ⌘V dans la fenêtre).
        if m.title == "Édition" {
            sub.append(&PredefinedMenuItem::separator(app)?)?;
            sub.append(&PredefinedMenuItem::cut(app, Some("Couper"))?)?;
            sub.append(&PredefinedMenuItem::copy(app, Some("Copier"))?)?;
            sub.append(&PredefinedMenuItem::paste(app, Some("Coller"))?)?;
            sub.append(&PredefinedMenuItem::select_all(app, Some("Tout sélectionner"))?)?;
        }
        menu.append(&sub)?;
    }
    Ok((menu, items))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn les_ids_sont_uniques() {
        let mut seen = std::collections::HashSet::new();
        for m in spec() {
            for it in m.items {
                if let Item::Command(e) = it {
                    assert!(seen.insert(e.id), "id en double : {}", e.id);
                }
            }
        }
    }

    #[test]
    fn le_libelle_porte_le_raccourci() {
        let e = Entry { id: "undo", label: "Annuler", shortcut: Some("Z") };
        let l = label_of(&e);
        assert!(l.starts_with("Annuler  (") && l.ends_with("Z)"), "{l}");
        assert_eq!(label_of(&Entry { id: "reset", label: "Réinitialiser", shortcut: None }), "Réinitialiser");
    }

    /// Chaque commande du menu doit être gérée par picToneCommand dans l'interface.
    #[test]
    fn toutes_les_commandes_existent_dans_app_js() {
        let js = include_str!("../../web/app.js");
        for m in spec() {
            for it in m.items {
                if let Item::Command(e) = it {
                    assert!(js.contains(&format!("'{}'", e.id)) || js.contains(&format!("\"{}\"", e.id)),
                        "commande absente d'app.js : {}", e.id);
                }
            }
        }
    }
}
