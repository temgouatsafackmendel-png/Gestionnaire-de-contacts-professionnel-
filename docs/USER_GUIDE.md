# Guide Utilisateur Illustré de Bout en Bout — Veridian Contacts

> **Auteur** : Projet conçu, architecturé et réalisé de bout en bout par **Mendel Temgoua** (`mendeltemgouabusiness@gmail.com`).

Ce guide présente pas à pas l'ensemble des parcours fonctionnels de **Veridian Contacts** à travers les captures d'écran de l'application.

---

## 1. Répertoire Principal, Graphique en Anneau Recharts & Fiche Détail

![Répertoire Principal et Graphique en Anneau Recharts](./screenshots/01-directory-workspace.svg)

### A. Bandeau d'Indicateurs Clés (KPI)
Quatre cartes synthétiques en haut de l'interface permettent de piloter votre carnet en un clic :
1. **Contacts enregistrés** : Affiche le nombre total de contacts, d'organisations et de pays représentés. Cliquez dessus pour réinitialiser tous les filtres actifs.
2. **Contacts favoris & VIP** : Filtre instantanément vos contacts prioritaires marqués d'une étoile `★`.
3. **Doublons détectés** : Indique le nombre de paires de doublons identifiées et ouvre directement l'assistant de fusion.
4. **Import & Export (`CSV · JSON · vCard`)** : Accède en un clic au centre d'importation et d'exportation.

### B. Graphique en Anneau Interactif (Recharts) par Catégorie
Situé dans l'en-tête du répertoire :
- **Inspection au survol (Hover)** : Survolez n'importe quelle tranche de l'anneau ou l'une des 6 cartes de catégories (*Clients*, *Partenaires*, *Fournisseurs*, *Prospects*, *Internes*, *Autres*) pour afficher une infobulle avec le nombre exact de fiches et le pourcentage correspondant.
- **Filtrage au clic** : Cliquez sur un segment de l'anneau ou sur une carte de catégorie pour filtrer immédiatement le répertoire. Cliquez à nouveau pour revenir à la vue complète.

### C. Recherche Instantanée (Partielle vs Exacte), Vues Multiples & Panneau Détail
- **Mode Partielle (Contient)** : Recherche multi-mots insensible aux accents sur tous les champs ou un champ ciblé (*Nom*, *Email*, *Téléphone*, *Entreprise*).
- **Mode Exacte (Stricte)** : Recherche une correspondance stricte (y compris sur les numéros de téléphone quel que soit leur format de saisie grâce à la normalisation internationale).
- **3 Modes d'affichage** : Basculez entre **Tableau**, **Cartes** et **Organisations** (regroupement par société), complétés par l'**Index Alphabétique A–Z**.
- **Panneau Détail Épuré** : Cliquez sur un contact pour copier son email ou son téléphone en 1 clic, télécharger sa **Fiche vCard (`.vcf`)**, modifier sa catégorie ou enregistrer une note métier à la volée.

---

## 2. États Vides Vectoriels & Importation d'Exemples en 1 Clic

![État Vide Vectoriel et Import d'Exemples en 1 Clic](./screenshots/05-empty-state-quick-import.svg)

Lorsque le carnet de contacts est vide ou qu'une combinaison de filtres ne retourne aucun résultat :
- Une **illustration vectorielle SVG sur mesure** s'affiche à la place d'un simple texte vide.
- Si la base est vide, le bouton **« Importer des contacts d'exemple (1 clic) »** (ainsi que le bouton **« Charger les exemples B2B »** dans l'en-tête du graphique) permet d'injecter immédiatement un jeu complet de contacts professionnels pré-validés.
- Si une recherche en mode *Exacte* ne donne aucun résultat, un bouton contextuel propose de **« Passer en Recherche Partielle (Contient) »** ou de **« Réinitialiser tous les filtres »**.

---

## 3. Détection des Doublons & Assistant de Fusion Côte à Côte

![Assistant de Déduplication et Fusion Côte à Côte](./screenshots/02-duplicate-merge-wizard.svg)

L'application repère automatiquement :
1. Les **adresses email identiques** (score 100 %).
2. Les **numéros de téléphone identiques** même saisis sous des formats différents (`06 45 78 12 33` vs `+33 6 45 78 12 33`, score 95 %).
3. Les **homonymes Prénom + Nom** au sein d'une même entreprise (score 90 %).
4. Les **inversions Prénom/Nom** et les fautes de frappe mineures (distance de Levenshtein = 1).

### Fusionner deux fiches :
1. Sélectionnez la paire à examiner dans la colonne de gauche.
2. Choisissez champ par champ la valeur à conserver entre la **Fiche A** et la **Fiche B**.
3. Vérifiez l'**Aperçu du résultat après fusion** (les étiquettes et notes des deux fiches sont automatiquement réunies).
4. Cliquez sur **Valider et Fusionner ces 2 fiches** ou utilisez **Tout fusionner automatiquement**.

---

## 4. Import / Export CSV & JSON et Signalement des Lignes Invalides

![Import CSV/JSON et Rapport d'Erreurs Ligne par Ligne](./screenshots/03-import-validation-report.svg)

1. Rendez-vous dans l'onglet **Import & Export**.
2. Chargez un fichier `.csv` ou `.json` depuis votre ordinateur ou utilisez l'un des **3 jeux d'essai préconfigurés** (*CSV avec erreurs*, *CSV 100% valide*, *JSON mixte*).
3. Cliquez sur **Simuler & Vérifier les erreurs (Dry-Run)** ou sur **Exécuter l'importation des lignes valides**.
4. Le rapport détaille chaque ligne rejetée avec son **numéro de ligne exact** (`Ligne 3`, `Ligne 4`) et l'explication précise de l'anomalie, tout en permettant d'exporter le rapport d'erreurs en `.json`.

---

## 5. Journal d'Activité, Historique des Recherches & Profils d'Accès

![Journal d'Activité et Historique de Conformité des Recherches](./screenshots/04-audit-rbac-security.svg)

- **Historique de conformité des recherches** : Chaque recherche effectuée dans le répertoire est enregistrée dans la carte **Historique des recherches** avec le terme recherché et le nombre de résultats obtenus.
  - Cliquez sur **« Filtrer les recherches »** pour n'afficher que l'historique des recherches dans le tableau.
  - Cliquez directement sur l'un des badges de recherche récente (ex. `🔍 Moreau (2)`) pour **relancer instantanément cette recherche** dans le répertoire.
- **Gestion des profils d'utilisation** : Basculez à tout moment entre **Administrateur** (tous les droits), **Éditeur** (création, modification, import/export et fusion, sans suppression) et **Lecteur seul** (consultation et export).
