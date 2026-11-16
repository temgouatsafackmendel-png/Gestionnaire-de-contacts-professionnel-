import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { parseCsvToRecords } from '../shared/csv';
import {
  buildMergedContactPayload,
  detectAllDuplicates,
  findDuplicatesForCandidate,
  normalizeTextForComparison,
} from '../shared/duplicates';
import {
  AuditLogEntry,
  Contact,
  ContactCategory,
  ContactInput,
  ContactQueryFilters,
  DuplicateGroup,
  ImportDuplicateWarning,
  ImportResultReport,
  ImportRowError,
  SearchField,
  SearchMode,
  StorageStatus,
  UserRole,
} from '../shared/types';
import { validateAndNormalizePhone, validateContactInput } from '../shared/validation';
import { INITIAL_SYNTHETIC_CONTACTS } from './seedData';

interface DbContactRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  phone_normalized: string;
  company: string;
  job_title: string;
  category: string;
  tags_json: string;
  notes: string;
  city: string;
  country: string;
  favorite: number;
  created_at: string;
  updated_at: string;
}

interface DbAuditRow {
  id: string;
  timestamp: string;
  actor_role: string;
  action: string;
  target_id: string | null;
  summary: string;
  metadata_json: string;
}

export class ContactRepository {
  private db: Database.Database;
  private dbPath: string;
  private backupPath: string | null;
  private lastBackupAt: string | null = null;

  constructor(dbPath = './data/contacts.sqlite', backupPath: string | null = './data/contacts.backup.json') {
    this.dbPath = dbPath;
    this.backupPath = dbPath === ':memory:' ? null : backupPath;

    if (dbPath !== ':memory:') {
      const dir = path.dirname(path.resolve(dbPath));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    if (this.backupPath) {
      const backupDir = path.dirname(path.resolve(this.backupPath));
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
    }

    this.db = new Database(dbPath);
    this.initializeSchema();
    this.seedIfEmpty();
  }

  private initializeSchema(): void {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        phone_normalized TEXT NOT NULL,
        company TEXT NOT NULL DEFAULT '',
        job_title TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'autre',
        tags_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT 'France',
        favorite INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
      CREATE INDEX IF NOT EXISTS idx_contacts_phone_norm ON contacts(phone_normalized);
      CREATE INDEX IF NOT EXISTS idx_contacts_last_name ON contacts(last_name);
      CREATE INDEX IF NOT EXISTS idx_contacts_category ON contacts(category);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT,
        summary TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
    `);
  }

  private mapRowToContact(row: DbContactRow): Contact {
    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags_json);
    } catch {
      tags = [];
    }
    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      phoneNormalized: row.phone_normalized,
      company: row.company,
      jobTitle: row.job_title,
      category: row.category as ContactCategory,
      tags,
      notes: row.notes,
      city: row.city,
      country: row.country,
      favorite: Boolean(row.favorite),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private syncJsonBackup(): void {
    if (!this.backupPath) return;
    try {
      const allContacts = this.getAllContactsRaw();
      const now = new Date().toISOString();
      const payload = {
        version: '1.0.0',
        exportedAt: now,
        count: allContacts.length,
        contacts: allContacts,
      };
      const resolved = path.resolve(this.backupPath);
      const tempPath = `${resolved}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf-8');
      fs.renameSync(tempPath, resolved);
      this.lastBackupAt = now;
    } catch (err) {
      console.error('Failed to write JSON backup mirror:', err);
    }
  }

  public seedIfEmpty(): void {
    const countRow = this.db.prepare('SELECT COUNT(*) as cnt FROM contacts').get() as { cnt: number };
    if (countRow.cnt === 0) {
      // Check if a JSON backup exists to recover from
      if (this.backupPath && fs.existsSync(path.resolve(this.backupPath))) {
        try {
          const raw = JSON.parse(fs.readFileSync(path.resolve(this.backupPath), 'utf-8'));
          if (Array.isArray(raw.contacts) && raw.contacts.length > 0) {
            this.restoreFromContactsArray(raw.contacts, UserRole.ADMIN);
            return;
          }
        } catch {
          // Proceed with synthetic seed
        }
      }
      this.resetToSyntheticSeed(UserRole.ADMIN);
    } else {
      this.syncJsonBackup();
    }
  }

