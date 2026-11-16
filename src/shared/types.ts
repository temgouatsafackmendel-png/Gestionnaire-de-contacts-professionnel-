export enum ContactCategory {
  CLIENT = 'client',
  PARTENAIRE = 'partenaire',
  FOURNISSEUR = 'fournisseur',
  INTERNE = 'interne',
  PROSPECT = 'prospect',
  AUTRE = 'autre',
}

export enum UserRole {
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

export enum SearchMode {
  PARTIAL = 'partial',
  EXACT = 'exact',
}

export enum SearchField {
  ALL = 'all',
  NAME = 'name',
  EMAIL = 'email',
  PHONE = 'phone',
  COMPANY = 'company',
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneNormalized: string;
  company: string;
  jobTitle: string;
  category: ContactCategory;
  tags: string[];
  notes: string;
  city: string;
  country: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContactInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company?: string;
  jobTitle?: string;
  category?: ContactCategory;
  tags?: string[];
  notes?: string;
  city?: string;
  country?: string;
  favorite?: boolean;
}

export interface ContactQueryFilters {
  q?: string;
  searchMode?: SearchMode;
  searchField?: SearchField;
  category?: string;
  favorite?: boolean;
  tag?: string;
  company?: string;
  city?: string;
  sortBy?: 'name_asc' | 'name_desc' | 'recent' | 'company_asc';
}

export type DuplicateReasonType = 'email_exact' | 'phone_exact' | 'name_company_exact' | 'name_similar';

export interface DuplicateMatchReason {
  type: DuplicateReasonType;
  label: string;
  score: number;
}

export interface DuplicateGroup {
  id: string;
  primaryContact: Contact;
  duplicateContact: Contact;
  score: number;
  severity: 'high' | 'medium' | 'low';
  reasons: DuplicateMatchReason[];
}

export interface ImportRowError {
  line: number;
  rawIdentifier: string;
  fieldErrors: Record<string, string>;
  messages: string[];
  rawData: Record<string, unknown>;
}

export interface ImportDuplicateWarning {
  line: number;
  incomingContact: ContactInput;
  existingContact: Pick<Contact, 'id' | 'firstName' | 'lastName' | 'email' | 'phone' | 'company'>;
  reasons: string[];
  actionTaken: 'skipped' | 'updated' | 'imported' | 'pending_review';
}

export interface ImportResultReport {
  format: 'csv' | 'json';
  dryRun: boolean;
  duplicateStrategy: 'skip' | 'update' | 'create_anyway';
  totalRows: number;
  validRowsCount: number;
  importedCount: number;
  updatedCount: number;
  skippedDuplicatesCount: number;
  invalidRowsCount: number;
  errors: ImportRowError[];
  duplicateWarnings: ImportDuplicateWarning[];
  timestamp: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorRole: UserRole;
  action:
    | 'CREATE_CONTACT'
    | 'UPDATE_CONTACT'
    | 'DELETE_CONTACT'
    | 'MERGE_CONTACTS'
    | 'IMPORT_CONTACTS'
    | 'EXPORT_CONTACTS'
    | 'BACKUP_RESTORE'
    | 'SEED_RESET'
    | 'PERMISSION_DENIED';
  targetId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
}

export interface StorageStatus {
  engine: 'sqlite+json-mirror';
  dbPath: string;
  backupPath: string;
  totalContacts: number;
  totalAuditLogs: number;
  lastBackupAt: string | null;
  integrityOk: boolean;
}
