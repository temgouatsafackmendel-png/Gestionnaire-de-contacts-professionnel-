# Guide de Contribution — Veridian Contacts

Merci de contribuer à **Veridian Contacts**. Ce document décrit les conventions de développement, de qualité et de soumission de Pull Requests.

## 1. Prérequis & Installation

```bash
git clone https://github.com/<votre-organisation>/veridian-contacts.git
cd veridian-contacts
cp .env.example .env
npm install
```

## 2. Commandes de Vérification Obligatoires avant Commit

Avant d'ouvrir une Pull Request, assurez-vous que les trois contrôles suivants passent sans erreur (modèle de workflow CI disponible dans `ci/github-actions-ci.yml`) :

```bash
# 1. Vérification stricte des types TypeScript
npm run lint

# 2. Exécution des tests unitaires, d'intégration et critères d'acceptation (Vitest + Supertest)
npm test

# 3. Compilation du bundle de production
npm run build
```

## 3. Conventions de Code & Commits

- **Architecture** :
  - `src/shared/` : Schémas `Zod`, validation RFC 5322 / E.164, détection de doublons et parseur CSV RFC 4180 (aucune dépendance DOM ou Express).
  - `src/server/` : Persistance SQLite WAL + miroir JSON (`repository.ts`) et routes Express (`app.ts`).
  - `src/components/` : Composants React 19 typés et accessibles.
- **Format des messages de commit (Conventional Commits)** :
  - `feat: ...` pour une nouvelle fonctionnalité
  - `fix: ...` pour une correction de bug
  - `test: ...` pour l'ajout ou la modification de tests
  - `docs: ...` pour la documentation
  - `sec: ...` pour un durcissement de sécurité
