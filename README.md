# PicTone

PicTone est un éditeur d'images local moderne, sobre et performant. Le traitement s'effectue côté client (JavaScript) via l'API HTML5 Canvas, tandis qu'un serveur local Python gère l'hébergement et l'arrêt automatique.

---

## 🛠️ Architecture du projet

- `pictone.py` : Lanceur Python (serveur web local avec auto-extinction).
- `version.txt` : Fichier de version (lu dynamiquement par le serveur et l'API de mise à jour).
- `web/` : Interface frontend (HTML, CSS, JS).
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
