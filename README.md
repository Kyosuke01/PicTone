# PicTone

PicTone est un éditeur d'images local moderne, sobre et performant. Le traitement s'effectue côté client (JavaScript) via l'API HTML5 Canvas, dans une fenêtre native (pywebview / WebView2).

---

## 🛠️ Architecture du projet

- `pictone.py` : Point d'entrée (fenêtre native pywebview, enregistrement, journal d'erreurs).
- `version.txt` : Fichier de version (source unique de la version).
- `web/` : Interface frontend (HTML, CSS, JS).
- `installer/PicTone.iss` : Script de l'installeur Windows (Inno Setup).
- `updater.py` : Mise à jour automatique depuis les Releases GitHub.
- `build_common.py` : Utilitaires de build partagés.
- `.github/workflows/release.yml` : Release GitHub automatique.
- `build_exe.py` : Script de compilation automatisé pour générer le `.exe`.

---

## 💻 Développement et Utilisation

### Mode développement (local)
1. Installez les dépendances via le fichier requirements :
   ```bash
   pip install -r requirements.txt
   ```
2. Lancez l'application :
   ```bash
   python pictone.py
   ```

---

## 🏷️ Releases automatiques

Chaque push sur `main` qui modifie `version.txt` déclenche le workflow GitHub Actions : compilation, test de démarrage, création de l'installeur, test d'installation et de désinstallation, puis création de la Release `vX.Y.Z` avec **le seul fichier `PicTone_vX.Y.Z.exe`** (installeur) et `SHA256SUMS.txt`. Une version déjà publiée est ignorée.

**Prérequis Windows :** le runtime [WebView2](https://go.microsoft.com/fwlink/p/?LinkId=2124703). En cas de plantage, un message s'affiche et le détail est dans `%LOCALAPPDATA%\PicTone\logs\crash_log.txt`.

---

## 🧩 Installation (Windows)

Téléchargez `PicTone_vX.Y.Z.exe` depuis la dernière Release et lancez-le. L'assistant vous laisse choisir le dossier d'installation (par défaut dans votre profil, sans droit administrateur) et le nom du dossier du menu Démarrer. Options :
- raccourci dans le menu Démarrer (coché par défaut) ;
- raccourci sur le Bureau (décoché par défaut) ;
- désinstallation depuis *Paramètres > Applications*.

---

## 🔄 Mise à jour automatique

Au démarrage, l'application consulte la dernière Release GitHub. Si une version plus récente existe, une bannière propose « Mettre à jour » : l'exe est téléchargé, son empreinte SHA256 est vérifiée (`SHA256SUMS.txt`), puis il remplace l'ancien et l'application redémarre. Hors ligne ou en cas d'erreur, l'application fonctionne normalement.

---

## 📦 Compilation en `.exe` (Optionnelle)

Pour générer l'exécutable en local :
```bash
python build_exe.py
```
L'exécutable final sera généré dans le dossier `Executables/` sous le nom `PicTone_v[version].exe`.
