# Guide de Déploiement & Exploitation — Veridian Contacts

Ce document détaille les procédures d'exécution en environnement local, conteneurisé (Docker / Docker Compose) et Cloud, ainsi que la gestion des sauvegardes SQLite WAL + Miroir JSON.

---

## 1. Déploiement Local / Serveur Node.js

```bash
# 1. Cloner le dépôt
git clone https://github.com/<votre-utilisateur>/veridian-contacts.git
cd veridian-contacts

# 2. Configurer les variables d'environnement
cp .env.example .env

# 3. Installer les dépendances et vérifier la qualité
npm ci
npm run lint
npm test

# 4. Compiler le frontend React 19
npm run build

# 5. Démarrer le serveur de production sur le port 3000
NODE_ENV=production npm start
```

---

## 2. Déploiement Conteneurisé avec Docker Compose (Recommandé)

Le projet inclut un `Dockerfile` multi-stage basé sur `node:22-slim` s'exécutant sous l'utilisateur non-privilégié `node` et un fichier `docker-compose.yml` montant un volume persistant pour `/app/data`.

```bash
# Construire et démarrer le service en arrière-plan
docker compose up --build -d

# Vérifier l'état de santé du conteneur
docker compose ps
curl http://localhost:3000/api/health
```

---

## 3. Architecture de Sauvegarde & Restauration

L'application garantit une **persistance redondante** dans le dossier `./data/` :
1. `data/contacts.sqlite` : Base relationnelle SQLite en mode `WAL` (*Write-Ahead Logging*).
2. `data/contacts.backup.json` : Miroir JSON complet écrit de manière atomique (`contacts.backup.json.tmp` $\rightarrow$ `rename`) après chaque transaction.

### Restauration automatique après incident
Si le fichier `contacts.sqlite` est supprimé ou déplacé alors que `contacts.backup.json` est présent, le serveur détecte automatiquement le miroir JSON au démarrage, restaure l'intégralité des contacts dans SQLite et journalise un événement `BACKUP_RESTORE` dans le journal d'audit.
