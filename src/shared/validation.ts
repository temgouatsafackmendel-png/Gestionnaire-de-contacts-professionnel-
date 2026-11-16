import { z } from 'zod';
import { ContactCategory, ContactInput } from './types';

/**
 * Strips dangerous control characters and trims whitespace.
 */
export function sanitizeString(value: unknown, maxLength = 250): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Validates and normalizes an email address according to strict RFC 5322 subset rules.
 */
export function validateEmailAddress(rawEmail: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const cleaned = sanitizeString(rawEmail, 254).toLowerCase();
  if (!cleaned) {
    return { valid: false, normalized: '', error: "L'adresse email est obligatoire." };
  }
  if (cleaned.length > 254) {
    return { valid: false, normalized: cleaned, error: "L'adresse email dépasse 254 caractères." };
  }
  // Strict email pattern: local-part@domain.tld (no consecutive dots, valid TLD >= 2 letters)
  const emailRegex =
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

  if (!emailRegex.test(cleaned) || cleaned.includes('..')) {
    return {
      valid: false,
      normalized: cleaned,
      error: `Format d'email invalide ("${rawEmail}"). Attendu : exemple@domaine.fr`,
    };
  }

  const parts = cleaned.split('@');
  const domainParts = parts[1]?.split('.') ?? [];
  const tld = domainParts[domainParts.length - 1] ?? '';
  if (tld.length < 2 || /^\d+$/.test(tld)) {
    return {
      valid: false,
      normalized: cleaned,
      error: `Extension de domaine email invalide (".${tld}").`,
    };
  }

  return { valid: true, normalized: cleaned };
}

/**
 * Validates and normalizes French & international phone numbers.
 * Accepts formats like:
 * - 06 12 34 56 78 -> normalized +33612345678
 * - +33 6 12 34 56 78 -> normalized +33612345678
 * - +41 22 819 00 00 -> normalized +41228190000
 * - +1-555-234-5678 -> normalized +15552345678
 */
export function validateAndNormalizePhone(rawPhone: string): {
  valid: boolean;
  display: string;
  normalized: string;
  error?: string;
} {
  const cleaned = sanitizeString(rawPhone, 40);
  if (!cleaned) {
    return {
      valid: false,
      display: '',
      normalized: '',
      error: 'Le numéro de téléphone est obligatoire.',
    };
  }

  // Reject letters or unexpected special characters
  if (/[^0-9+\s().-]/.test(cleaned)) {
    return {
      valid: false,
      display: cleaned,
      normalized: '',
      error: `Le numéro "${rawPhone}" contient des caractères non autorisés (seuls chiffres, +, espaces, points, tirets et parenthèses sont permis).`,
    };
  }

  // Ensure '+' is only at the start (or not present)
  const plusCount = (cleaned.match(/\+/g) || []).length;
  if (plusCount > 1 || (plusCount === 1 && !cleaned.startsWith('+'))) {
    return {
      valid: false,
      display: cleaned,
      normalized: '',
      error: `Position du signe '+' invalide dans "${rawPhone}".`,
    };
  }

  // Handle French "+33 (0)6..." notation
  const withoutZeroParen = cleaned.replace(/^\+33\s*\(0\)\s*/, '+33 ');
  const digitsOnly = withoutZeroParen.replace(/\D/g, '');

  if (digitsOnly.length < 8 || digitsOnly.length > 15) {
    return {
      valid: false,
      display: cleaned,
      normalized: '',
      error: `Longueur de numéro invalide (${digitsOnly.length} chiffres dans "${rawPhone}"). Attendu : entre 8 et 15 chiffres.`,
    };
  }

  // Reject trivially fake repeating numbers like 0000000000
  if (/^(\d)\1{7,}$/.test(digitsOnly)) {
    return {
      valid: false,
      display: cleaned,
      normalized: '',
      error: `Numéro de téléphone invalide ("${rawPhone}").`,
    };
  }

  let normalized = `+${digitsOnly}`;
  // French national 10-digit number starting with 0 (e.g. 0612345678 -> +33612345678)
  if (!withoutZeroParen.startsWith('+') && digitsOnly.length === 10 && digitsOnly.startsWith('0')) {
    normalized = `+33${digitsOnly.slice(1)}`;
  } else if (withoutZeroParen.startsWith('+')) {
    normalized = `+${digitsOnly}`;
  } else if (digitsOnly.startsWith('00') && digitsOnly.length > 10) {
    normalized = `+${digitsOnly.slice(2)}`;
  }

  return {
    valid: true,
    display: cleaned,
    normalized,
  };
}

export const VALID_CATEGORIES = Object.values(ContactCategory);

export function normalizeCategory(raw: unknown): ContactCategory {
  if (typeof raw !== 'string') return ContactCategory.AUTRE;
  const lower = raw.trim().toLowerCase();
  if (VALID_CATEGORIES.includes(lower as ContactCategory)) {
    return lower as ContactCategory;
  }
  const aliasMap: Record<string, ContactCategory> = {
    customer: ContactCategory.CLIENT,
    clients: ContactCategory.CLIENT,
    partner: ContactCategory.PARTENAIRE,
    partenaires: ContactCategory.PARTENAIRE,
    vendor: ContactCategory.FOURNISSEUR,
    supplier: ContactCategory.FOURNISSEUR,
    fournisseurs: ContactCategory.FOURNISSEUR,
    internal: ContactCategory.INTERNE,
    equipe: ContactCategory.INTERNE,
    lead: ContactCategory.PROSPECT,
    prospects: ContactCategory.PROSPECT,
    other: ContactCategory.AUTRE,
  };
  return aliasMap[lower] ?? ContactCategory.AUTRE;
}

