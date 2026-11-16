import express, { NextFunction, Request, Response } from 'express';
import { serializeContactsToCsv } from '../shared/csv';
import { ContactQueryFilters, SearchField, SearchMode, UserRole } from '../shared/types';
import { ContactRepository } from './repository';

export function createApiApp(repo: ContactRepository, options?: { maxRequestsPerMin?: number }) {
  const app = express();

  // Security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  // Strict JSON payload size limit (2MB max to protect against DoS uploads)
  app.use(express.json({ limit: '2mb' }));

  // Simple in-memory rate limiter per IP for /api routes
  const maxReqs = options?.maxRequestsPerMin ?? Number(process.env.RATE_LIMIT_MAX_REQUESTS || 180);
  const rateBuckets = new Map<string, { count: number; resetAt: number }>();

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'local';
    const now = Date.now();
    const bucket = rateBuckets.get(ip);

    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > maxReqs) {
      return res.status(429).json({
        error: 'Trop de requêtes. Veuillez patienter une minute avant de réessayer.',
      });
    }
    next();
  });

  function resolveActorRole(req: Request): UserRole {
    const headerRole = String(req.headers['x-user-role'] || process.env.DEFAULT_ROLE || 'admin')
      .trim()
      .toLowerCase();
    if (headerRole === UserRole.VIEWER) return UserRole.VIEWER;
    if (headerRole === UserRole.EDITOR) return UserRole.EDITOR;
    return UserRole.ADMIN;
  }

  function requireRoles(allowed: UserRole[], actionLabel: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      const role = resolveActorRole(req);
      if (!allowed.includes(role)) {
        repo.recordAudit(
          role,
          'PERMISSION_DENIED',
          req.params.id || null,
          `Accès refusé (${role}) pour l'opération : ${actionLabel}`,
          { path: req.originalUrl, method: req.method, requiredRoles: allowed }
        );
        return res.status(403).json({
          error: `Permission refusée : le rôle "${role}" n'est pas autorisé à effectuer "${actionLabel}". Rôles requis : ${allowed.join(', ')}.`,
        });
      }
      next();
    };
  }

  function extractFiltersFromQuery(query: Request['query']): ContactQueryFilters {
    return {
      q: typeof query.q === 'string' ? query.q : undefined,
      searchMode:
        query.searchMode === SearchMode.EXACT ? SearchMode.EXACT : SearchMode.PARTIAL,
      searchField: Object.values(SearchField).includes(query.searchField as SearchField)
        ? (query.searchField as SearchField)
        : SearchField.ALL,
      category: typeof query.category === 'string' ? query.category : undefined,
      favorite: query.favorite === 'true' ? true : undefined,
      tag: typeof query.tag === 'string' ? query.tag : undefined,
      company: typeof query.company === 'string' ? query.company : undefined,
      city: typeof query.city === 'string' ? query.city : undefined,
      sortBy:
        query.sortBy === 'name_desc' ||
        query.sortBy === 'recent' ||
        query.sortBy === 'company_asc'
          ? query.sortBy
          : 'name_asc',
    };
  }

  // Health & Storage status
  app.get('/api/health', (_req: Request, res: Response) => {
    const status = repo.getStorageStatus();
    res.json({ status: 'ok', storage: status });
  });

  app.get('/api/storage/status', (_req: Request, res: Response) => {
    res.json(repo.getStorageStatus());
  });

  app.post(
    '/api/storage/backup',
    requireRoles([UserRole.ADMIN, UserRole.EDITOR], 'Sauvegarde manuelle'),
    (req: Request, res: Response) => {
      const role = resolveActorRole(req);
      const status = repo.triggerManualBackup(role);
      res.json({
        message: 'Sauvegarde SQLite + miroir JSON synchronisée et vérifiée.',
        storage: status,
      });
    }
  );

  // Track recent search signature to avoid duplicate audit logs on background refreshes
  let lastLoggedSearchSignature = '';
  let lastLoggedSearchAt = 0;

  // List & Search contacts
  app.get('/api/contacts', (req: Request, res: Response) => {
    const role = resolveActorRole(req);
    const filters = extractFiltersFromQuery(req.query);
    const contacts = repo.queryContacts(filters);
    const duplicates = repo.getDuplicates();

    const trimmedQuery = filters.q?.trim();
    if (trimmedQuery && trimmedQuery.length >= 2) {
      const modeLabel =
        filters.searchMode === SearchMode.EXACT ? 'exacte' : 'partielle';
      const fieldLabel = filters.searchField || SearchField.ALL;
      const signature = `${role}:${trimmedQuery.toLowerCase()}:${filters.searchMode}:${fieldLabel}:${filters.category || 'all'}`;
      const now = Date.now();

      if (signature !== lastLoggedSearchSignature || now - lastLoggedSearchAt > 15_000) {
        lastLoggedSearchSignature = signature;
        lastLoggedSearchAt = now;
        repo.recordAudit(
          role,
          'SEARCH_CONTACTS',
          null,
          `Recherche ${modeLabel} « ${trimmedQuery} » (${contacts.length} résultat${contacts.length > 1 ? 's' : ''})`,
          {
            query: trimmedQuery,
            searchMode: filters.searchMode || SearchMode.PARTIAL,
            searchField: fieldLabel,
            category: filters.category || 'all',
            resultsCount: contacts.length,
          }
        );
      }
    }

    res.json({
      contacts,
      totalCount: contacts.length,
      duplicateGroupsCount: duplicates.length,
      appliedFilters: filters,
    });
  });

  // Get detected duplicate groups
  app.get('/api/contacts/duplicates', (_req: Request, res: Response) => {
    const duplicates = repo.getDuplicates();
    res.json({
      duplicates,
      count: duplicates.length,
    });
  });

  // Export contacts (CSV or JSON)
  app.get('/api/contacts/export', (req: Request, res: Response) => {
    const role = resolveActorRole(req);
    const format = req.query.format === 'json' ? 'json' : 'csv';
    const filters = extractFiltersFromQuery(req.query);
    const contacts = repo.queryContacts(filters);

    repo.recordAudit(
      role,
      'EXPORT_CONTACTS',
      null,
      `Export ${format.toUpperCase()} généré (${contacts.length} contacts).`,
      { format, count: contacts.length, filters }
    );

    const dateStamp = new Date().toISOString().slice(0, 10);
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="contacts-export-${dateStamp}.json"`
      );
      return res.send(
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            count: contacts.length,
            contacts,
          },
          null,
          2
        )
      );
    }

    const csvBody = serializeContactsToCsv(contacts);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="contacts-export-${dateStamp}.csv"`
    );
    // Include UTF-8 BOM so Excel opens accented characters properly
    return res.send(`\uFEFF${csvBody}`);
  });

  // Import contacts (CSV or JSON) with detailed invalid row reporting
  app.post(
    '/api/contacts/import',
    requireRoles([UserRole.ADMIN, UserRole.EDITOR], 'Import de contacts CSV/JSON'),
    (req: Request, res: Response) => {
      const role = resolveActorRole(req);
      const { format, content, dryRun, duplicateStrategy } = req.body || {};

      if (format !== 'csv' && format !== 'json') {
        return res.status(400).json({
          error: 'Le format d\'import doit être "csv" ou "json".',
        });
      }

      if (typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({
          error: 'Le contenu du fichier à importer est vide ou manquant.',
        });
      }

      const report = repo.importContacts({
        format,
        content,
        dryRun: Boolean(dryRun),
        duplicateStrategy:
          duplicateStrategy === 'update' || duplicateStrategy === 'create_anyway'
            ? duplicateStrategy
            : 'skip',
        actorRole: role,
      });

      return res.status(200).json(report);
    }
  );

  // Merge two duplicate contacts
  app.post(
    '/api/contacts/merge',
    requireRoles([UserRole.ADMIN, UserRole.EDITOR], 'Fusion de doublons'),
    (req: Request, res: Response) => {
      const role = resolveActorRole(req);
      const { primaryId, secondaryId, overrides } = req.body || {};

      if (typeof primaryId !== 'string' || typeof secondaryId !== 'string') {
        return res.status(400).json({
          error: 'Les identifiants primaryId et secondaryId sont requis pour la fusion.',
        });
      }

      const result = repo.mergeContacts(primaryId, secondaryId, overrides, role);
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      return res.json({
        contact: result.mergedContact,
        message: 'Contacts fusionnés avec succès.',
      });
    }
  );

  // Reset synthetic dataset
  app.post(
    '/api/contacts/seed-reset',
    requireRoles([UserRole.ADMIN], 'Réinitialisation des données de démonstration'),
    (req: Request, res: Response) => {
      const role = resolveActorRole(req);
      const contacts = repo.resetToSyntheticSeed(role);
      return res.json({
        contacts,
        count: contacts.length,
        message: 'Jeu de données synthétique réinitialisé avec succès.',
      });
    }
  );

  // Single contact by ID
  app.get('/api/contacts/:id', (req: Request, res: Response) => {
    const contact = repo.getContactById(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact introuvable.' });
    }
    return res.json({ contact });
  });

  // Create contact
  app.post(
    '/api/contacts',
    requireRoles([UserRole.ADMIN, UserRole.EDITOR], 'Création de contact'),
    (req: Request, res: Response) => {
      const role = resolveActorRole(req);
      const result = repo.createContact(req.body, role);
      if (result.errors) {
        return res.status(400).json({
          error: result.messages?.join(' ') || 'Données de contact invalides.',
          fieldErrors: result.errors,
          messages: result.messages,
        });
      }
      return res.status(201).json({
        contact: result.contact,
        duplicateWarnings: result.duplicateWarnings || [],
      });
    }
  );

  // Update contact
  app.put(
    '/api/contacts/:id',
    requireRoles([UserRole.ADMIN, UserRole.EDITOR], 'Modification de contact'),
    (req: Request, res: Response) => {
      const role = resolveActorRole(req);
      const result = repo.updateContact(req.params.id, req.body, role);
      if (result.notFound) {
        return res.status(404).json({ error: 'Contact introuvable.' });
      }
      if (result.errors) {
        return res.status(400).json({
          error: result.messages?.join(' ') || 'Données de modification invalides.',
          fieldErrors: result.errors,
          messages: result.messages,
        });
      }
      return res.json({ contact: result.contact });
    }
  );

  // Delete contact
  app.delete(
    '/api/contacts/:id',
    requireRoles([UserRole.ADMIN], 'Suppression de contact'),
    (req: Request, res: Response) => {
      const role = resolveActorRole(req);
      const deleted = repo.deleteContact(req.params.id, role);
      if (!deleted) {
        return res.status(404).json({ error: 'Contact introuvable.' });
      }
      return res.json({ deleted: true, id: req.params.id });
    }
  );

  // Audit logs
  app.get('/api/audit', (req: Request, res: Response) => {
    const limit = Math.min(250, Math.max(1, Number(req.query.limit) || 100));
    const logs = repo.getAuditLogs(limit);
    res.json({ logs, count: logs.length });
  });

  return app;
}
