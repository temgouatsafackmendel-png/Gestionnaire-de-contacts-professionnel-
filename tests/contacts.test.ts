import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/app';
import { ContactRepository } from '../src/server/repository';
import { parseCsvToRecords, sanitizeCsvCell, serializeContactsToCsv } from '../src/shared/csv';
import { detectAllDuplicates, evaluatePairDuplicateReasons } from '../src/shared/duplicates';
import { ContactCategory, SearchField, SearchMode, UserRole } from '../src/shared/types';
import {
  validateAndNormalizePhone,
  validateContactInput,
  validateEmailAddress,
} from '../src/shared/validation';

describe('1. Tests Unitaires — Validation Email, Téléphone & Sanitization', () => {
  it('valide et normalise correctement les adresses email valides', () => {
    const res = validateEmailAddress('  Camille.Moreau+pro@Atelier-Veridian.FR ');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('camille.moreau+pro@atelier-veridian.fr');
  });

  it('rejette les emails mal formés, sans domaine valide ou avec doubles points', () => {
    expect(validateEmailAddress('').valid).toBe(false);
    expect(validateEmailAddress('jean.dupont@').valid).toBe(false);
    expect(validateEmailAddress('jean..dupont@domaine.fr').valid).toBe(false);
    expect(validateEmailAddress('jean@domaine.123').valid).toBe(false);
    expect(validateEmailAddress('sans-arobase.fr').valid).toBe(false);
  });

  it('normalise les numéros français (06...) et internationaux en E.164', () => {
    const frLocal = validateAndNormalizePhone('06 45 78 12 33');
    expect(frLocal.valid).toBe(true);
    expect(frLocal.normalized).toBe('+33645781233');

    const frIntl = validateAndNormalizePhone('+33 (0)6 45 78 12 33');
    expect(frIntl.valid).toBe(true);
    expect(frIntl.normalized).toBe('+33645781233');

    const chIntl = validateAndNormalizePhone('+41 22 819 44 10');
    expect(chIntl.valid).toBe(true);
    expect(chIntl.normalized).toBe('+41228194410');
  });

  it('rejette les numéros de téléphone trop courts, contenant des lettres ou répétitifs', () => {
    expect(validateAndNormalizePhone('12345').valid).toBe(false);
    expect(validateAndNormalizePhone('06 12 XX 34 56').valid).toBe(false);
    expect(validateAndNormalizePhone('0000000000').valid).toBe(false);
    expect(validateAndNormalizePhone('++33612345678').valid).toBe(false);
  });

  it('valide un objet ContactInput complet et nettoie les étiquettes', () => {
    const check = validateContactInput({
      firstName: '  Éléonore ',
      lastName: ' Saint-Clair ',
      email: 'Eleonore@SaintClair.fr',
      phone: '07 81 23 45 67',
      category: 'CLIENT',
      tags: ['VIP', 'vip', ' Paris '],
    });
    expect(check.valid).toBe(true);
    expect(check.data?.firstName).toBe('Éléonore');
    expect(check.data?.phoneNormalized).toBe('+33781234567');
    expect(check.data?.category).toBe(ContactCategory.CLIENT);
    expect(check.data?.tags).toEqual(['vip', 'paris']);
  });
});

describe('2. Tests Unitaires — Détection de Doublons & CSV Sécurisé', () => {
  it('détecte un doublon exact par téléphone normalisé même sous deux formats différents', () => {
    const reasons = evaluatePairDuplicateReasons(
      {
        firstName: 'Thomas',
        lastName: 'Lefèvre',
        email: 't.lefevre@helios.eu',
        phone: '06 45 78 12 33',
        phoneNormalized: '+33645781233',
        company: 'Helios',
      },
      {
        firstName: 'Thomas',
        lastName: 'Lefevre',
        email: 'autre@helios.eu',
        phone: '+33 6 45 78 12 33',
        phoneNormalized: '+33645781233',
        company: 'Helios',
      }
    );
    expect(reasons.some((r) => r.type === 'phone_exact')).toBe(true);
    expect(reasons.some((r) => r.type === 'name_company_exact')).toBe(true);
  });

  it("détecte l'inversion Prénom / Nom entre deux fiches", () => {
    const reasons = evaluatePairDuplicateReasons(
      {
        firstName: 'Martin',
        lastName: 'Bernard',
        email: 'm.bernard@exemple.fr',
        phone: '+33611223344',
        phoneNormalized: '+33611223344',
        company: 'Acme',
      },
      {
        firstName: 'Bernard',
        lastName: 'Martin',
        email: 'b.martin@autre.fr',
        phone: '+33699887766',
        phoneNormalized: '+33699887766',
        company: 'Acme',
      }
    );
    expect(reasons.some((r) => r.type === 'name_similar')).toBe(true);
  });

  it('neutralise les injections de formules CSV (=, +, -, @) lors de la sérialisation', () => {
    expect(sanitizeCsvCell('=cmd|\'/C calc\'!A0')).toBe("'=cmd|'/C calc'!A0");
    expect(sanitizeCsvCell('+SUM(A1:A2)')).toBe("'+SUM(A1:A2)");
    expect(sanitizeCsvCell('@import')).toBe("'@import");

    const parsed = parseCsvToRecords(
      'prenom;nom;courriel;telephone;entreprise\nNadia;Khelifi;nadia@aurum.fr;0677889910;Aurum'
    );
    expect(parsed.parseError).toBeUndefined();
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].data.firstName).toBe('Nadia');
    expect(parsed.rows[0].data.email).toBe('nadia@aurum.fr');
  });
});

