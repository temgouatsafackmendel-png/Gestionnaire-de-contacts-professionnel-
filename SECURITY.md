# Politique de Sécurité — Veridian Contacts

## Versions Supportées

| Version | Support Sécurité |
| :--- | :--- |
| `1.0.x` | Actif |

## Mesures de Sécurité Implémentées

1. **Aucun secret dans le dépôt** :
   - Les variables de configuration sont documentées dans `.env.example`.
   - Les fichiers `.env` et les bases de données locales (`data/*.sqlite*`, `data/*.json*`) sont exclus via `.gitignore` et `.dockerignore`.
2. **Protection contre les Injections** :
   - **SQLite** : 100 % des requêtes passent par des instructions préparées paramétrées (`better-sqlite3`).
   - **CSV Formula Injection (DDE)** : Toutes les cellules exportées commençant par `=`, `+`, `-`, `@`, `\t` ou `\r` sont automatiquement neutralisées par préfixage (`'`).
   - **Sanitization des entrées** : Suppression des caractères de contrôle ASCII et validation stricte par schémas `Zod` côté serveur et côté client.
3. **Contrôle d'Accès (RBAC) & Traçabilité** :
   - Séparation des privilèges entre `viewer` (lecture/export), `editor` (création/modification/import/fusion) et `admin` (suppression/réinitialisation).
   - Journalisation systématique des actions sensibles et des refus d'accès (`PERMISSION_DENIED`) dans la table `audit_logs`.
4. **Protection contre les Abus (DoS)** :
   - Limite de taille des requêtes JSON fixée à `2mb`.
   - Plafond de `2000` enregistrements par lot d'importation.
   - Limiteur de débit (*Rate Limiting*) par adresse IP sur `/api/*`.

## Signaler une Vulnérabilité

Pour signaler une vulnérabilité de sécurité, veuillez ouvrir un avis de sécurité privé (*GitHub Security Advisory*) sur le dépôt GitHub du projet plutôt qu'une issue publique, en détaillant les étapes de reproduction.