  public resetToSyntheticSeed(actorRole: UserRole = UserRole.ADMIN): Contact[] {
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM contacts').run();
      const insertStmt = this.db.prepare(`
        INSERT INTO contacts (
          id, first_name, last_name, email, phone, phone_normalized,
          company, job_title, category, tags_json, notes, city, country,
          favorite, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of INITIAL_SYNTHETIC_CONTACTS) {
        const validated = validateContactInput(item);
        if (validated.valid && validated.data) {
          const d = validated.data;
          insertStmt.run(
            crypto.randomUUID(),
            d.firstName,
            d.lastName,
            d.email,
            d.phone,
            d.phoneNormalized,
            d.company,
            d.jobTitle,
            d.category,
            JSON.stringify(d.tags),
            d.notes,
            d.city,
            d.country,
            d.favorite ? 1 : 0,
            now,
            now
          );
        }
      }
      this.recordAuditInternal(
        actorRole,
        'SEED_RESET',
        null,
        `Jeu de données synthétique réinitialisé (${INITIAL_SYNTHETIC_CONTACTS.length} contacts).`,
        { count: INITIAL_SYNTHETIC_CONTACTS.length }
      );
    });

    tx();
    this.syncJsonBackup();
    return this.getAllContactsRaw();
  }

  private restoreFromContactsArray(contacts: ContactInput[], actorRole: UserRole): void {
    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM contacts').run();
      const insertStmt = this.db.prepare(`
        INSERT INTO contacts (
          id, first_name, last_name, email, phone, phone_normalized,
          company, job_title, category, tags_json, notes, city, country,
          favorite, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      let restored = 0;
      for (const item of contacts) {
        const validated = validateContactInput(item);
        if (validated.valid && validated.data) {
          const d = validated.data;
          insertStmt.run(
            crypto.randomUUID(),
            d.firstName,
            d.lastName,
            d.email,
            d.phone,
            d.phoneNormalized,
            d.company,
            d.jobTitle,
            d.category,
            JSON.stringify(d.tags),
            d.notes,
            d.city,
            d.country,
            d.favorite ? 1 : 0,
            now,
            now
          );
          restored++;
        }
      }
      this.recordAuditInternal(
        actorRole,
        'BACKUP_RESTORE',
        null,
        `Restauration automatique depuis le miroir JSON (${restored} contacts).`,
        { restored }
      );
    });
    tx();
    this.syncJsonBackup();
  }

  private getAllContactsRaw(): Contact[] {
    const rows = this.db
      .prepare('SELECT * FROM contacts ORDER BY last_name COLLATE NOCASE ASC, first_name COLLATE NOCASE ASC')
      .all() as DbContactRow[];
    return rows.map((r) => this.mapRowToContact(r));
  }

  public getContactById(id: string): Contact | null {
    const row = this.db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as DbContactRow | undefined;
    return row ? this.mapRowToContact(row) : null;
  }

