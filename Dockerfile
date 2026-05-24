# Image de base Python légère
FROM python:3.11-slim

# Répertoire de travail dans le conteneur
WORKDIR /app

# Copie des dépendances (optionnel, sert de documentation)
COPY requirements.txt ./

# Copie du script principal et des fichiers de version
COPY pictone.py version.txt ./

# Copie du dossier de l'application web statique
COPY web/ ./web/

# Variables d'environnement pour configurer l'application sous Docker
ENV RUNNING_IN_DOCKER=true
ENV PORT=8000

# Exposition du port du serveur
EXPOSE 8000

# Lancement du serveur
CMD ["python", "pictone.py"]
