//! Menus natifs : structure en données (testable), convertie en menus Tauri au démarrage.
//!
//! Chaque entrée envoie son identifiant à l'interface (`picToneCommand`, js/ui.js), sauf « quit »
//! et les éléments système. Les raccourcis sont écrits une fois (Ctrl+…) et affichés selon la
//! plateforme : ⌘ sur macOS, Ctrl+ sous Windows. Le clavier est géré par l'interface.

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Wry};

/// Libellé de raccourci pour la plateforme : « Ctrl+Shift+E » devient « ⇧⌘E » sur macOS
/// et « Ctrl+Maj+E » sous Windows. Le dernier élément est la touche, même si c'est « + » (« Ctrl++ »).
pub fn shortcut_label(canonical: &str) -> String {
    format_shortcut(canonical, cfg!(target_os = "macos"))
}

/// Mise en forme pour une plateforme donnée (testable sur n'importe quel système).
pub fn format_shortcut(canonical: &str, mac: bool) -> String {
    let (mut ctrl, mut shift, mut alt) = (false, false, false);
    let mut rest = canonical;
    loop {
        if let Some(r) = rest.strip_prefix("Ctrl+") {
            ctrl = true;
            rest = r;
        } else if let Some(r) = rest.strip_prefix("Shift+").or_else(|| rest.strip_prefix("Maj+")) {
            shift = true;
            rest = r;
        } else if let Some(r) = rest.strip_prefix("Alt+") {
            alt = true;
            rest = r;
        } else {
            break;
        }
    }
    if mac {
        // Ordre des modificateurs sur macOS : ⌥ ⇧ ⌘, puis la touche.
        let key = match rest {
            "Backspace" => "⌫",
            "Delete" => "⌦",
            other => other,
        };
        let mut out = String::new();
        if alt { out.push('⌥'); }
        if shift { out.push('⇧'); }
        if ctrl { out.push('⌘'); }
        out.push_str(key);
        out
    } else {
        let mut parts = Vec::new();
        if ctrl { parts.push("Ctrl"); }
        if alt { parts.push("Alt"); }
        if shift { parts.push("Maj"); }
        parts.push(rest);
        parts.join("+")
    }
}

