import { Contact, ContactInput, DuplicateGroup, DuplicateMatchReason } from './types';
import { validateAndNormalizePhone } from './validation';

/**
 * Normalizes text for accent-insensitive and case-insensitive comparisons.
 */
export function normalizeTextForComparison(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes Levenshtein edit distance between two normalized strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Compares two contacts and returns match reasons if they are potential duplicates.
 */
export function evaluatePairDuplicateReasons(
  a: Pick<Contact, 'firstName' | 'lastName' | 'email' | 'phone' | 'phoneNormalized' | 'company'>,
  b: Pick<Contact, 'firstName' | 'lastName' | 'email' | 'phone' | 'phoneNormalized' | 'company'>
): DuplicateMatchReason[] {
  const reasons: DuplicateMatchReason[] = [];

  const emailA = (a.email || '').trim().toLowerCase();
  const emailB = (b.email || '').trim().toLowerCase();
  if (emailA && emailB && emailA === emailB) {
    reasons.push({
      type: 'email_exact',
      label: `Email identique (${emailA})`,
      score: 100,
    });
  }

  const phoneA = a.phoneNormalized || validateAndNormalizePhone(a.phone || '').normalized;
  const phoneB = b.phoneNormalized || validateAndNormalizePhone(b.phone || '').normalized;
  if (phoneA && phoneB && phoneA === phoneB) {
    reasons.push({
      type: 'phone_exact',
      label: `Téléphone normalisé identique (${phoneA})`,
      score: 95,
    });
  }

  const firstA = normalizeTextForComparison(a.firstName);
  const lastA = normalizeTextForComparison(a.lastName);
  const firstB = normalizeTextForComparison(b.firstName);
  const lastB = normalizeTextForComparison(b.lastName);
  const fullA = `${firstA} ${lastA}`.trim();
  const fullB = `${firstB} ${lastB}`.trim();
  const swappedB = `${lastB} ${firstB}`.trim();

  if (fullA && fullB && fullA === fullB) {
    const compA = normalizeTextForComparison(a.company);
    const compB = normalizeTextForComparison(b.company);
    const sameCompany = compA && compB && compA === compB;
    reasons.push({
      type: 'name_company_exact',
      label: sameCompany
        ? `Homonyme exact dans la même entreprise (${a.firstName} ${a.lastName} · ${a.company})`
        : `Homonyme Prénom + Nom exact (${a.firstName} ${a.lastName})`,
      score: sameCompany ? 90 : 82,
    });
  } else if (fullA && swappedB && fullA === swappedB && firstA !== lastA) {
    reasons.push({
      type: 'name_similar',
      label: `Inversion Prénom / Nom détectée (${a.firstName} ${a.lastName} ↔ ${b.firstName} ${b.lastName})`,
      score: 78,
    });
  } else if (fullA.length >= 6 && fullB.length >= 6) {
    const dist = levenshteinDistance(fullA, fullB);
    if (dist === 1) {
      reasons.push({
        type: 'name_similar',
        label: `Nom très proche à 1 caractère près (${a.firstName} ${a.lastName} / ${b.firstName} ${b.lastName})`,
        score: 75,
      });
    }
  }

  return reasons;
}

/**
 * Scans a list of contacts and returns all detected duplicate pairs sorted by severity/score.
 */
export function detectAllDuplicates(contacts: Contact[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];

  for (let i = 0; i < contacts.length; i++) {
    for (let j = i + 1; j < contacts.length; j++) {
      const a = contacts[i];
      const b = contacts[j];
      const reasons = evaluatePairDuplicateReasons(a, b);
      if (reasons.length > 0) {
        const maxScore = Math.max(...reasons.map((r) => r.score));
        const combinedScore = Math.min(100, maxScore + (reasons.length > 1 ? 5 : 0));
        const severity: 'high' | 'medium' | 'low' =
          combinedScore >= 95 ? 'high' : combinedScore >= 80 ? 'medium' : 'low';

        groups.push({
          id: `${a.id}__${b.id}`,
          primaryContact: a,
          duplicateContact: b,
          score: combinedScore,
          severity,
          reasons,
        });
      }
    }
  }

  return groups.sort((x, y) => y.score - x.score);
}

/**
 * Checks if a candidate contact input matches any existing contact in the database.
 */
export function findDuplicatesForCandidate(
  candidate: ContactInput & { phoneNormalized?: string },
  existingContacts: Contact[],
  excludeId?: string
): Array<{ contact: Contact; reasons: DuplicateMatchReason[] }> {
  const phoneNorm =
    candidate.phoneNormalized || validateAndNormalizePhone(candidate.phone || '').normalized;

  const matches: Array<{ contact: Contact; reasons: DuplicateMatchReason[] }> = [];

  for (const existing of existingContacts) {
    if (excludeId && existing.id === excludeId) continue;
    const reasons = evaluatePairDuplicateReasons(
      {
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        phone: candidate.phone,
        phoneNormalized: phoneNorm,
        company: candidate.company || '',
      },
      existing
    );
    if (reasons.length > 0) {
      matches.push({ contact: existing, reasons });
    }
  }

  return matches;
}

/**
 * Merges two contacts into a unified contact payload, combining tags and notes cleanly.
 */
export function buildMergedContactPayload(
  primary: Contact,
  secondary: Contact,
  overrides?: Partial<ContactInput>
): ContactInput {
  const mergedTags = Array.from(new Set([...(primary.tags || []), ...(secondary.tags || [])]));
  const combinedNotes =
    primary.notes && secondary.notes && primary.notes !== secondary.notes
      ? `${primary.notes}\n---\n[Fusionné depuis ${secondary.firstName} ${secondary.lastName}] : ${secondary.notes}`
      : primary.notes || secondary.notes || '';

  return {
    firstName: overrides?.firstName ?? (primary.firstName || secondary.firstName),
    lastName: overrides?.lastName ?? (primary.lastName || secondary.lastName),
    email: overrides?.email ?? (primary.email || secondary.email),
    phone: overrides?.phone ?? (primary.phone || secondary.phone),
    company: overrides?.company ?? (primary.company || secondary.company),
    jobTitle: overrides?.jobTitle ?? (primary.jobTitle || secondary.jobTitle),
    category: overrides?.category ?? (primary.category || secondary.category),
    city: overrides?.city ?? (primary.city || secondary.city),
    country: overrides?.country ?? (primary.country || secondary.country),
    favorite: overrides?.favorite ?? (primary.favorite || secondary.favorite),
    tags: overrides?.tags ?? mergedTags,
    notes: overrides?.notes ?? combinedNotes,
  };
}