export const ContactZodSchema = z.object({
  firstName: z
    .string()
    .transform((v) => sanitizeString(v, 80))
    .refine((v) => v.length >= 1, { message: 'Le prénom est obligatoire.' })
    .refine((v) => v.length <= 80, { message: 'Le prénom ne peut pas dépasser 80 caractères.' }),
  lastName: z
    .string()
    .transform((v) => sanitizeString(v, 80))
    .refine((v) => v.length >= 1, { message: 'Le nom est obligatoire.' })
    .refine((v) => v.length <= 80, { message: 'Le nom ne peut pas dépasser 80 caractères.' }),
  email: z.string(),
  phone: z.string(),
  company: z
    .string()
    .optional()
    .default('')
    .transform((v) => sanitizeString(v, 120)),
  jobTitle: z
    .string()
    .optional()
    .default('')
    .transform((v) => sanitizeString(v, 120)),
  category: z
    .string()
    .optional()
    .default(ContactCategory.AUTRE)
    .transform((v) => normalizeCategory(v)),
  tags: z
    .array(z.string())
    .optional()
    .default([])
    .transform((arr) =>
      Array.from(
        new Set(
          arr
            .map((t) => sanitizeString(t, 40).toLowerCase())
            .filter((t) => t.length > 0)
        )
      ).slice(0, 15)
    ),
  notes: z
    .string()
    .optional()
    .default('')
    .transform((v) => sanitizeString(v, 2000)),
  city: z
    .string()
    .optional()
    .default('')
    .transform((v) => sanitizeString(v, 100)),
  country: z
    .string()
    .optional()
    .default('France')
    .transform((v) => sanitizeString(v, 100) || 'France'),
  favorite: z.boolean().optional().default(false),
});

export interface ValidatedContactPayload {
  valid: boolean;
  data?: ContactInput & {
    phoneNormalized: string;
    company: string;
    jobTitle: string;
    category: ContactCategory;
    tags: string[];
    notes: string;
    city: string;
    country: string;
    favorite: boolean;
  };
  fieldErrors: Record<string, string>;
  messages: string[];
}

export function validateContactInput(rawInput: unknown): ValidatedContactPayload {
  const fieldErrors: Record<string, string> = {};
  const messages: string[] = [];

  if (!rawInput || typeof rawInput !== 'object') {
    return {
      valid: false,
      fieldErrors: { root: 'Objet contact invalide.' },
      messages: ['Les données du contact sont absentes ou mal formées.'],
    };
  }

  const inputObj = rawInput as Record<string, unknown>;

  // Parse tags if provided as comma/semicolon-separated string
  let parsedTags: string[] = [];
  if (Array.isArray(inputObj.tags)) {
    parsedTags = inputObj.tags.map((t) => String(t));
  } else if (typeof inputObj.tags === 'string' && inputObj.tags.trim()) {
    parsedTags = inputObj.tags.split(/[;,|]/).map((t) => t.trim());
  }

  const parsedFavorite =
    typeof inputObj.favorite === 'boolean'
      ? inputObj.favorite
      : typeof inputObj.favorite === 'string'
        ? ['true', '1', 'oui', 'yes'].includes(inputObj.favorite.trim().toLowerCase())
        : false;

  const baseResult = ContactZodSchema.safeParse({
    firstName: typeof inputObj.firstName === 'string' ? inputObj.firstName : '',
    lastName: typeof inputObj.lastName === 'string' ? inputObj.lastName : '',
    email: typeof inputObj.email === 'string' ? inputObj.email : '',
    phone: typeof inputObj.phone === 'string' ? inputObj.phone : '',
    company: typeof inputObj.company === 'string' ? inputObj.company : '',
    jobTitle: typeof inputObj.jobTitle === 'string' ? inputObj.jobTitle : '',
    category: typeof inputObj.category === 'string' ? inputObj.category : ContactCategory.AUTRE,
    tags: parsedTags,
    notes: typeof inputObj.notes === 'string' ? inputObj.notes : '',
    city: typeof inputObj.city === 'string' ? inputObj.city : '',
    country: typeof inputObj.country === 'string' ? inputObj.country : 'France',
    favorite: parsedFavorite,
  });

  if (!baseResult.success) {
    for (const issue of baseResult.error.issues) {
      const key = String(issue.path[0] || 'root');
      fieldErrors[key] = issue.message;
      messages.push(issue.message);
    }
  }

  const emailCheck = validateEmailAddress(typeof inputObj.email === 'string' ? inputObj.email : '');
  if (!emailCheck.valid && emailCheck.error) {
    fieldErrors.email = emailCheck.error;
    messages.push(emailCheck.error);
  }

  const phoneCheck = validateAndNormalizePhone(
    typeof inputObj.phone === 'string' ? inputObj.phone : ''
  );
  if (!phoneCheck.valid && phoneCheck.error) {
    fieldErrors.phone = phoneCheck.error;
    messages.push(phoneCheck.error);
  }

  if (Object.keys(fieldErrors).length > 0 || !baseResult.success) {
    return {
      valid: false,
      fieldErrors,
      messages,
    };
  }

  const clean = baseResult.data;
  return {
    valid: true,
    data: {
      firstName: clean.firstName,
      lastName: clean.lastName,
      email: emailCheck.normalized,
      phone: phoneCheck.display,
      phoneNormalized: phoneCheck.normalized,
      company: clean.company,
      jobTitle: clean.jobTitle,
      category: clean.category,
      tags: clean.tags,
      notes: clean.notes,
      city: clean.city,
      country: clean.country,
      favorite: clean.favorite,
    },
    fieldErrors: {},
    messages: [],
  };
}
