# PicTone

PicTone est un éditeur d'images local moderne, sobre et performant. Le traitement s'effectue côté client (JavaScript) via l'API HTML5 Canvas, tandis qu'un serveur local Python gère l'hébergement et l'arrêt automatique.

---

## 🛠️ Architecture du projet

- `pictone.py` : Lanceur Python (serveur web local avec auto-extinction).
- `version.txt` : Fichier de version (lu dynamiquement par le serveur et l'API de mise à jour).
- `web/` : Interface frontend (HTML, CSS, JS).
- `build_exe.py` : Script de compilation automatisé pour générer le `.exe`.

---

## 💻 Développement et Utilisation

### Mode développement (local)
1. Installez les dépendances :
   ```bash
   pip install pystray Pillow pywin32
   ```
2. Lancez l'application :
   ```bash
   python pictone.py
   ```

### Mode Docker
1. Construisez l'image :
   ```bash
   docker build -t pictone .
   ```
2. Démarrez le conteneur :
   ```bash
   docker run -d -p 8000:8000 --name pictone-app pictone
   ```
   Accédez à l'application via `http://localhost:8000`.

---

## 📦 Compilation en `.exe`

Pour générer un fichier exécutable autonome pour Windows :

1. Installez PyInstaller :
   ```bash
   pip install pyinstaller
   ```
2. Lancez le script de build :
   ```bash
   python build_exe.py
   ```
   L'exécutable final sera généré dans le dossier `Executables/` sous le nom `PicTone_v[version].exe`.

---

## 🚀 Mise à jour et Versioning

Pour publier une nouvelle version :
1. Modifiez la version dans `version.txt`.
2. Lancez `python build_exe.py` pour synchroniser et compiler.
3. Publiez sur GitHub avec un Tag correspondant (ex: `v2.0.0`) et joignez l'exécutable compilé à la Release.