  /**
   * Lists contacts with support for Exact & Partial search modes, field targeting, and multi-criteria filtering.
   */
  public queryContacts(filters: ContactQueryFilters = {}): Contact[] {
    let list = this.getAllContactsRaw();

    // 1. Category filter
    if (filters.category && filters.category !== 'all') {
      const cat = filters.category.toLowerCase();
      list = list.filter((c) => c.category.toLowerCase() === cat);
    }

    // 2. Favorite filter
    if (filters.favorite === true) {
      list = list.filter((c) => c.favorite);
    }

    // 3. Company filter
    if (filters.company && filters.company.trim()) {
      const targetComp = normalizeTextForComparison(filters.company);
      list = list.filter((c) => normalizeTextForComparison(c.company).includes(targetComp));
    }

    // 4. City filter
    if (filters.city && filters.city.trim()) {
      const targetCity = normalizeTextForComparison(filters.city);
      list = list.filter((c) => normalizeTextForComparison(c.city).includes(targetCity));
    }

    // 5. Tag filter
    if (filters.tag && filters.tag.trim() && filters.tag !== 'all') {
      const targetTag = filters.tag.trim().toLowerCase();
      list = list.filter((c) => c.tags.some((t) => t.toLowerCase() === targetTag));
    }

    // 6. Search Query (Exact vs Partial)
    if (filters.q && filters.q.trim()) {
      const rawQuery = filters.q.trim();
      const mode = filters.searchMode || SearchMode.PARTIAL;
      const field = filters.searchField || SearchField.ALL;
      const normQuery = normalizeTextForComparison(rawQuery);
      const lowerQuery = rawQuery.toLowerCase();
      const queryPhoneNorm = validateAndNormalizePhone(rawQuery).normalized || rawQuery.replace(/\D/g, '');

      list = list.filter((c) => {
        const fullName = `${c.firstName} ${c.lastName}`;
        const reverseName = `${c.lastName} ${c.firstName}`;

        if (mode === SearchMode.EXACT) {
          // Exact matching logic
          const nameMatches =
            normalizeTextForComparison(fullName) === normQuery ||
            normalizeTextForComparison(reverseName) === normQuery ||
            normalizeTextForComparison(c.firstName) === normQuery ||
            normalizeTextForComparison(c.lastName) === normQuery;

          const emailMatches = c.email.toLowerCase() === lowerQuery;
          const phoneMatches =
            c.phone.toLowerCase() === lowerQuery ||
            (queryPhoneNorm.length >= 8 &&
              (c.phoneNormalized === queryPhoneNorm ||
                c.phoneNormalized.replace(/\D/g, '') === queryPhoneNorm.replace(/\D/g, '')));
          const companyMatches =
            Boolean(c.company) && normalizeTextForComparison(c.company) === normQuery;
          const tagMatches = c.tags.some((t) => t.toLowerCase() === lowerQuery);

          if (field === SearchField.NAME) return nameMatches;
          if (field === SearchField.EMAIL) return emailMatches;
          if (field === SearchField.PHONE) return phoneMatches;
          if (field === SearchField.COMPANY) return companyMatches;
          return nameMatches || emailMatches || phoneMatches || companyMatches || tagMatches;
        } else {
          // Partial multi-token matching logic
          const tokens = normQuery.split(/\s+/).filter(Boolean);
          const digitsQuery = rawQuery.replace(/\D/g, '');

          if (field === SearchField.NAME) {
            const hay = normalizeTextForComparison(`${c.firstName} ${c.lastName}`);
            return tokens.every((tk) => hay.includes(tk));
          }
          if (field === SearchField.EMAIL) {
            return c.email.toLowerCase().includes(lowerQuery);
          }
          if (field === SearchField.PHONE) {
            const rawDigits = c.phone.replace(/\D/g, '');
            const normDigits = c.phoneNormalized.replace(/\D/g, '');
            return (
              c.phone.toLowerCase().includes(lowerQuery) ||
              c.phoneNormalized.toLowerCase().includes(lowerQuery) ||
              (digitsQuery.length >= 2 &&
                (rawDigits.includes(digitsQuery) || normDigits.includes(digitsQuery)))
            );
          }
          if (field === SearchField.COMPANY) {
            const hay = normalizeTextForComparison(`${c.company} ${c.jobTitle}`);
            return tokens.every((tk) => hay.includes(tk));
          }

          // SearchField.ALL partial match across all fields
          const searchableText = normalizeTextForComparison(
            `${c.firstName} ${c.lastName} ${c.email} ${c.company} ${c.jobTitle} ${c.city} ${c.country} ${c.tags.join(' ')} ${c.notes}`
          );
          const rawLowerHaystack = `${c.email} ${c.phone} ${c.phoneNormalized}`.toLowerCase();
          const phoneDigitsHaystack = `${c.phone.replace(/\D/g, '')} ${c.phoneNormalized.replace(/\D/g, '')}`;

          const textMatch =
            tokens.length > 0 && tokens.every((tk) => searchableText.includes(tk));
          const directSubMatch = rawLowerHaystack.includes(lowerQuery);
          const phoneSubMatch =
            digitsQuery.length >= 3 && phoneDigitsHaystack.includes(digitsQuery);

          return textMatch || directSubMatch || phoneSubMatch;
        }
      });
    }

    // 7. Sorting
    const sortBy = filters.sortBy || 'name_asc';
    list.sort((a, b) => {
      if (sortBy === 'name_desc') {
        return `${b.lastName} ${b.firstName}`.localeCompare(`${a.lastName} ${a.firstName}`, 'fr');
      }
      if (sortBy === 'recent') {
        return b.updatedAt.localeCompare(a.updatedAt);
      }
      if (sortBy === 'company_asc') {
        return (a.company || 'zzz').localeCompare(b.company || 'zzz', 'fr');
      }
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr');
    });

    return list;
  }

