# Veridian Contacts — Gestionnaire de Contacts Professionnel

Application web full-stack de gestion de contacts B2B offrant un répertoire haute densité, une validation stricte des adresses email (RFC 5322) et numéros de téléphone (normalisation internationale E.164), une recherche exacte et partielle, des filtres multicritères, un moteur de détection et de fusion transactionnelle des doublons, un module d'import/export CSV et JSON avec rapport d'erreurs ligne par ligne, et un journal d'audit RBAC.

---

## 1. Périmètre Produit, Utilisateurs & Hypothèses

### Utilisateurs Cibles
- **Responsables commerciaux & Account Managers** : recherche rapide (exacte ou partielle) d'un interlocuteur, filtrage par catégorie (`client`, `prospect`, `partenaire`, `fournisseur`, `interne`) et étiquettes.
- **Équipes Opérations / Data Steward** : import de fichiers CSV/JSON issus d'événements ou d'outils tiers, isolement des lignes mal formées, déduplication et fusion propre des fiches en doublon.
- **Administrateurs & Auditeurs** : supervision des accès par rôle (`admin`, `editor`, `viewer`), vérification de l'intégrité de la sauvegarde SQLite + miroir JSON, et consultation du journal d'audit.

### Critères d'Acceptation couverts
1. **Import invalide signalé** : Lors d'un import CSV ou JSON (en mode simulation *Dry-Run* ou en mode exécution), chaque ligne invalide est rejetée sans bloquer les lignes valides, et un rapport détaillé affiche le **numéro de ligne exact** ainsi que les erreurs précises par champ (`email`, `phone`, `firstName`, `lastName`).
2. **Recherche exacte et partielle** : Sélecteur explicite permettant de basculer entre la **Recherche Partielle** (multi-mots insensible aux accents sur tous les champs ou un champ ciblé) et la **Recherche Exacte** (correspondance stricte sur le nom complet, l'email ou le numéro E.164 normalisé).
3. **Sauvegarde fiable** : Double persistance combinant **SQLite en mode journalisé WAL** (`data/contacts.sqlite`) et un **miroir JSON atomique** (`data/contacts.backup.json`) synchronisé à chaque écriture, avec vérification `PRAGMA integrity_check` et restauration automatique.

---

## 2. Installation et Démarrage

### Prérequis
- Node.js `>= 20.x`
- npm `>= 10.x`

### Variables d'environnement
Copiez le fichier `.env.example` vers `.env` :
```bash
cp .env.example .env
```

| Variable | Valeur par défaut | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port d'écoute du serveur HTTP Express + Vite |
| `DB_PATH` | `./data/contacts.sqlite` | Chemin du fichier SQLite (`:memory:` pour les tests) |
| `JSON_BACKUP_PATH` | `./data/contacts.backup.json` | Chemin du miroir de sauvegarde atomique JSON |
| `RATE_LIMIT_MAX_REQUESTS` | `180` | Nombre maximal de requêtes API par minute et par IP |
| `DEFAULT_ROLE` | `admin` | Rôle RBAC par défaut (`admin`, `editor`, `viewer`) |

### Commandes principales
```bash
# Installer les dépendances
npm install

# Démarrer le serveur de développement full-stack (Express + Vite sur le port 3000)
npm run dev

# Exécuter la vérification des types TypeScript (Lint)
npm run lint

# Exécuter la suite de tests automatisés (Unitaires, Intégration & Critères d'acceptation)
npm test

# Compiler le bundle de production
npm run build

# Démarrer en mode production
npm start
```

---

## 3. Documentation de l'API REST

Toutes les routes acceptent l'en-tête optionnel `x-user-role: admin | editor | viewer`.

| Méthode | Route | Rôles autorisés | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Tous | État de santé du serveur et statut d'intégrité SQLite |
| `GET` | `/api/storage/status` | Tous | Métriques de stockage SQLite WAL + miroir JSON |
| `POST` | `/api/storage/backup` | `admin`, `editor` | Force la synchronisation du miroir JSON et vérifie l'intégrité |
| `GET` | `/api/contacts` | Tous | Liste et filtre les contacts (`q`, `searchMode=partial\|exact`, `searchField=all\|name\|email\|phone\|company`, `category`, `favorite`, `tag`, `sortBy`) |
| `GET` | `/api/contacts/:id` | Tous | Récupère un contact par son UUID |
| `POST` | `/api/contacts` | `admin`, `editor` | Crée un contact après validation stricte et retourne les alertes de doublons |
| `PUT` | `/api/contacts/:id` | `admin`, `editor` | Met à jour un contact existant |
| `DELETE` | `/api/contacts/:id` | `admin` | Supprime définitivement un contact |
| `GET` | `/api/contacts/duplicates` | Tous | Détecte et retourne les paires de doublons avec leur score et leurs motifs |
| `POST` | `/api/contacts/merge` | `admin`, `editor` | Fusionne deux contacts (`primaryId`, `secondaryId`, `overrides`) dans une transaction ACID |
| `POST` | `/api/contacts/import` | `admin`, `editor` | Importe un lot CSV ou JSON (`format`, `content`, `dryRun`, `duplicateStrategy`) et retourne le rapport d'erreurs ligne par ligne |
| `GET` | `/api/contacts/export` | Tous | Exporte les contacts filtrés au format `csv` (RFC 4180 + BOM) ou `json` |
| `POST` | `/api/contacts/seed-reset` | `admin` | Réinitialise le jeu de démonstration synthétique |
| `GET` | `/api/audit` | Tous | Consulte les derniers événements du journal d'audit |

---

## 4. Guide Utilisateur & Scénarios de Démonstration

1. **Tester la recherche exacte vs partielle (Onglet Répertoire)** :
   - En mode **Partielle (Contient)**, tapez `Moreau` ou `+33 6` : toutes les fiches correspondantes s'affichent instantanément.
   - Passez en mode **Exacte (Stricte)** et sélectionnez le champ `Téléphone` : tapez `0614283950` (format national) ; le moteur le normalise en `+33614283950` et trouve la fiche exacte de Camille Moreau (`+33 6 14 28 39 50`).
2. **Examiner et fusionner les doublons (Onglet Doublons)** :
   - Le jeu de données initial inclut 2 paires de doublons intentionnels (*Thomas Lefèvre* avec le même numéro E.164 sous deux écritures `06 45 78 12 33` et `+33 6 45 78 12 33`, et *Antoine Garnier* avec le même email exact).
   - Cliquez sur une paire, choisissez champ par champ les valeurs à conserver entre la Fiche A et la Fiche B, puis cliquez sur **Fusionner les 2 fiches**.
3. **Tester le signalement d'import invalide (Onglet Import & Export)** :
   - Cliquez sur le bouton **« Jeu d'essai CSV avec erreurs (Démo QA) »**, puis sur **« Simuler & Vérifier les erreurs (Dry-Run) »** ou **« Exécuter l'importation des lignes valides »**.
   - Le tableau d'anomalies signale immédiatement la **Ligne 3** (email invalide) et la **Ligne 4** (prénom manquant et téléphone trop court), ainsi que le doublon détecté en **Ligne 5**, tout en important la **Ligne 2** valide.
4. **Tester les permissions RBAC (Barre supérieure ou Onglet Journal d'Audit)** :
   - Changez le profil RBAC actif en `viewer (Lecture + Export seul)` et tentez de supprimer ou créer un contact : l'opération est bloquée par le serveur (`403 Forbidden`) et l'événement `PERMISSION_DENIED` apparaît dans le **Journal d'Audit**.

---

## 5. Structure du Dépôt & Publication sur GitHub

### Arborescence du projet
```text
├── ci/github-actions-ci.yml   # Modèle de pipeline CI GitHub Actions (Lint + Vitest + Build)
├── src/
│   ├── shared/                # Noyau partagé (types.ts, validation.ts, duplicates.ts, csv.ts)
│   ├── server/                # API Express (app.ts), SQLite WAL + Miroir JSON (repository.ts)
│   ├── services/              # Client API typé & export vCard (apiClient.ts)
│   ├── components/            # Vues React 19 (ContactFormModal, DuplicatesView, ImportExportView, AuditLogView)
│   └── App.tsx                # Espace de travail principal (Tableau, Cartes, Index A-Z, Actions groupées)
├── tests/contacts.test.ts     # Suite de 13 tests unitaires, d'intégration et critères d'acceptation
├── server.ts                  # Point d'entrée serveur Full-Stack (Port 3000)
├── Dockerfile                 # Image multi-stage Node 22 non-root
├── docker-compose.yml         # Orchestration conteneur + volume persistant + healthcheck
├── architecture.md            # Documentation d'architecture & diagrammes Mermaid
├── SECURITY.md                # Politique de sécurité et contrôles implémentés
├── CONTRIBUTING.md            # Guide de contribution et vérifications avant PR
└── LICENSE                    # Licence Apache 2.0
```

### Envoyer le projet sur GitHub

#### Méthode 1 — Directement depuis l'interface Google AI Studio
Cliquez sur l'icône **GitHub / Export to GitHub** dans la barre d'outils supérieure de l'interface pour créer et synchroniser directement un dépôt sur votre compte GitHub.

#### Méthode 2 — Depuis un terminal Git
Le dépôt Git local est déjà initialisé sur la branche `main` avec un `.gitignore` strict (excluant `node_modules/`, `dist/`, `.env` et les fichiers SQLite/JSON d'exécution `data/`). Pour pousser vers un nouveau dépôt GitHub :

```bash
# 1. Associer votre dépôt distant GitHub
git remote add origin https://github.com/<votre-utilisateur>/veridian-contacts.git

# 2. Vérifier l'état propre du dépôt
git status

# 3. Envoyer la branche main sur GitHub
git push -u origin main
```

---

## 6. Limitations Connues & Roadmap

### Limitations connues
- Le contrôle d'accès RBAC repose sur un sélecteur de rôle transmis via l'en-tête `x-user-role` pour permettre les tests fonctionnels et d'audit sans dépendre d'un fournisseur d'identité externe payant.
- L'import synchrone est volontairement plafonné à 2 000 lignes par lot (2 Mo) pour garantir une latence faible et protéger la boucle d'événements Node.js.

### Roadmap (Évolutions futures)
- **v1.1** : Authentification OIDC / OAuth2 complète avec sessions signées JWT / cookies `HttpOnly`.
- **v1.2** : Import groupé de carnets `vCard (.vcf)` multi-contacts (l'export individuel `.vcf` est déjà intégré).
- **v1.3** : Historique de versions par contact (annulation *Undo* d'une fusion ou d'une modification).

