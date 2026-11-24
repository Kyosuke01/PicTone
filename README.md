# PicTone

PicTone est un éditeur d'images local, sobre et rapide : filtres en vignettes, réglages, dessin, recadrage, redimensionnement et export PNG / JPEG / WebP. Tout fonctionne hors ligne.

L'application est construite avec [Tauri](https://tauri.app) : le cœur est en **Rust**, l'interface en HTML / CSS / JavaScript (traitement d'image par l'API Canvas), affichée dans le moteur web du système.

---

## 🛠️ Architecture

- `src-tauri/` : application Rust (fenêtre, menus natifs, enregistrement, journaux, mise à jour).
  - `src/lib.rs` : commandes exposées à l'interface ;
  - `src/menus.rs` : menus natifs ;
  - `src/updater.rs` : mise à jour depuis les Releases GitHub ;
  - `src/logging.rs` : journaux.
- `web/` : interface (`index.html`, `style.css`, `app.js`). `tauri-shim.js` relie l'interface aux commandes Rust.
- `version.txt` : source unique de la version (`Cargo.toml` et `package.json` doivent rester alignés ; un test le vérifie).
- `installer/` : création, signature et notarisation du `.dmg` macOS.
- `.github/workflows/` : tests et release automatiques.

---

## 💻 Développement

Prérequis : [Rust](https://rustup.rs) et Node.js.

```bash
npm install            # installe le CLI Tauri
npx tauri dev          # lance l'application en mode développement
cargo test --manifest-path src-tauri/Cargo.toml   # tests
npx tauri build --bundles app                     # construit PicTone.app (macOS)
npx tauri build --bundles nsis                    # construit l'installeur (Windows)
```

L'application construite se trouve dans `src-tauri/target/release/bundle/macos/`.

---

## 🏷️ Releases

Chaque push sur `main` qui modifie `version.txt` déclenche le workflow GitHub Actions : tests, compilation, test de démarrage, signature, notarisation Apple, puis création de la Release `vX.Y.Z` avec `PicTone_vX.Y.Z_macOS.dmg` et `SHA256SUMS.txt`. Une version déjà publiée est ignorée.

L'application macOS est signée et notarisée : elle s'ouvre directement, sans avertissement. Au démarrage, PicTone consulte la dernière Release ; si une version plus récente existe, le bouton « Mettre à jour » télécharge le `.dmg`, vérifie son empreinte SHA256, remplace l'application et la relance.

Journaux : `~/Library/Logs/PicTone/` sur macOS, `%LOCALAPPDATA%\PicTone\logs\` sur Windows (`crash_log.txt`, `update.log`).

---

## 🍎 Plateformes

- **macOS** : `PicTone_vX.Y.Z_macOS.dmg` (signé et notarisé).
- **Windows, installeur** : `PicTone_vX.Y.Z_Windows.exe` (installation dans votre profil, sans droits administrateur, raccourcis, désinstallation depuis *Paramètres > Applications*, mise à jour automatique).
- **Windows, portable** : `PicTone_vX.Y.Z_Windows-portable.exe` (aucune installation ; mise à jour par téléchargement manuel). Nécessite le runtime [WebView2](https://go.microsoft.com/fwlink/p/?LinkId=2124703), déjà présent sur Windows 11.