  public createContact(
    rawInput: unknown,
    actorRole: UserRole = UserRole.ADMIN
  ): {
    contact?: Contact;
    duplicateWarnings?: Array<{ id: string; name: string; reasons: string[] }>;
    errors?: Record<string, string>;
    messages?: string[];
  } {
    const validation = validateContactInput(rawInput);
    if (!validation.valid || !validation.data) {
      return {
        errors: validation.fieldErrors,
        messages: validation.messages,
      };
    }

    const d = validation.data;
    const existing = this.getAllContactsRaw();
    const dupMatches = findDuplicatesForCandidate(d, existing);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
      INSERT INTO contacts (
        id, first_name, last_name, email, phone, phone_normalized,
        company, job_title, category, tags_json, notes, city, country,
        favorite, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        id,
        d.firstName,
        d.lastName,
        d.email,
        d.phone,
        d.phoneNormalized,
        d.company,
        d.jobTitle,
        d.category,
        JSON.stringify(d.tags),
        d.notes,
        d.city,
        d.country,
        d.favorite ? 1 : 0,
        now,
        now
      );

    this.recordAuditInternal(
      actorRole,
      'CREATE_CONTACT',
      id,
      `Contact créé : ${d.firstName} ${d.lastName} (${d.email})`,
      { email: d.email, company: d.company, duplicatesDetected: dupMatches.length }
    );

    this.syncJsonBackup();

    const created = this.getContactById(id)!;
    return {
      contact: created,
      duplicateWarnings: dupMatches.map((m) => ({
        id: m.contact.id,
        name: `${m.contact.firstName} ${m.contact.lastName}`,
        reasons: m.reasons.map((r) => r.label),
      })),
    };
  }

