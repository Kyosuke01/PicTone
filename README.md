# PicTone

PicTone est un éditeur d'images local moderne, sobre et performant. Il se lance sous la forme d'un serveur web local léger sur un port aléatoire disponible, ouvre automatiquement votre navigateur par défaut pour afficher l'interface, et s'arrête proprement dès que vous fermez l'onglet du navigateur (système de heartbeat/ping).

Le traitement des images s'effectue intégralement côté client (JavaScript) via l'API Canvas de HTML5, ce qui garantit des performances fluides à 60 FPS sans dépendance lourde et permet d'obtenir un exécutable binaire final extrêmement compact (environ 8 Mo).

---

## 🛠️ Architecture du projet

- `pictone.py` : Lanceur Python (serveur web local, auto-extinction).
- `pictone.ico` : Icône de l'application.
- `version.txt` : Fichier de version lu par l'API pour les notifications de mise à jour.
- `web/` : Dossier contenant l'application frontend.
  - `index.html` : Structure de l'interface.
  - `style.css` : Feuille de style (thème sombre sobre, style Lightroom).
  - `app.js` : Moteur de filtres et logique interactive (comparateur avant/après, drag & drop, etc.).
  - `favicon.ico` : Logo affiché dans l'onglet du navigateur.

---

## 💻 Développement local

### Prérequis
Vous devez disposer de Python 3 installé sur votre machine.

### Lancer l'application en mode développement
Exécutez simplement le script lanceur :
```bash
python pictone.py
```
Le serveur démarrera et ouvrira automatiquement votre navigateur.

---

## 🐳 Utilisation avec Docker

PicTone peut être exécuté dans un conteneur Docker isolé. Dans ce mode :
- Le serveur écoute sur toutes les interfaces (`0.0.0.0`) sur le port configuré (par défaut `8000`).
- Le lancement automatique du navigateur et le système d'auto-extinction (heartbeat) sont désactivés pour que le conteneur reste actif en tant que service.

### 1. Construire l'image Docker
Exécutez la commande suivante depuis la racine du projet :
```bash
docker build -t pictone .
```

### 2. Démarrer le conteneur
Démarrez le conteneur en associant le port 8000 du conteneur à celui de votre machine hôte :
```bash
docker run -d -p 8000:8000 --name pictone-app pictone
```

### 3. Accéder à l'application
Ouvrez votre navigateur web et accédez à l'adresse suivante :
[http://localhost:8000](http://localhost:8000)

### 4. Personnaliser le port (Optionnel)
Vous pouvez changer le port interne du conteneur en transmettant la variable d'environnement `PORT` :
```bash
docker run -d -p 8080:8080 -e PORT=8080 --name pictone-app pictone
```

---

## 📦 Compilation en `.exe` autonome

Pour créer l'exécutable autonome `pictone.exe` (sans avoir besoin d'installer Python chez l'utilisateur final) :

1. Installez **PyInstaller** (si ce n'est pas déjà fait) :
   ```bash
   pip install pyinstaller
   ```

2. Exécutez la commande suivante depuis la racine du projet (`Applications/PicTone`) :
   ```bash
   pyinstaller --noconsole --onefile --icon=pictone.ico --add-data "web;web" --distpath "..\..\Executables\PicTone" pictone.py
   ```

### Explications des paramètres :
- `--noconsole` : Empêche l'ouverture d'une fenêtre d'invite de commande noire lors du lancement de l'application.
- `--onefile` : Package toute l'application (Python + HTML/CSS/JS) dans un seul fichier `.exe`.
- `--icon=pictone.ico` : Associe l'icône personnalisée à l'exécutable Windows.
- `--add-data "web;web"` : Incorpore le dossier `web/` (contenant le frontend) à l'intérieur du binaire (il sera extrait dans un dossier temporaire à l'exécution).
- `--distpath "..."` : Indique le dossier de destination où l'exécutable compilé sera généré.

---

## 🚀 Processus de Versioning et Publication sur GitHub

PicTone intègre un **système de détection automatique des mises à jour**. Pour publier une nouvelle version et faire en sorte que les utilisateurs en soient avertis, suivez rigoureusement ces étapes :

### Étape 1 : Mettre à jour les numéros de version locaux
1. Dans le fichier `pictone.py`, modifiez la variable globale :
   ```python
   CURRENT_VERSION = "1.0.1"  # Remplacez par votre nouvelle version
   ```
2. Dans le fichier `version.txt` à la racine du projet, inscrivez uniquement le nouveau numéro de version :
   ```text
   1.0.1
   ```

### Étape 2 : Commiter et pousser les modifications sur GitHub
Enregistrez vos changements dans Git et envoyez-les sur votre dépôt distant :
```bash
git add .
git commit -m "Release version 1.0.1"
git push origin main
```

### Étape 3 : Créer et pousser le Tag de version Git
Les tags Git permettent de marquer un point précis de l'historique comme étant une version stable.
```bash
# Créer le tag localement
git tag -a v1.0.1 -m "Version 1.0.1"

# Envoyer le tag sur GitHub
git push origin v1.0.1
```

### Étape 4 : Compiler le nouvel exécutable
Générez le binaire compilé avec la commande PyInstaller (voir section [Compilation](#-compilation-en-exe-autonome)).

### Étape 5 : Créer la Release sur GitHub et y attacher l'exécutable
1. Allez sur votre dépôt GitHub sur le web.
2. Dans la colonne de droite, cliquez sur **Releases** puis sur **Draft a new release** (ou **Create a new release**).
3. Cliquez sur **Choose a tag** et sélectionnez le tag que vous venez de pousser (ex: `v1.0.1`).
4. Donnez un titre à votre release (ex: `PicTone v1.0.1`).
5. Écrivez une brève description des nouveautés ou corrections de cette version.
6. Dans la zone de dépôt de fichiers en bas (**Attach binaries...**), glissez-déposez le fichier compilé `pictone.exe` se trouvant dans votre dossier `Executables/PicTone/`.
7. Cliquez sur **Publish release**.

---

## 🔔 Comment fonctionne l'alerte utilisateur ?

Dès que la release est publiée sur GitHub :
1. Lorsque les utilisateurs lancent leur ancienne version de PicTone, l'application fait une requête vers l'URL brute de votre fichier `version.txt` sur la branche principale : `https://raw.githubusercontent.com/Kyosuke01/PicTone/main/version.txt`.
2. L'application compare ce numéro (ex: `1.0.1`) avec sa propre version locale (ex: `1.0.0`).
3. Si la version en ligne est plus récente, un bandeau apparaît en haut de l'application : *"Mise à jour disponible (v1.0.1)"*.
4. Le clic sur le bouton redirige l'utilisateur vers votre page GitHub de téléchargement de la dernière version stable.
