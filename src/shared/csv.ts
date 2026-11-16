import { Contact } from './types';

/**
 * Protects exported CSV cells against CSV Formula Injection (DDE / Excel injection)
 * when cells start with =, +, -, @, tab, or CR.
 */
export function sanitizeCsvCell(value: string): string {
  const str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export function escapeCsvField(value: unknown): string {
  const safe = sanitizeCsvCell(String(value ?? ''));
  if (safe.includes('"') || safe.includes(',') || safe.includes('\n') || safe.includes('\r')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

const CSV_HEADERS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'jobTitle',
  'category',
  'tags',
  'city',
  'country',
  'favorite',
  'notes',
] as const;

export function serializeContactsToCsv(contacts: Contact[]): string {
  const headerLine = CSV_HEADERS.join(',');
  const rows = contacts.map((contact) => {
    const values = [
      contact.firstName,
      contact.lastName,
      contact.email,
      contact.phone,
      contact.company,
      contact.jobTitle,
      contact.category,
      (contact.tags || []).join(';'),
      contact.city,
      contact.country,
      contact.favorite ? 'true' : 'false',
      contact.notes,
    ];
    return values.map(escapeCsvField).join(',');
  });
  return [headerLine, ...rows].join('\r\n');
}

/**
 * Parses a CSV string into an array of row records with 1-based line numbers.
 * Supports RFC 4180 quoted fields, escaped quotes, and auto-detects ',' or ';' delimiter.
 */
export function parseCsvToRecords(csvContent: string): {
  headers: string[];
  rows: Array<{ line: number; data: Record<string, string> }>;
  parseError?: string;
} {
  const stripped = csvContent.replace(/^\uFEFF/, '');
  if (!stripped.trim()) {
    return {
      headers: [],
      rows: [],
      parseError: 'Le contenu CSV est vide.',
    };
  }

  // Detect delimiter from first line (',' vs ';')
  const firstLineEnd = stripped.search(/\r?\n/);
  const firstLine = firstLineEnd === -1 ? stripped : stripped.slice(0, firstLineEnd);
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const delimiter = semiCount > commaCount ? ';' : ',';

  const parsedLines: Array<{ lineNumber: number; fields: string[] }> = [];
  let currentFields: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let currentLineNumber = 1;
  let rowStartLine = 1;

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    const next = stripped[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        if (ch === '\n') currentLineNumber++;
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        currentFields.push(currentField.trim());
        currentField = '';
      } else if (ch === '\r' && next === '\n') {
        currentFields.push(currentField.trim());
        currentField = '';
        if (currentFields.some((f) => f.length > 0)) {
          parsedLines.push({ lineNumber: rowStartLine, fields: currentFields });
        }
        currentFields = [];
        currentLineNumber++;
        rowStartLine = currentLineNumber;
        i++;
      } else if (ch === '\n' || ch === '\r') {
        currentFields.push(currentField.trim());
        currentField = '';
        if (currentFields.some((f) => f.length > 0)) {
          parsedLines.push({ lineNumber: rowStartLine, fields: currentFields });
        }
        currentFields = [];
        currentLineNumber++;
        rowStartLine = currentLineNumber;
      } else {
        currentField += ch;
      }
    }
  }

  if (inQuotes) {
    return {
      headers: [],
      rows: [],
      parseError: 'Guillemet ouvrant non refermé détecté dans le fichier CSV.',
    };
  }

  if (currentField.length > 0 || currentFields.length > 0) {
    currentFields.push(currentField.trim());
    if (currentFields.some((f) => f.length > 0)) {
      parsedLines.push({ lineNumber: rowStartLine, fields: currentFields });
    }
  }

  if (parsedLines.length === 0) {
    return {
      headers: [],
      rows: [],
      parseError: 'Aucune ligne valide trouvée dans le CSV.',
    };
  }

  const headerAliasMap: Record<string, string> = {
    firstname: 'firstName',
    first_name: 'firstName',
    prenom: 'firstName',
    prénom: 'firstName',
    lastname: 'lastName',
    last_name: 'lastName',
    nom: 'lastName',
    email: 'email',
    mail: 'email',
    courriel: 'email',
    phone: 'phone',
    telephone: 'phone',
    téléphone: 'phone',
    tel: 'phone',
    mobile: 'phone',
    company: 'company',
    entreprise: 'company',
    societe: 'company',
    société: 'company',
    organisation: 'company',
    jobtitle: 'jobTitle',
    job_title: 'jobTitle',
    poste: 'jobTitle',
    fonction: 'jobTitle',
    role: 'jobTitle',
    category: 'category',
    categorie: 'category',
    catégorie: 'category',
    tags: 'tags',
    etiquettes: 'tags',
    étiquettes: 'tags',
    city: 'city',
    ville: 'city',
    country: 'country',
    pays: 'country',
    favorite: 'favorite',
    favori: 'favorite',
    notes: 'notes',
    commentaire: 'notes',
    description: 'notes',
  };

  const rawHeaders = parsedLines[0].fields;
  const normalizedHeaders = rawHeaders.map((h) => {
    const key = h.toLowerCase().replace(/\s+/g, '_');
    return headerAliasMap[key] || h;
  });

  const requiredCols = ['firstName', 'lastName', 'email', 'phone'];
  const missingCols = requiredCols.filter((col) => !normalizedHeaders.includes(col));
  if (missingCols.length > 0) {
    return {
      headers: normalizedHeaders,
      rows: [],
      parseError: `En-têtes CSV obligatoires manquants : ${missingCols.join(', ')}. Colonnes détectées : ${rawHeaders.join(', ')}`,
    };
  }

  const rows: Array<{ line: number; data: Record<string, string> }> = [];
  for (let idx = 1; idx < parsedLines.length; idx++) {
    const lineObj = parsedLines[idx];
    const record: Record<string, string> = {};
    normalizedHeaders.forEach((headerName, colIdx) => {
      record[headerName] = lineObj.fields[colIdx] ?? '';
    });
    rows.push({ line: lineObj.lineNumber, data: record });
  }

  return { headers: normalizedHeaders, rows };
}
