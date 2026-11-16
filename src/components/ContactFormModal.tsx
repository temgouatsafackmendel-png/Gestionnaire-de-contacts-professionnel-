import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Sparkles, X } from 'lucide-react';
import { findDuplicatesForCandidate } from '../shared/duplicates';
import { Contact, ContactCategory, ContactInput } from '../shared/types';
import {
  validateAndNormalizePhone,
  validateContactInput,
  validateEmailAddress,
} from '../shared/validation';

interface ContactFormModalProps {
  isOpen: boolean;
  initialContact: Contact | null;
  existingContacts: Contact[];
  onClose: () => void;
  onSubmit: (payload: ContactInput, contactId?: string) => Promise<void>;
}

const CATEGORY_LABELS: Record<ContactCategory, string> = {
  [ContactCategory.CLIENT]: 'Client',
  [ContactCategory.PARTENAIRE]: 'Partenaire',
  [ContactCategory.FOURNISSEUR]: 'Fournisseur',
  [ContactCategory.PROSPECT]: 'Prospect',
  [ContactCategory.INTERNE]: 'Interne',
  [ContactCategory.AUTRE]: 'Autre',
};

export const ContactFormModal: React.FC<ContactFormModalProps> = ({
  isOpen,
  initialContact,
  existingContacts,
  onClose,
  onSubmit,
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [category, setCategory] = useState<ContactCategory>(ContactCategory.CLIENT);
  const [tagsInput, setTagsInput] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('France');
  const [favorite, setFavorite] = useState(false);
  const [notes, setNotes] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFieldErrors({});
    setGeneralError(null);
    if (initialContact) {
      setFirstName(initialContact.firstName);
      setLastName(initialContact.lastName);
      setEmail(initialContact.email);
      setPhone(initialContact.phone);
      setCompany(initialContact.company);
      setJobTitle(initialContact.jobTitle);
      setCategory(initialContact.category);
      setTagsInput((initialContact.tags || []).join(', '));
      setCity(initialContact.city);
      setCountry(initialContact.country || 'France');
      setFavorite(initialContact.favorite);
      setNotes(initialContact.notes);
    } else {
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      setCompany('');
      setJobTitle('');
      setCategory(ContactCategory.CLIENT);
      setTagsInput('');
      setCity('');
      setCountry('France');
      setFavorite(false);
      setNotes('');
    }
  }, [isOpen, initialContact]);

  // Live email & phone preview validation
  const emailLiveCheck = useMemo(() => {
    if (!email.trim()) return null;
    return validateEmailAddress(email);
  }, [email]);

  const phoneLiveCheck = useMemo(() => {
    if (!phone.trim()) return null;
    return validateAndNormalizePhone(phone);
  }, [phone]);

  // Live duplicate detection while typing
  const potentialDuplicates = useMemo(() => {
    if (!firstName.trim() && !lastName.trim() && !email.trim() && !phone.trim()) {
      return [];
    }
    return findDuplicatesForCandidate(
      {
        firstName,
        lastName,
        email,
        phone,
        company,
      },
      existingContacts,
      initialContact?.id
    );
  }, [firstName, lastName, email, phone, company, existingContacts, initialContact]);

  if (!isOpen) return null;

  const applyQuickPreset = (preset: 'vip' | 'partner') => {
    setFieldErrors({});
    setGeneralError(null);
    if (preset === 'vip') {
      setFirstName('Margaux');
      setLastName('Delcourt');
      setEmail('m.delcourt@lumina-aerospace.fr');
      setPhone('+33 6 42 88 19 03');
      setCompany('Lumina Aerospace');
      setJobTitle('VP Ingénierie Systèmes');
      setCategory(ContactCategory.CLIENT);
      setTagsInput('vip, aeronautique, contrat-pluriannuel');
      setCity('Toulouse');
      setCountry('France');
      setFavorite(true);
      setNotes('Décideuse principale pour le programme avionique 2027.');
    } else {
      setFirstName('Henrik');
      setLastName('Lindqvist');
      setEmail('henrik.lindqvist@nordic-grid.se');
      setPhone('+46 8 501 234 90');
      setCompany('Nordic Grid AB');
      setJobTitle('Directeur Alliances Stratégiques');
      setCategory(ContactCategory.PARTENAIRE);
      setTagsInput('scandinavie, energie, partenaire-cle');
      setCity('Stockholm');
      setCountry('Suède');
      setFavorite(false);
      setNotes('Partenaire de distribution exclusif pour l’Europe du Nord.');
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setFieldErrors({});

    const parsedTags = tagsInput
      .split(/[;,]/)
      .map((t) => t.trim())
      .filter(Boolean);

    const candidate: ContactInput = {
      firstName,
      lastName,
      email,
      phone,
      company,
      jobTitle,
      category,
      tags: parsedTags,
      city,
      country,
      favorite,
      notes,
    };

    const clientValidation = validateContactInput(candidate);
    if (!clientValidation.valid) {
      setFieldErrors(clientValidation.fieldErrors);
      setGeneralError('Veuillez corriger les champs signalés avant de sauvegarder.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(candidate, initialContact?.id);
      onClose();
    } catch (err) {
      const errorObj = err as Error & { fieldErrors?: Record<string, string> };
      if (errorObj.fieldErrors) {
        setFieldErrors(errorObj.fieldErrors);
      }
      setGeneralError(errorObj.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h2 id="contact-modal-title" className="text-lg font-semibold tracking-tight">
              {initialContact ? 'Modifier la fiche contact' : 'Nouvelle fiche contact'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Validation stricte RFC 5322 (email) et normalisation internationale E.164 (téléphone)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quick Fill Bar when creating a new contact */}
        {!initialContact && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-6 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-950/50">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Remplissage rapide de démonstration :</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => applyQuickPreset('vip')}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Profil Client VIP (France)
              </button>
              <button
                type="button"
                onClick={() => applyQuickPreset('partner')}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Profil Partenaire International (Suède)
              </button>
            </div>
          </div>
        )}

        {/* Form Body */}
        <form
          onSubmit={handleFormSubmit}
          className="flex-1 space-y-5 overflow-y-auto px-6 py-5"
          noValidate
        >
          {generalError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50/80 p-3.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <span>{generalError}</span>
            </div>
          )}

          {/* Real-time duplicate warning */}
          {potentialDuplicates.length > 0 && (
            <div
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  Doublon potentiel détecté en temps réel ({potentialDuplicates.length}{' '}
                  {potentialDuplicates.length > 1 ? 'fiches proches' : 'fiche proche'})
                </span>
              </div>
              <ul className="mt-1.5 space-y-1 pl-6 text-amber-800 dark:text-amber-300">
                {potentialDuplicates.slice(0, 3).map((match) => (
                  <li key={match.contact.id} className="list-disc">
                    <span className="font-medium">
                      {match.contact.firstName} {match.contact.lastName}
                    </span>{' '}
                    ({match.contact.email}) — {match.reasons.map((r) => r.label).join(' · ')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Identity Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="field-firstName"
                className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Prénom <span className="text-red-600">*</span>
              </label>
              <input
                id="field-firstName"
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="ex. Camille"
                className={`w-full rounded-lg border px-3.5 py-2 text-sm transition-colors focus:outline-none ${
                  fieldErrors.firstName
                    ? 'border-red-500 bg-red-50/30 dark:border-red-500 dark:bg-red-950/20'
                    : 'border-slate-300 bg-white focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-400'
                }`}
              />
              {fieldErrors.firstName && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {fieldErrors.firstName}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="field-lastName"
                className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Nom <span className="text-red-600">*</span>
              </label>
              <input
                id="field-lastName"
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="ex. Moreau"
                className={`w-full rounded-lg border px-3.5 py-2 text-sm transition-colors focus:outline-none ${
                  fieldErrors.lastName
                    ? 'border-red-500 bg-red-50/30 dark:border-red-500 dark:bg-red-950/20'
                    : 'border-slate-300 bg-white focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-400'
                }`}
              />
              {fieldErrors.lastName && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.lastName}</p>
              )}
            </div>
          </div>

          {/* Email & Phone Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="field-email"
                className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Adresse email <span className="text-red-600">*</span>
              </label>
              <input
                id="field-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="camille.moreau@entreprise.fr"
                className={`w-full rounded-lg border px-3.5 py-2 font-mono text-sm transition-colors focus:outline-none ${
                  fieldErrors.email || (emailLiveCheck && !emailLiveCheck.valid)
                    ? 'border-red-500 bg-red-50/30 dark:border-red-500 dark:bg-red-950/20'
                    : 'border-slate-300 bg-white focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-400'
                }`}
              />
              {fieldErrors.email ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.email}</p>
              ) : emailLiveCheck && !emailLiveCheck.valid ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{emailLiveCheck.error}</p>
              ) : emailLiveCheck && emailLiveCheck.valid ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Format RFC 5322 valide ({emailLiveCheck.normalized})</span>
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="field-phone"
                className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Téléphone <span className="text-red-600">*</span>
              </label>
              <input
                id="field-phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+33 6 12 34 56 78 ou 06 12 34 56 78"
                className={`w-full rounded-lg border px-3.5 py-2 font-mono text-sm transition-colors focus:outline-none ${
                  fieldErrors.phone || (phoneLiveCheck && !phoneLiveCheck.valid)
                    ? 'border-red-500 bg-red-50/30 dark:border-red-500 dark:bg-red-950/20'
                    : 'border-slate-300 bg-white focus:border-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-400'
                }`}
              />
              {fieldErrors.phone ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.phone}</p>
              ) : phoneLiveCheck && !phoneLiveCheck.valid ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{phoneLiveCheck.error}</p>
              ) : phoneLiveCheck && phoneLiveCheck.valid ? (
                <p className="mt-1 flex items-center gap-1 font-mono text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Normalisé E.164 : {phoneLiveCheck.normalized}</span>
                </p>
              ) : null}
            </div>
          </div>

          {/* Organization & Role Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="field-company"
                className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Entreprise / Organisation
              </label>
              <input
                id="field-company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="ex. Atelier Veridian SAS"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-400"
              />
            </div>

            <div>
              <label
                htmlFor="field-jobTitle"
                className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Poste / Fonction
              </label>
              <input
                id="field-jobTitle"
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="ex. Directrice Produit"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-400"
              />
            </div>
          </div>

          {/* Category, City, Country */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label
                htmlFor="field-category"
                className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Catégorie
              </label>
              <select
                id="field-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ContactCategory)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-400"
              >
                {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="field-city"
                className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Ville
              </label>
              <input
                id="field-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="ex. Paris"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-400"
              />
            </div>

            <div>
              <label
                htmlFor="field-country"
                className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Pays
              </label>
              <input
                id="field-country"
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="ex. France"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-400"
              />
            </div>
          </div>

          {/* Tags & Favorite */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label
                htmlFor="field-tags"
                className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Étiquettes (séparées par des virgules)
              </label>
              <input
                id="field-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="vip, contrat-2026, paris"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-400"
              />
            </div>

            <div className="flex items-end pb-1">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-700 select-none dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={favorite}
                  onChange={(e) => setFavorite(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <span>Marquer comme favori</span>
              </label>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="field-notes"
              className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Notes &amp; Contexte métier
            </label>
            <textarea
              id="field-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Informations complémentaires, historique d'échange..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-400"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium whitespace-nowrap text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Annuler (Échap)
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium whitespace-nowrap text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {isSubmitting
                ? 'Enregistrement...'
                : initialContact
                  ? 'Enregistrer les modifications'
                  : 'Créer le contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