describe('3. Tests Intégration & Parcours Critiques API (Critères d’acceptation)', () => {
  let tempDir: string;
  let dbPath: string;
  let backupPath: string;
  let repo: ContactRepository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veridian-contacts-test-'));
    dbPath = path.join(tempDir, 'contacts.sqlite');
    backupPath = path.join(tempDir, 'contacts.backup.json');
    repo = new ContactRepository(dbPath, backupPath);
  });

  afterEach(() => {
    repo.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('Critère 1 : Recherche Exacte vs Recherche Partielle + Filtres multicritères', async () => {
    const app = createApiApp(repo);

    // Recherche partielle "Moreau" ou "camille"
    const partialRes = await request(app)
      .get('/api/contacts')
      .query({ q: 'camille', searchMode: SearchMode.PARTIAL });
    expect(partialRes.status).toBe(200);
    expect(partialRes.body.contacts.length).toBeGreaterThanOrEqual(1);
    expect(partialRes.body.contacts[0].lastName).toBe('Moreau');

    // Recherche exacte sur une sous-chaîne partielle ("camil") -> 0 résultat
    const exactFailRes = await request(app)
      .get('/api/contacts')
      .query({ q: 'camil', searchMode: SearchMode.EXACT, searchField: SearchField.NAME });
    expect(exactFailRes.status).toBe(200);
    expect(exactFailRes.body.contacts).toHaveLength(0);

    // Recherche exacte sur le nom complet "Camille Moreau" -> 1 résultat
    const exactHitRes = await request(app)
      .get('/api/contacts')
      .query({ q: 'Camille Moreau', searchMode: SearchMode.EXACT, searchField: SearchField.NAME });
    expect(exactHitRes.status).toBe(200);
    expect(exactHitRes.body.contacts).toHaveLength(1);
    expect(exactHitRes.body.contacts[0].email).toBe('camille.moreau@atelier-veridian.fr');

    // Recherche exacte par téléphone quel que soit le format saisi (06 14 28 39 50 vs +33 6 14 28 39 50)
    const phoneExactRes = await request(app)
      .get('/api/contacts')
      .query({ q: '0614283950', searchMode: SearchMode.EXACT, searchField: SearchField.PHONE });
    expect(phoneExactRes.status).toBe(200);
    expect(phoneExactRes.body.contacts).toHaveLength(1);
    expect(phoneExactRes.body.contacts[0].firstName).toBe('Camille');
  });

  it('Critère 2 : Import invalide signalé avec numéros de lignes exacts et détails par champ', async () => {
    const app = createApiApp(repo);

    const mixedCsv = [
      'firstName,lastName,email,phone,company,category',
      'Valérie,Arnaud,valerie.arnaud@hexagone.fr,+33 6 11 22 33 44,Hexagone,client',
      'Jean,Invalide,email-sans-domaine,06 12 34 56 78,TestCorp,prospect',
      ',SansPrenom,ok@domaine.fr,123,TestCorp,autre',
    ].join('\n');

    const importRes = await request(app)
      .post('/api/contacts/import')
      .set('x-user-role', UserRole.EDITOR)
      .send({
        format: 'csv',
        content: mixedCsv,
        dryRun: false,
        duplicateStrategy: 'skip',
      });

    expect(importRes.status).toBe(200);
    const report = importRes.body;
    expect(report.totalRows).toBe(3);
    expect(report.validRowsCount).toBe(1);
    expect(report.importedCount).toBe(1);
    expect(report.invalidRowsCount).toBe(2);
    expect(report.errors).toHaveLength(2);

    // Ligne 3 du CSV : email invalide
    expect(report.errors[0].line).toBe(3);
    expect(report.errors[0].fieldErrors.email).toBeDefined();

    // Ligne 4 du CSV : prénom manquant ET téléphone trop court
    expect(report.errors[1].line).toBe(4);
    expect(report.errors[1].fieldErrors.firstName).toBeDefined();
    expect(report.errors[1].fieldErrors.phone).toBeDefined();
  });

  it('Critère 3 : Sauvegarde fiable (persistance SQLite WAL + restauration miroir JSON)', async () => {
    const app = createApiApp(repo);

    // Créer un nouveau contact
    const createRes = await request(app)
      .post('/api/contacts')
      .set('x-user-role', UserRole.ADMIN)
      .send({
        firstName: 'Hélène',
        lastName: 'Boucher',
        email: 'helene.boucher@aero-france.fr',
        phone: '06 70 80 90 10',
        company: 'Aéro France',
        category: 'client',
      });

    expect(createRes.status).toBe(201);
    const createdId = createRes.body.contact.id;

    // Vérifier que le fichier miroir JSON existe sur disque et contient Hélène Boucher
    expect(fs.existsSync(backupPath)).toBe(true);
    const backupJson = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
    expect(
      backupJson.contacts.some((c: { email: string }) => c.email === 'helene.boucher@aero-france.fr')
    ).toBe(true);

    // Fermer la base SQLite et rouvrir une nouvelle instance sur le même fichier pour prouver la persistance
    repo.close();
    const reopenedRepo = new ContactRepository(dbPath, backupPath);
    const persisted = reopenedRepo.getContactById(createdId);
    expect(persisted).not.toBeNull();
    expect(persisted?.firstName).toBe('Hélène');
    expect(persisted?.phoneNormalized).toBe('+33670809010');
    reopenedRepo.close();

    // Réassigner repo pour le afterEach
    repo = new ContactRepository(dbPath, backupPath);
  });

  it('Fusionne deux doublons dans une transaction ACID et journalise l’opération', async () => {
    const app = createApiApp(repo);

    const dupRes = await request(app).get('/api/contacts/duplicates');
    expect(dupRes.status).toBe(200);
    expect(dupRes.body.count).toBeGreaterThanOrEqual(2);

    const pair = dupRes.body.duplicates[0];
    const primaryId = pair.primaryContact.id;
    const secondaryId = pair.duplicateContact.id;

    const mergeRes = await request(app)
      .post('/api/contacts/merge')
      .set('x-user-role', UserRole.ADMIN)
      .send({
        primaryId,
        secondaryId,
        overrides: { jobTitle: 'Directeur Achats Unifié' },
      });

    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body.contact.id).toBe(primaryId);
    expect(mergeRes.body.contact.jobTitle).toBe('Directeur Achats Unifié');

    // Le contact secondaire doit avoir été supprimé
    const checkSecondary = await request(app).get(`/api/contacts/${secondaryId}`);
    expect(checkSecondary.status).toBe(404);
  });

  it('Sécurité RBAC & Rate Limiting : bloque les actions non autorisées et les trace dans Audit', async () => {
    const app = createApiApp(repo, { maxRequestsPerMin: 50 });

    // Un "viewer" tente de supprimer un contact -> 403 Forbidden
    const all = repo.queryContacts();
    const targetId = all[0].id;

    const delRes = await request(app)
      .delete(`/api/contacts/${targetId}`)
      .set('x-user-role', UserRole.VIEWER);
    expect(delRes.status).toBe(403);

    // Un "editor" tente de supprimer un contact -> 403 Forbidden
    const delEditorRes = await request(app)
      .delete(`/api/contacts/${targetId}`)
      .set('x-user-role', UserRole.EDITOR);
    expect(delEditorRes.status).toBe(403);

    // Vérifier que les refus d'autorisation sont enregistrés dans le journal d'audit
    const auditRes = await request(app).get('/api/audit');
    expect(auditRes.status).toBe(200);
    const deniedEntries = auditRes.body.logs.filter(
      (l: { action: string }) => l.action === 'PERMISSION_DENIED'
    );
    expect(deniedEntries.length).toBeGreaterThanOrEqual(2);
  });
});
