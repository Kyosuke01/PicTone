# PicTone

PicTone est un éditeur d'images local moderne, sobre et performant. Le traitement s'effectue côté client (JavaScript) via l'API HTML5 Canvas, dans une fenêtre native (pywebview / WebView2).

---

## 🛠️ Architecture du projet

- `pictone.py` : Point d'entrée (fenêtre native pywebview, enregistrement, journal d'erreurs).
- `version.txt` : Fichier de version (source unique de la version).
- `web/` : Interface frontend (HTML, CSS, JS).
- `build_common.py` : Utilitaires de build partagés.
- `.github/workflows/release.yml` : Release GitHub automatique.
- `build_exe.py` : Script de compilation automatisé pour générer le `.exe`.
- `build_msix.py` : Script de génération du package pour le Microsoft Store.

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

Chaque push sur `main` qui modifie `version.txt` déclenche le workflow GitHub Actions : compilation, test de démarrage de l'exe, puis création de la Release `vX.Y.Z` avec `.exe`, `.msix` et `SHA256SUMS.txt`. Une version déjà publiée est ignorée.

**Prérequis Windows :** le runtime [WebView2](https://go.microsoft.com/fwlink/p/?LinkId=2124703). En cas de plantage, un message s'affiche et le détail est dans `%LOCALAPPDATA%\PicTone\logs\crash_log.txt`.

---

## 📦 Compilation en `.exe` (Optionnelle)

*Note : `build_exe.py` est utilisé en arrière-plan par `build_msix.py`. Vous n'avez normalement pas besoin de vous en soucier.*

Si vous souhaitez exceptionnellement générer uniquement un exécutable `.exe` autonome (hors Store) :
```bash
python build_exe.py
```
L'exécutable final sera généré dans le dossier `Executables/` sous le nom `PicTone_v[version].exe`.

---

## 🚀 Déploiement sur le Microsoft Store

Le projet est conçu pour être distribué et mis à jour exclusivement via le **Microsoft Store**. 

**⚠️ Prérequis :** Le **Windows SDK** doit être installé sur votre ordinateur pour que le script puisse empaqueter l'application. ([Lien de téléchargement](https://developer.microsoft.com/fr-fr/windows/downloads/windows-sdk/) - Lors de l'installation, cochez uniquement *"Windows App Certification Kit"* et *"Windows SDK Signing Tools"*).

Pour préparer une nouvelle version destinée au Store :

1. Modifiez la version dans `version.txt`.
2. Lancez le script de génération du package :
   ```bash
   python build_msix.py
   ```
3. Le script s'occupe désormais de tout (compilation, génération des assets, création du manifeste, et empaquetage `makeappx` si le SDK Windows est installé).
4. Récupérez directement votre fichier final `PicTone_v[version].msix` dans le dossier `Executables/`.
5. Uploadez le fichier `.msix` sur votre tableau de bord Microsoft Store. Le Store s'occupera automatiquement des mises à jour pour les utilisateurs.
