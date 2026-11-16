import React, { useState } from 'react';
import { Check, CheckCircle2, GitMerge, PlusCircle, Sparkles, Trash2 } from 'lucide-react';
import { ContactInput, DuplicateGroup } from '../shared/types';

interface DuplicatesViewProps {
  duplicates: DuplicateGroup[];
  onMerge: (
    primaryId: string,
    secondaryId: string,
    overrides: Partial<ContactInput>
  ) => Promise<void>;
  onDeleteContact: (id: string) => Promise<void>;
  onCreateTestDuplicate: () => Promise<void>;
}

export const DuplicatesView: React.FC<DuplicatesViewProps> = ({
  duplicates,
  onMerge,
  onDeleteContact,
  onCreateTestDuplicate,
}) => {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    duplicates[0]?.id ?? null
  );
  const [fieldChoices, setFieldChoices] = useState<Record<string, 'primary' | 'secondary'>>({});
  const [isMerging, setIsMerging] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeGroup =
    duplicates.find((g) => g.id === selectedGroupId) || duplicates[0] || null;

  const chooseSide = (field: string, side: 'primary' | 'secondary') => {
    setFieldChoices((prev) => ({ ...prev, [field]: side }));
  };

  const getChoice = (field: string): 'primary' | 'secondary' => {
    return fieldChoices[field] || 'primary';
  };

  const buildOverridesForGroup = (group: DuplicateGroup): Partial<ContactInput> => {
    const p = group.primaryContact;
    const s = group.duplicateContact;
    return {
      firstName: getChoice('firstName') === 'secondary' ? s.firstName : p.firstName,
      lastName: getChoice('lastName') === 'secondary' ? s.lastName : p.lastName,
      email: getChoice('email') === 'secondary' ? s.email : p.email,
      phone: getChoice('phone') === 'secondary' ? s.phone : p.phone,
      company: getChoice('company') === 'secondary' ? s.company : p.company,
      jobTitle: getChoice('jobTitle') === 'secondary' ? s.jobTitle : p.jobTitle,
      city: getChoice('city') === 'secondary' ? s.city : p.city,
      category: getChoice('category') === 'secondary' ? s.category : p.category,
    };
  };

  const handleExecuteMerge = async () => {
    if (!activeGroup) return;
    setErrorMsg(null);
    setFeedback(null);
    setIsMerging(true);

    const p = activeGroup.primaryContact;
    const s = activeGroup.duplicateContact;
    const overrides = buildOverridesForGroup(activeGroup);

    try {
      await onMerge(p.id, s.id, overrides);
      setFeedback(
        `Fusion réussie : la fiche de ${overrides.firstName} ${overrides.lastName} a absorbé le doublon en conservant l'ensemble des étiquettes et notes.`
      );
      setFieldChoices({});
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors de la fusion.');
    } finally {
      setIsMerging(false);
    }
  };

  const handleAutoMergeAll = async () => {
    if (duplicates.length === 0) return;
    setErrorMsg(null);
    setFeedback(null);
    setIsMerging(true);
    let mergedCount = 0;
    try {
      for (const group of duplicates) {
        await onMerge(group.primaryContact.id, group.duplicateContact.id, {});
        mergedCount++;
      }
      setFeedback(`${mergedCount} paire(s) de doublons fusionnée(s) automatiquement avec succès.`);
      setFieldChoices({});
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erreur lors de la fusion par lot.');
    } finally {
      setIsMerging(false);
    }
  };

  if (duplicates.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
        {feedback && (
          <div
            role="status"
            className="mx-auto mb-6 max-w-xl rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
          >
            {feedback}
          </div>
        )}
        <div className="mx-auto mb-4 flex h-24 w-32 items-center justify-center">
          <svg
            viewBox="0 0 140 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-full w-full"
            aria-hidden="true"
          >
            <rect
              x="22"
              y="18"
              width="76"
              height="56"
              rx="8"
              className="fill-slate-50 stroke-slate-300 dark:fill-slate-800/60 dark:stroke-slate-700"
              strokeWidth="1.5"
            />
            <rect
              x="34"
              y="30"
              width="42"
              height="5"
              rx="2.5"
              className="fill-slate-700 dark:fill-slate-300"
            />
            <rect
              x="34"
              y="41"
              width="52"
              height="4"
              rx="2"
              className="fill-slate-300 dark:fill-slate-600"
            />
            <rect
              x="34"
              y="51"
              width="34"
              height="4"
              rx="2"
              className="fill-slate-200 dark:fill-slate-700"
            />
            <circle
              cx="98"
              cy="60"
              r="18"
              className="fill-emerald-50 stroke-emerald-600 dark:fill-emerald-950 dark:stroke-emerald-400"
              strokeWidth="2"
            />
            <path
              d="M91 60.5L96 65.5L106 55.5"
              className="stroke-emerald-600 dark:stroke-emerald-400"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Aucun doublon détecté — Votre répertoire est 100 % intègre
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600 dark:text-slate-400">
          L&apos;analyseur vérifie en continu les correspondances exactes d&apos;email, les numéros E.164
          normalisés, les homonymes Prénom + Nom et les inversions de saisie.
        </p>
        <div className="mt-6 flex items-center justify-center">
          <button
            type="button"
            onClick={onCreateTestDuplicate}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Injecter un doublon de test pour démontrer l&apos;assistant de fusion</span>
          </button>
        </div>
      </div>
    );
  }

  const previewOverrides = activeGroup ? buildOverridesForGroup(activeGroup) : null;
  const combinedTags = activeGroup
    ? Array.from(
        new Set([
          ...activeGroup.primaryContact.tags,
          ...activeGroup.duplicateContact.tags,
        ])
      )
    : [];

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          {feedback}
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50/80 px-4 py-3 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {errorMsg}
        </div>
      )}

      {/* Top Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Centre de Déduplication &amp; Fusion Transactionnelle ({duplicates.length}{' '}
            {duplicates.length > 1 ? 'paires détectées' : 'paire détectée'})
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Détection multi-critères : Email exact · Téléphone normalisé E.164 · Homonymie · Distance de Levenshtein
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onCreateTestDuplicate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium whitespace-nowrap text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>Ajouter un cas de doublon test</span>
          </button>
          {duplicates.length > 1 && (
            <button
              type="button"
              disabled={isMerging}
              onClick={handleAutoMergeAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3.5 py-2 text-xs font-medium whitespace-nowrap text-emerald-900 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-200"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Tout fusionner automatiquement ({duplicates.length})</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left List of Duplicate Pairs */}
        <div className="rounded-xl border border-slate-200 bg-white lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Paires à examiner
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Cliquez sur une paire pour personnaliser la fusion champ par champ
            </p>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {duplicates.map((group) => {
              const isSelected = activeGroup?.id === group.id;
              const severityLabel =
                group.severity === 'high'
                  ? 'Confiance Haute'
                  : group.severity === 'medium'
                    ? 'Homonyme Probable'
                    : 'Proximité';

              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    setSelectedGroupId(group.id);
                    setFieldChoices({});
                  }}
                  className={`w-full px-5 py-4 text-left transition-colors ${
                    isSelected
                      ? 'bg-slate-100/90 dark:bg-slate-800/70'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {group.primaryContact.firstName} {group.primaryContact.lastName}
                    </span>
                    <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      {severityLabel} · {group.score}%
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-600 dark:text-slate-400">
                    <span>{group.primaryContact.email}</span>
                    <span className="mx-1.5" aria-hidden="true">
                      ↔
                    </span>
                    <span>{group.duplicateContact.email}</span>
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    {group.reasons.map((r) => r.label).join(' · ')}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side-by-Side Merge Comparator */}
        {activeGroup && previewOverrides && (
          <div className="rounded-xl border border-slate-200 bg-white lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Comparateur &amp; Sélection des champs à conserver
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Cliquez sur la cellule de gauche (Fiche A) ou de droite (Fiche B) pour choisir la
                  valeur gagnante.
                </p>
              </div>
              <button
                type="button"
                disabled={isMerging}
                onClick={handleExecuteMerge}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium whitespace-nowrap text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                <GitMerge className="h-4 w-4" />
                <span>{isMerging ? 'Fusion en cours...' : 'Valider et Fusionner ces 2 fiches'}</span>
              </button>
            </div>

            <div className="px-6 py-4">
              <div className="mb-4 text-xs text-slate-600 dark:text-slate-400">
                <span className="font-semibold text-slate-900 dark:text-slate-200">
                  Raisons d&apos;alerte :
                </span>{' '}
                {activeGroup.reasons.map((r) => r.label).join(' · ')}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <th className="py-2.5 pr-4 font-medium">Attribut</th>
                      <th className="px-3 py-2.5 font-medium">
                        Fiche A (Conservée)
                      </th>
                      <th className="px-3 py-2.5 font-medium">
                        Fiche B (Absorbée)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {(
                      [
                        { key: 'firstName', label: 'Prénom', mono: false },
                        { key: 'lastName', label: 'Nom', mono: false },
                        { key: 'email', label: 'Email', mono: true },
                        { key: 'phone', label: 'Téléphone', mono: true },
                        { key: 'company', label: 'Entreprise', mono: false },
                        { key: 'jobTitle', label: 'Poste', mono: false },
                        { key: 'city', label: 'Ville', mono: false },
                      ] as const
                    ).map((row) => {
                      const valA = activeGroup.primaryContact[row.key] || '—';
                      const valB = activeGroup.duplicateContact[row.key] || '—';
                      const selectedSide = getChoice(row.key);

                      return (
                        <tr key={row.key}>
                          <td className="py-3 pr-4 font-medium text-slate-700 dark:text-slate-300">
                            {row.label}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => chooseSide(row.key, 'primary')}
                              className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                                row.mono ? 'font-mono' : ''
                              } ${
                                selectedSide === 'primary'
                                  ? 'border-slate-900 bg-slate-900/5 font-medium text-slate-900 dark:border-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-200'
                                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:text-slate-400'
                              }`}
                            >
                              <span className="truncate">{valA}</span>
                              {selectedSide === 'primary' && (
                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                              )}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => chooseSide(row.key, 'secondary')}
                              className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                                row.mono ? 'font-mono' : ''
                              } ${
                                selectedSide === 'secondary'
                                  ? 'border-slate-900 bg-slate-900/5 font-medium text-slate-900 dark:border-emerald-500 dark:bg-emerald-950/30 dark:text-emerald-200'
                                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:text-slate-400'
                              }`}
                            >
                              <span className="truncate">{valB}</span>
                              {selectedSide === 'secondary' && (
                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Live Merged Contact Preview */}
              <div className="mt-5 border-t border-slate-200 pt-4 text-xs dark:border-slate-800">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Aperçu du résultat après fusion :
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-slate-700 dark:text-slate-300">
                  <span className="font-semibold">
                    {previewOverrides.firstName} {previewOverrides.lastName}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{previewOverrides.email}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{previewOverrides.phone}</span>
                  <span aria-hidden="true">·</span>
                  <span>{previewOverrides.company || 'Sans société'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{previewOverrides.jobTitle || 'Sans fonction'}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-4 text-slate-500 dark:text-slate-400">
                  <div>
                    <span>Étiquettes unifiées : </span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      {combinedTags.map((t) => `#${t}`).join(' · ') || 'Aucune'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteContact(activeGroup.duplicateContact.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Supprimer la fiche B sans fusionner</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
