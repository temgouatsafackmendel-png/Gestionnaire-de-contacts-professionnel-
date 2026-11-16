import {
  AuditLogEntry,
  Contact,
  ContactInput,
  ContactQueryFilters,
  DuplicateGroup,
  ImportResultReport,
  StorageStatus,
  UserRole,
} from '../shared/types';

function buildHeaders(role: UserRole): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-user-role': role,
  };
}

export function buildQueryString(filters: ContactQueryFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.searchMode) params.set('searchMode', filters.searchMode);
  if (filters.searchField) params.set('searchField', filters.searchField);
  if (filters.category && filters.category !== 'all') params.set('category', filters.category);
  if (filters.favorite) params.set('favorite', 'true');
  if (filters.tag && filters.tag !== 'all') params.set('tag', filters.tag);
  if (filters.company) params.set('company', filters.company);
  if (filters.city) params.set('city', filters.city);
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  const str = params.toString();
  return str ? `?${str}` : '';
}

export function triggerBrowserDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function generateVCard(contact: Contact): string {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${contact.lastName};${contact.firstName};;;`,
    `FN:${contact.firstName} ${contact.lastName}`,
    `EMAIL;TYPE=INTERNET,WORK:${contact.email}`,
    `TEL;TYPE=CELL,VOICE:${contact.phoneNormalized || contact.phone}`,
  ];
  if (contact.company) lines.push(`ORG:${contact.company}`);
  if (contact.jobTitle) lines.push(`TITLE:${contact.jobTitle}`);
  if (contact.city || contact.country) {
    lines.push(`ADR;TYPE=WORK:;;${contact.city || ''};;;${contact.country || ''}`);
  }
  if (contact.notes) {
    lines.push(`NOTE:${contact.notes.replace(/\r?\n/g, '\\n')}`);
  }
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export const apiClient = {
  async listContacts(
    filters: ContactQueryFilters,
    role: UserRole
  ): Promise<{
    contacts: Contact[];
    totalCount: number;
    duplicateGroupsCount: number;
  }> {
    const res = await fetch(`/api/contacts${buildQueryString(filters)}`, {
      headers: buildHeaders(role),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erreur lors du chargement des contacts.');
    }
    return res.json();
  },

  async createContact(
    payload: ContactInput,
    role: UserRole
  ): Promise<{
    contact: Contact;
    duplicateWarnings: Array<{ id: string; name: string; reasons: string[] }>;
  }> {
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: buildHeaders(role),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      const error = new Error(data.error || 'Erreur de validation.') as Error & {
        fieldErrors?: Record<string, string>;
      };
      error.fieldErrors = data.fieldErrors;
      throw error;
    }
    return data;
  },

  async updateContact(
    id: string,
    payload: Partial<ContactInput>,
    role: UserRole
  ): Promise<{ contact: Contact }> {
    const res = await fetch(`/api/contacts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: buildHeaders(role),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      const error = new Error(data.error || 'Erreur lors de la mise à jour.') as Error & {
        fieldErrors?: Record<string, string>;
      };
      error.fieldErrors = data.fieldErrors;
      throw error;
    }
    return data;
  },

  async deleteContact(id: string, role: UserRole): Promise<void> {
    const res = await fetch(`/api/contacts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: buildHeaders(role),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Suppression refusée.');
    }
  },

  async getDuplicates(role: UserRole): Promise<{ duplicates: DuplicateGroup[]; count: number }> {
    const res = await fetch('/api/contacts/duplicates', {
      headers: buildHeaders(role),
    });
    if (!res.ok) {
      throw new Error('Impossible de récupérer la liste des doublons.');
    }
    return res.json();
  },

  async mergeContacts(
    primaryId: string,
    secondaryId: string,
    overrides: Partial<ContactInput>,
    role: UserRole
  ): Promise<{ contact: Contact; message: string }> {
    const res = await fetch('/api/contacts/merge', {
      method: 'POST',
      headers: buildHeaders(role),
      body: JSON.stringify({ primaryId, secondaryId, overrides }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Échec de la fusion des contacts.');
    }
    return data;
  },

  async importContacts(
    params: {
      format: 'csv' | 'json';
      content: string;
      dryRun: boolean;
      duplicateStrategy: 'skip' | 'update' | 'create_anyway';
    },
    role: UserRole
  ): Promise<ImportResultReport> {
    const res = await fetch('/api/contacts/import', {
      method: 'POST',
      headers: buildHeaders(role),
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Erreur lors de l'import.");
    }
    return data;
  },

  async fetchExportData(
    format: 'csv' | 'json',
    filters: ContactQueryFilters,
    role: UserRole
  ): Promise<{ content: string; filename: string }> {
    const qs = buildQueryString(filters);
    const sep = qs ? '&' : '?';
    const url = `/api/contacts/export${qs}${sep}format=${format}`;
    const res = await fetch(url, {
      headers: { 'x-user-role': role },
    });
    if (!res.ok) {
      throw new Error("Échec de la génération de l'export.");
    }
    const content = await res.text();
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `veridian-contacts-${dateStamp}.${format}`;
    return { content, filename };
  },

  async downloadExport(
    format: 'csv' | 'json',
    filters: ContactQueryFilters,
    role: UserRole
  ): Promise<{ content: string; filename: string }> {
    const { content, filename } = await this.fetchExportData(format, filters, role);
    const mimeType =
      format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8';
    triggerBrowserDownload(content, filename, mimeType);
    return { content, filename };
  },

  async getAuditLogs(role: UserRole): Promise<{ logs: AuditLogEntry[]; count: number }> {
    const res = await fetch('/api/audit?limit=150', {
      headers: buildHeaders(role),
    });
    if (!res.ok) {
      throw new Error("Impossible de charger le journal d'audit.");
    }
    return res.json();
  },

  async getStorageStatus(role: UserRole): Promise<StorageStatus> {
    const res = await fetch('/api/storage/status', {
      headers: buildHeaders(role),
    });
    if (!res.ok) {
      throw new Error("Impossible de vérifier l'état du stockage.");
    }
    return res.json();
  },

  async triggerBackup(role: UserRole): Promise<{ message: string; storage: StorageStatus }> {
    const res = await fetch('/api/storage/backup', {
      method: 'POST',
      headers: buildHeaders(role),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Échec de la sauvegarde manuelle.');
    }
    return data;
  },

  async resetDemoData(role: UserRole): Promise<{ message: string; count: number }> {
    const res = await fetch('/api/contacts/seed-reset', {
      method: 'POST',
      headers: buildHeaders(role),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Réinitialisation refusée.');
    }
    return data;
  },
};