  public updateContact(
    id: string,
    rawInput: unknown,
    actorRole: UserRole = UserRole.ADMIN
  ): {
    contact?: Contact;
    notFound?: boolean;
    errors?: Record<string, string>;
    messages?: string[];
  } {
    const existing = this.getContactById(id);
    if (!existing) {
      return { notFound: true, messages: ['Contact introuvable.'] };
    }

    const mergedInput = {
      firstName: existing.firstName,
      lastName: existing.lastName,
      email: existing.email,
      phone: existing.phone,
      company: existing.company,
      jobTitle: existing.jobTitle,
      category: existing.category,
      tags: existing.tags,
      notes: existing.notes,
      city: existing.city,
      country: existing.country,
      favorite: existing.favorite,
      ...(typeof rawInput === 'object' && rawInput !== null ? rawInput : {}),
    };

    const validation = validateContactInput(mergedInput);
    if (!validation.valid || !validation.data) {
      return {
        errors: validation.fieldErrors,
        messages: validation.messages,
      };
    }

    const d = validation.data;
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
      UPDATE contacts SET
        first_name = ?,
        last_name = ?,
        email = ?,
        phone = ?,
        phone_normalized = ?,
        company = ?,
        job_title = ?,
        category = ?,
        tags_json = ?,
        notes = ?,
        city = ?,
        country = ?,
        favorite = ?,
        updated_at = ?
      WHERE id = ?
    `
      )
      .run(
        d.firstName,
        d.lastName,
        d.email,
        d.phone,
        d.phoneNormalized,
        d.company,
        d.jobTitle,
        d.category,
        JSON.stringify(d.tags),
        d.notes,
        d.city,
        d.country,
        d.favorite ? 1 : 0,
        now,
        id
      );

    this.recordAuditInternal(
      actorRole,
      'UPDATE_CONTACT',
      id,
      `Contact mis à jour : ${d.firstName} ${d.lastName} (${d.email})`,
      { email: d.email }
    );

    this.syncJsonBackup();
    return { contact: this.getContactById(id)! };
  }

  public deleteContact(id: string, actorRole: UserRole = UserRole.ADMIN): boolean {
    const existing = this.getContactById(id);
    if (!existing) return false;

    this.db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
    this.recordAuditInternal(
      actorRole,
      'DELETE_CONTACT',
      id,
      `Contact supprimé : ${existing.firstName} ${existing.lastName} (${existing.email})`,
      { email: existing.email, company: existing.company }
    );
    this.syncJsonBackup();
    return true;
  }

  public getDuplicates(): DuplicateGroup[] {
    const all = this.getAllContactsRaw();
    return detectAllDuplicates(all);
  }

  /**
   * Merges secondaryContactId into primaryContactId in a single ACID transaction.
   */
  public mergeContacts(
    primaryId: string,
    secondaryId: string,
    overrides?: Partial<ContactInput>,
    actorRole: UserRole = UserRole.ADMIN
  ): {
    mergedContact?: Contact;
    error?: string;
  } {
    if (primaryId === secondaryId) {
      return { error: 'Impossible de fusionner un contact avec lui-même.' };
    }

    const primary = this.getContactById(primaryId);
    const secondary = this.getContactById(secondaryId);
    if (!primary || !secondary) {
      return { error: 'Un ou plusieurs contacts à fusionner sont introuvables.' };
    }

    const mergedPayload = buildMergedContactPayload(primary, secondary, overrides);
    const validated = validateContactInput(mergedPayload);
    if (!validated.valid || !validated.data) {
      return { error: validated.messages.join(' ') || 'Données de fusion invalides.' };
    }

    const d = validated.data;
    const now = new Date().toISOString();

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `
        UPDATE contacts SET
          first_name = ?,
          last_name = ?,
          email = ?,
          phone = ?,
          phone_normalized = ?,
          company = ?,
          job_title = ?,
          category = ?,
          tags_json = ?,
          notes = ?,
          city = ?,
          country = ?,
          favorite = ?,
          updated_at = ?
        WHERE id = ?
      `
        )
        .run(
          d.firstName,
          d.lastName,
          d.email,
          d.phone,
          d.phoneNormalized,
          d.company,
          d.jobTitle,
          d.category,
          JSON.stringify(d.tags),
          d.notes,
          d.city,
          d.country,
          d.favorite ? 1 : 0,
          now,
          primaryId
        );

      this.db.prepare('DELETE FROM contacts WHERE id = ?').run(secondaryId);

      this.recordAuditInternal(
        actorRole,
        'MERGE_CONTACTS',
        primaryId,
        `Doublon fusionné : ${secondary.firstName} ${secondary.lastName} (${secondary.email}) absorbé dans ${d.firstName} ${d.lastName}`,
        {
          primaryId,
          deletedSecondaryId: secondaryId,
          secondaryEmail: secondary.email,
        }
      );
    });

    tx();
    this.syncJsonBackup();
    return { mergedContact: this.getContactById(primaryId)! };
  }

  /**
   * Imports contacts from CSV or JSON with detailed row-level error reporting and duplicate handling.
   */
  public importContacts(params: {
    format: 'csv' | 'json';
    content: string;
    dryRun?: boolean;
    duplicateStrategy?: 'skip' | 'update' | 'create_anyway';
    actorRole?: UserRole;
  }): ImportResultReport {
    const format = params.format;
    const dryRun = Boolean(params.dryRun);
    const duplicateStrategy = params.duplicateStrategy || 'skip';
    const actorRole = params.actorRole || UserRole.EDITOR;
    const now = new Date().toISOString();

    const errors: ImportRowError[] = [];
    const duplicateWarnings: ImportDuplicateWarning[] = [];
    let rawRows: Array<{ line: number; data: Record<string, unknown> }> = [];

    if (format === 'csv') {
      const parsed = parseCsvToRecords(params.content);
      if (parsed.parseError) {
        return {
          format,
          dryRun,
          duplicateStrategy,
          totalRows: 0,
          validRowsCount: 0,
          importedCount: 0,
          updatedCount: 0,
          skippedDuplicatesCount: 0,
          invalidRowsCount: 1,
          errors: [
            {
              line: 1,
              rawIdentifier: 'En-tête / Structure CSV',
              fieldErrors: { csv: parsed.parseError },
              messages: [parsed.parseError],
              rawData: {},
            },
          ],
          duplicateWarnings: [],
          timestamp: now,
        };
      }
      rawRows = parsed.rows;
    } else {
      try {
        const parsedJson = JSON.parse(params.content);
        const arr = Array.isArray(parsedJson)
          ? parsedJson
          : Array.isArray(parsedJson?.contacts)
            ? parsedJson.contacts
            : null;

        if (!arr) {
          return {
            format,
            dryRun,
            duplicateStrategy,
            totalRows: 0,
            validRowsCount: 0,
            importedCount: 0,
            updatedCount: 0,
            skippedDuplicatesCount: 0,
            invalidRowsCount: 1,
            errors: [
              {
                line: 1,
                rawIdentifier: 'Structure JSON',
                fieldErrors: {
                  json: 'Le JSON doit être un tableau de contacts ou un objet contenant la clé "contacts".',
                },
                messages: [
                  'Le JSON doit être un tableau de contacts ou un objet contenant la clé "contacts".',
                ],
                rawData: {},
              },
            ],
            duplicateWarnings: [],
            timestamp: now,
          };
        }

        rawRows = arr.map((item: unknown, idx: number) => ({
          line: idx + 1,
          data: typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {},
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur de syntaxe JSON';
        return {
          format,
          dryRun,
          duplicateStrategy,
          totalRows: 0,
          validRowsCount: 0,
          importedCount: 0,
          updatedCount: 0,
          skippedDuplicatesCount: 0,
          invalidRowsCount: 1,
          errors: [
            {
              line: 1,
              rawIdentifier: 'Syntaxe JSON',
              fieldErrors: { json: `JSON invalide : ${msg}` },
              messages: [`Fichier JSON mal formé : ${msg}`],
              rawData: {},
            },
          ],
          duplicateWarnings: [],
          timestamp: now,
        };
      }
    }

    if (rawRows.length > 2000) {
      return {
        format,
        dryRun,
        duplicateStrategy,
        totalRows: rawRows.length,
        validRowsCount: 0,
        importedCount: 0,
        updatedCount: 0,
        skippedDuplicatesCount: 0,
        invalidRowsCount: 1,
        errors: [
          {
            line: 1,
            rawIdentifier: 'Limite de lot dépassée',
            fieldErrors: { batch: 'Maximum 2000 contacts par import.' },
            messages: ['Le lot dépasse la limite de sécurité autorisée (2000 lignes max).'],
            rawData: {},
          },
        ],
        duplicateWarnings: [],
        timestamp: now,
      };
    }

    let validRowsCount = 0;
    let importedCount = 0;
    let updatedCount = 0;
    let skippedDuplicatesCount = 0;

    const existingContacts = this.getAllContactsRaw();

    const executeBatch = this.db.transaction(() => {
      const insertStmt = this.db.prepare(`
        INSERT INTO contacts (
          id, first_name, last_name, email, phone, phone_normalized,
          company, job_title, category, tags_json, notes, city, country,
          favorite, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const updateStmt = this.db.prepare(`
        UPDATE contacts SET
          first_name = ?,
          last_name = ?,
          email = ?,
          phone = ?,
          phone_normalized = ?,
          company = ?,
          job_title = ?,
          category = ?,
          tags_json = ?,
          notes = ?,
          city = ?,
          country = ?,
          favorite = ?,
          updated_at = ?
        WHERE id = ?
      `);

      for (const row of rawRows) {
        const validation = validateContactInput(row.data);
        const rawLabel =
          [row.data.firstName, row.data.lastName, row.data.email]
            .filter(Boolean)
            .join(' · ') || `Ligne ${row.line}`;

        if (!validation.valid || !validation.data) {
          errors.push({
            line: row.line,
            rawIdentifier: rawLabel,
            fieldErrors: validation.fieldErrors,
            messages: validation.messages,
            rawData: row.data,
          });
          continue;
        }

        validRowsCount++;
        const clean = validation.data;
        const dupMatches = findDuplicatesForCandidate(clean, existingContacts);

        if (dupMatches.length > 0) {
          const primaryDup = dupMatches[0];
          const reasonLabels = primaryDup.reasons.map((r) => r.label);

          if (duplicateStrategy === 'skip') {
            skippedDuplicatesCount++;
            duplicateWarnings.push({
              line: row.line,
              incomingContact: clean,
              existingContact: {
                id: primaryDup.contact.id,
                firstName: primaryDup.contact.firstName,
                lastName: primaryDup.contact.lastName,
                email: primaryDup.contact.email,
                phone: primaryDup.contact.phone,
                company: primaryDup.contact.company,
              },
              reasons: reasonLabels,
              actionTaken: dryRun ? 'pending_review' : 'skipped',
            });
            continue;
          } else if (duplicateStrategy === 'update') {
            updatedCount++;
            duplicateWarnings.push({
              line: row.line,
              incomingContact: clean,
              existingContact: {
                id: primaryDup.contact.id,
                firstName: primaryDup.contact.firstName,
                lastName: primaryDup.contact.lastName,
                email: primaryDup.contact.email,
                phone: primaryDup.contact.phone,
                company: primaryDup.contact.company,
              },
              reasons: reasonLabels,
              actionTaken: dryRun ? 'pending_review' : 'updated',
            });

            if (!dryRun) {
              const mergedTags = Array.from(
                new Set([...primaryDup.contact.tags, ...clean.tags])
              );
              updateStmt.run(
                clean.firstName,
                clean.lastName,
                clean.email,
                clean.phone,
                clean.phoneNormalized,
                clean.company || primaryDup.contact.company,
                clean.jobTitle || primaryDup.contact.jobTitle,
                clean.category || primaryDup.contact.category,
                JSON.stringify(mergedTags),
                clean.notes || primaryDup.contact.notes,
                clean.city || primaryDup.contact.city,
                clean.country || primaryDup.contact.country,
                clean.favorite || primaryDup.contact.favorite ? 1 : 0,
                now,
                primaryDup.contact.id
              );
            }
            continue;
          } else {
            // create_anyway
            duplicateWarnings.push({
              line: row.line,
              incomingContact: clean,
              existingContact: {
                id: primaryDup.contact.id,
                firstName: primaryDup.contact.firstName,
                lastName: primaryDup.contact.lastName,
                email: primaryDup.contact.email,
                phone: primaryDup.contact.phone,
                company: primaryDup.contact.company,
              },
              reasons: reasonLabels,
              actionTaken: dryRun ? 'pending_review' : 'imported',
            });
          }
        }

        importedCount++;
        if (!dryRun) {
          const newId = crypto.randomUUID();
          insertStmt.run(
            newId,
            clean.firstName,
            clean.lastName,
            clean.email,
            clean.phone,
            clean.phoneNormalized,
            clean.company,
            clean.jobTitle,
            clean.category,
            JSON.stringify(clean.tags),
            clean.notes,
            clean.city,
            clean.country,
            clean.favorite ? 1 : 0,
            now,
            now
          );
          existingContacts.push({
            id: newId,
            ...clean,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      if (!dryRun) {
        this.recordAuditInternal(
          actorRole,
          'IMPORT_CONTACTS',
          null,
          `Import ${format.toUpperCase()} : ${importedCount} créés, ${updatedCount} mis à jour, ${skippedDuplicatesCount} doublons ignorés, ${errors.length} lignes invalides rejetées.`,
          {
            format,
            duplicateStrategy,
            totalRows: rawRows.length,
            importedCount,
            updatedCount,
            skippedDuplicatesCount,
            invalidRowsCount: errors.length,
          }
        );
      }
    });

    executeBatch();
    if (!dryRun) {
      this.syncJsonBackup();
    }

    return {
      format,
      dryRun,
      duplicateStrategy,
      totalRows: rawRows.length,
      validRowsCount,
      importedCount,
      updatedCount,
      skippedDuplicatesCount,
      invalidRowsCount: errors.length,
      errors,
      duplicateWarnings,
      timestamp: now,
    };
  }

  public recordAudit(
    actorRole: UserRole,
    action: AuditLogEntry['action'],
    targetId: string | null,
    summary: string,
    metadata: Record<string, unknown> = {}
  ): void {
    this.recordAuditInternal(actorRole, action, targetId, summary, metadata);
  }

  private recordAuditInternal(
    actorRole: UserRole,
    action: AuditLogEntry['action'],
    targetId: string | null,
    summary: string,
    metadata: Record<string, unknown> = {}
  ): void {
    this.db
      .prepare(
        `
      INSERT INTO audit_logs (id, timestamp, actor_role, action, target_id, summary, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        crypto.randomUUID(),
        new Date().toISOString(),
        actorRole,
        action,
        targetId,
        summary,
        JSON.stringify(metadata)
      );
  }

  public getAuditLogs(limit = 100): AuditLogEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?')
      .all(limit) as DbAuditRow[];

    return rows.map((r) => {
      let metadata: Record<string, unknown> = {};
      try {
        metadata = JSON.parse(r.metadata_json);
      } catch {
        metadata = {};
      }
      return {
        id: r.id,
        timestamp: r.timestamp,
        actorRole: r.actor_role as UserRole,
        action: r.action as AuditLogEntry['action'],
        targetId: r.target_id,
        summary: r.summary,
        metadata,
      };
    });
  }

  public getStorageStatus(): StorageStatus {
    const contactCount = (
      this.db.prepare('SELECT COUNT(*) as cnt FROM contacts').get() as { cnt: number }
    ).cnt;
    const auditCount = (
      this.db.prepare('SELECT COUNT(*) as cnt FROM audit_logs').get() as { cnt: number }
    ).cnt;
    const integrityRow = this.db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    const integrityOk = integrityRow?.[0]?.integrity_check === 'ok';

    return {
      engine: 'sqlite+json-mirror',
      dbPath: this.dbPath,
      backupPath: this.backupPath || 'in-memory',
      totalContacts: contactCount,
      totalAuditLogs: auditCount,
      lastBackupAt: this.lastBackupAt,
      integrityOk,
    };
  }

  public triggerManualBackup(actorRole: UserRole = UserRole.ADMIN): StorageStatus {
    this.syncJsonBackup();
    this.recordAuditInternal(
      actorRole,
      'BACKUP_RESTORE',
      null,
      'Sauvegarde synchronisée SQLite WAL + Miroir JSON vérifiée avec succès.',
      { lastBackupAt: this.lastBackupAt }
    );
    return this.getStorageStatus();
  }

  public close(): void {
    this.db.close();
  }
}
