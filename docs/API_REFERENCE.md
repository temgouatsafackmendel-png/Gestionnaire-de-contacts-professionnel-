# Référence Technique de l'API REST — Veridian Contacts

Le serveur Express expose une API REST JSON sur le préfixe `/api`.

---

## 1. En-têtes & Sécurité

| En-tête HTTP | Valeurs acceptées | Description |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Obligatoire pour les requêtes `POST` et `PUT` (taille max : `2mb`) |
| `x-user-role` | `admin` \| `editor` \| `viewer` | Rôle RBAC appliqué à la requête (défaut : `DEFAULT_ROLE` ou `admin`) |

### Codes de retour standards
- `200 OK` : Opération réussie.
- `201 Created` : Ressource créée avec succès.
- `400 Bad Request` : Erreur de validation des entrées (retourne `error`, `fieldErrors` et `messages`).
- `403 Forbidden` : Rôle RBAC insuffisant (l'événement `PERMISSION_DENIED` est journalisé dans `audit_logs`).
- `404 Not Found` : Contact introuvable.
- `429 Too Many Requests` : Seuil de rate-limiting dépassé (`180` requêtes/minute par défaut).

---

## 2. Endpoints de Répertoire & Recherche

### `GET /api/contacts`
Liste, recherche et filtre les contacts.

**Paramètres de requête (Query Parameters) :**
- `q` *(string)* : Terme de recherche.
- `searchMode` *(`partial` | `exact`)* : Mode de correspondance (défaut : `partial`).
- `searchField` *(`all` | `name` | `email` | `phone` | `company`)* : Champ ciblé (défaut : `all`).
- `category` *(`client` | `partenaire` | `fournisseur` | `prospect` | `interne` | `autre`)* : Filtre par catégorie.
- `favorite` *(`true`)* : Filtre uniquement les contacts favoris.
- `tag` *(string)* : Filtre par étiquette exacte.
- `sortBy` *(`name_asc` | `name_desc` | `company_asc` | `recent`)* : Ordre de tri.

**Exemple `curl` (Recherche exacte sur un numéro de téléphone) :**
```bash
curl "http://localhost:3000/api/contacts?q=0614283950&searchMode=exact&searchField=phone"
```

---

### `POST /api/contacts`
Crée un nouveau contact après validation stricte RFC 5322 (email) et normalisation E.164 (téléphone). Requiert le rôle `admin` ou `editor`.

**Corps de requête (`application/json`) :**
```json
{
  "firstName": "Camille",
  "lastName": "Moreau",
  "email": "camille.moreau@atelier-veridian.fr",
  "phone": "06 14 28 39 50",
  "company": "Atelier Veridian SAS",
  "jobTitle": "Directrice Produit",
  "category": "client",
  "tags": ["vip", "paris"],
  "city": "Paris",
  "country": "France",
  "favorite": true,
  "notes": "Compte stratégique annuel."
}
```

**Réponse `201 Created` :**
```json
{
  "contact": {
    "id": "e22b6193-7979-4134-9c82-9195c3133839",
    "firstName": "Camille",
    "lastName": "Moreau",
    "email": "camille.moreau@atelier-veridian.fr",
    "phone": "06 14 28 39 50",
    "phoneNormalized": "+33614283950",
    "company": "Atelier Veridian SAS",
    "jobTitle": "Directrice Produit",
    "category": "client",
    "tags": ["vip", "paris"],
    "city": "Paris",
    "country": "France",
    "favorite": true,
    "notes": "Compte stratégique annuel.",
    "createdAt": "2026-11-16T21:16:18.132Z",
    "updatedAt": "2026-11-16T21:16:18.132Z"
  },
  "duplicateWarnings": []
}
```

---

### `PUT /api/contacts/:id`
Met à jour partiellement ou totalement un contact existant. Requiert `admin` ou `editor`.

### `DELETE /api/contacts/:id`
Supprime définitivement un contact. Requiert exclusivement le rôle `admin`.

---

## 3. Endpoints de Déduplication & Fusion ACID

### `GET /api/contacts/duplicates`
Analyse le répertoire et retourne la liste des paires de doublons triées par score de confiance décroissant (`score` de 75 à 100, `severity`: `high` | `medium` | `low`).

### `POST /api/contacts/merge`
Fusionne `secondaryId` dans `primaryId` au sein d'une transaction SQLite ACID unique (unifie les étiquettes et les notes, met à jour la fiche principale et supprime la fiche secondaire). Requiert `admin` ou `editor`.

```json
{
  "primaryId": "d85e28ac-c22f-4d56-9991-42f16a92124a",
  "secondaryId": "52e08b2f-4684-45ae-9507-522876091935",
  "overrides": {
    "jobTitle": "Directeur des Achats Groupe"
  }
}
```

---

## 4. Endpoints d'Import / Export & Sauvegarde

### `POST /api/contacts/import`
Analyse et importe un contenu `csv` ou `json`. Requiert `admin` ou `editor`.

**Corps de requête :**
```json
{
  "format": "csv",
  "content": "firstName,lastName,email,phone\nValérie,Arnaud,valerie@hexagone.fr,0611223344\nJean,Erreur,email-invalide,123",
  "dryRun": false,
  "duplicateStrategy": "skip"
}
```

**Réponse `200 OK` (`ImportResultReport`) :**
```json
{
  "format": "csv",
  "dryRun": false,
  "duplicateStrategy": "skip",
  "totalRows": 2,
  "validRowsCount": 1,
  "importedCount": 1,
  "updatedCount": 0,
  "skippedDuplicatesCount": 0,
  "invalidRowsCount": 1,
  "errors": [
    {
      "line": 3,
      "rawIdentifier": "Jean · Erreur · email-invalide",
      "fieldErrors": {
        "email": "Format d'email invalide (\"email-invalide\"). Attendu : exemple@domaine.fr",
        "phone": "Longueur de numéro invalide (3 chiffres dans \"123\"). Attendu : entre 8 et 15 chiffres."
      },
      "messages": [
        "Format d'email invalide (\"email-invalide\"). Attendu : exemple@domaine.fr",
        "Longueur de numéro invalide (3 chiffres dans \"123\"). Attendu : entre 8 et 15 chiffres."
      ]
    }
  ],
  "duplicateWarnings": [],
  "timestamp": "2026-11-16T21:30:00.000Z"
}
```

### `GET /api/contacts/export?format=csv|json`
Génère et télécharge l'export des contacts (accepte tous les filtres de `GET /api/contacts`).

### `GET /api/storage/status` & `POST /api/storage/backup`
Retourne ou déclenche la vérification `PRAGMA integrity_check` de SQLite et la synchronisation atomique du miroir JSON.