pub struct Entry {
    pub id: &'static str,
    pub label: &'static str,
    /// Raccourci « Ctrl+… » (libellé seulement : le clavier est géré par l'interface).
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

/// Structure des menus de PicTone (ids = noms reconnus par picToneCommand).
pub fn spec() -> Vec<MenuSpec> {
    vec![
        MenuSpec { title: "Fichier", items: vec![
            cmd("open", "Ouvrir…", Some("Ctrl+O")),
            cmd("save", "Enregistrer le projet…", Some("Ctrl+S")),
            cmd("export", "Exporter l'image…", Some("Ctrl+Shift+E")),
            Item::Separator,
            cmd("close", "Fermer l'image", None),
        ]},
        MenuSpec { title: "Édition", items: vec![
            cmd("undo", "Annuler", Some("Ctrl+Z")),
            cmd("redo", "Rétablir", Some("Ctrl+Shift+Z")),
            Item::Separator,
            cmd("cut", "Couper", Some("Ctrl+X")),
            cmd("copy", "Copier", Some("Ctrl+C")),
            cmd("paste", "Coller", Some("Ctrl+V")),
            cmd("selectAll", "Tout sélectionner", Some("Ctrl+A")),
        ]},
        MenuSpec { title: "Image", items: vec![
            cmd("cropStart", "Recadrer…", None),
            cmd("resize", "Redimensionner…", None),
            Item::Separator,
            cmd("flipH", "Retourner horizontalement", None),
            cmd("flipV", "Retourner verticalement", None),
            Item::Separator,
            cmd("flatten", "Aplatir les calques", None),
        ]},
        MenuSpec { title: "Calque", items: vec![
            cmd("newLayer", "Nouveau calque", Some("Ctrl+Shift+N")),
            cmd("duplicateLayer", "Dupliquer le calque", Some("Ctrl+J")),
            cmd("deleteLayer", "Supprimer le calque", Some("Ctrl+Backspace")),
            Item::Separator,
            cmd("moveLayerUp", "Monter", Some("Ctrl+]")),
            cmd("moveLayerDown", "Descendre", Some("Ctrl+[")),
            cmd("mergeLayers", "Fusionner les calques sélectionnés…", Some("Ctrl+E")),
        ]},
        MenuSpec { title: "Affichage", items: vec![
            cmd("zoomIn", "Zoom avant", Some("Ctrl++")),
            cmd("zoomOut", "Zoom arrière", Some("Ctrl+-")),
            cmd("zoomFit", "Ajuster à la fenêtre", Some("Ctrl+0")),
            cmd("zoomActual", "Taille réelle", Some("Ctrl+1")),
            Item::Separator,
            cmd("toggleSplit", "Comparer avant / après", Some("Ctrl+B")),
            Item::Separator,
            cmd("tabFilters", "Panneau Filtres", None),
            cmd("tabLayers", "Panneau Calques", None),
            cmd("tabDraw", "Panneau Dessin", None),
            cmd("tabTransform", "Panneau Transformer", None),
        ]},
        MenuSpec { title: "Aide", items: vec![
            cmd("shortcuts", "Raccourcis clavier", Some("Ctrl+Shift+/")),
            Item::Separator,
            cmd("checkUpdates", "Vérifier les mises à jour", None),
            cmd("about", "À propos de PicTone", None),
        ]},
    ]
}

fn label_of(e: &Entry) -> String {
    match e.shortcut {
        Some(k) => format!("{}  ({})", e.label, shortcut_label(k)),
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
        // « Quitter » est un élément à nous : ⌘Q passe ainsi par la confirmation d'enregistrement.
        let quit = MenuItem::with_id(app, "quit", "Quitter PicTone", true, Some("Cmd+Q"))?;
        let app_menu = Submenu::with_items(app, "PicTone", true, &[
            &PredefinedMenuItem::about(app, Some("À propos de PicTone"), None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, Some("Services"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some("Masquer PicTone"))?,
            &PredefinedMenuItem::hide_others(app, Some("Masquer les autres"))?,
            &PredefinedMenuItem::show_all(app, Some("Tout afficher"))?,
            &PredefinedMenuItem::separator(app)?,
            &quit,
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
        // Windows : « Quitter » dans le menu Fichier (sous macOS, il est dans le menu PicTone).
        if m.title == "Fichier" && cfg!(not(target_os = "macos")) {
            sub.append(&PredefinedMenuItem::separator(app)?)?;
            sub.append(&MenuItem::with_id(app, "quit", "Quitter", true, Some("Ctrl+Q"))?)?;
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
        let l = label_of(&Entry { id: "undo", label: "Annuler", shortcut: Some("Ctrl+Z") });
        assert!(l.starts_with("Annuler  (") && l.ends_with(")"), "{l}");
        assert_eq!(label_of(&Entry { id: "close", label: "Fermer", shortcut: None }), "Fermer");
    }

    #[test]
    fn raccourcis_macos() {
        assert_eq!(format_shortcut("Ctrl+Shift+E", true), "⇧⌘E");
        assert_eq!(format_shortcut("Ctrl+O", true), "⌘O");
        assert_eq!(format_shortcut("Ctrl+Backspace", true), "⌘⌫");
        assert_eq!(format_shortcut("Ctrl+Alt+Shift+K", true), "⌥⇧⌘K");
    }

    #[test]
    fn raccourcis_windows() {
        assert_eq!(format_shortcut("Ctrl+Shift+E", false), "Ctrl+Maj+E");
        assert_eq!(format_shortcut("Ctrl+O", false), "Ctrl+O");
        assert_eq!(format_shortcut("Ctrl+Backspace", false), "Ctrl+Backspace");
    }

    /// La touche « + » ou « - » est la touche elle-même, pas un séparateur.
    #[test]
    fn touches_plus_et_moins() {
        assert_eq!(format_shortcut("Ctrl++", true), "⌘+");
        assert_eq!(format_shortcut("Ctrl++", false), "Ctrl++");
        assert_eq!(format_shortcut("Ctrl+-", true), "⌘-");
        assert_eq!(format_shortcut("Ctrl+Shift+/", true), "⇧⌘/");
        assert_eq!(format_shortcut("Ctrl+Shift+/", false), "Ctrl+Maj+/");
    }

    #[test]
    fn le_libelle_de_plateforme_est_celui_de_la_plateforme_courante() {
        assert_eq!(shortcut_label("Ctrl+Shift+E"), format_shortcut("Ctrl+Shift+E", cfg!(target_os = "macos")));
    }

    /// Un même raccourci ne doit pas être attribué à deux commandes.
    #[test]
    fn les_raccourcis_sont_uniques() {
        let mut seen = std::collections::HashMap::new();
        for m in spec() {
            for it in m.items {
                if let Item::Command(e) = it {
                    if let Some(k) = e.shortcut {
                        if let Some(other) = seen.insert(k, e.id) {
                            panic!("{k} est utilisé par « {other} » et « {} »", e.id);
                        }
                    }
                }
            }
        }
    }

    /// Les menus du cahier des charges : calques multiples, fusion confirmée, comparaison.
    #[test]
    fn les_commandes_attendues_sont_dans_les_menus() {
        let mut ids = Vec::new();
        for m in spec() {
            for it in m.items {
                if let Item::Command(e) = it { ids.push(e.id); }
            }
        }
        for attendu in ["open", "save", "export", "mergeLayers", "deleteLayer", "toggleSplit", "shortcuts", "zoomFit", "zoomActual"] {
            assert!(ids.contains(&attendu), "commande manquante dans les menus : {attendu}");
        }
        assert!(!ids.contains(&"mergeDown"), "mergeDown a été remplacé par mergeLayers");
    }

    /// Chaque commande du menu doit être traitée par runCommand (js/ui.js) et avoir son état (griser / activer).
    #[test]
    fn toutes_les_commandes_existent_dans_l_interface() {
        let ui = include_str!("../../web/js/ui.js");
        let run = ui.split("function runCommand").nth(1).expect("runCommand absente de ui.js");
        let run = run.split("window.picToneCommand").next().unwrap();
        let states = ui.split("function publishMenuStates").nth(1).expect("publishMenuStates absente de ui.js");
        let states = states.split("function updateControlStates").next().unwrap();
        for m in spec() {
            for it in m.items {
                if let Item::Command(e) = it {
                    assert!(run.contains(&format!("case '{}':", e.id)), "commande non traitée par runCommand : {}", e.id);
                    assert!(states.contains(&format!("{}:", e.id)), "état de menu absent pour : {}", e.id);
                }
            }
        }
    }
}
