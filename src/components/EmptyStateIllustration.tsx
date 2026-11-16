import React from 'react';
import { Database, FileSpreadsheet, Plus, RotateCcw, Search, Sparkles } from 'lucide-react';

interface DirectoryEmptyStateProps {
  isDatabaseEmpty: boolean;
  hasActiveFilters: boolean;
  searchQuery: string;
  isExactMode: boolean;
  selectedCategory: string;
  selectedLetter: string;
  isImportingSample: boolean;
  onResetFilters: () => void;
  onSwitchToPartialSearch: () => void;
  onCreateContact: () => void;
  onImportSampleDataset: () => void;
  onOpenImportWizard: () => void;
}

export const DirectoryEmptyState: React.FC<DirectoryEmptyStateProps> = ({
  isDatabaseEmpty,
  hasActiveFilters,
  searchQuery,
  isExactMode,
  selectedCategory,
  selectedLetter,
  isImportingSample,
  onResetFilters,
  onSwitchToPartialSearch,
  onCreateContact,
  onImportSampleDataset,
  onOpenImportWizard,
}) => {
  if (isDatabaseEmpty) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-900">
        {/* Lightweight Vector SVG Illustration: Empty B2B Directory Cards */}
        <div className="mx-auto mb-5 flex h-28 w-36 items-center justify-center">
          <svg
            viewBox="0 0 160 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-full w-full"
            aria-hidden="true"
          >
            {/* Background Card */}
            <rect
              x="28"
              y="14"
              width="104"
              height="68"
              rx="10"
              className="fill-slate-100 stroke-slate-300 dark:fill-slate-800/60 dark:stroke-slate-700"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            {/* Foreground Contact Card */}
            <rect
              x="18"
              y="28"
              width="112"
              height="72"
              rx="10"
              className="fill-white stroke-slate-300 dark:fill-slate-900 dark:stroke-slate-700"
              strokeWidth="1.5"
            />
            {/* Avatar Circle */}
            <circle
              cx="44"
              cy="56"
              r="14"
              className="fill-emerald-50 stroke-emerald-600 dark:fill-emerald-950/70 dark:stroke-emerald-400"
              strokeWidth="1.5"
            />
            <circle
              cx="44"
              cy="52"
              r="4.5"
              className="fill-emerald-600 dark:fill-emerald-400"
            />
            <path
              d="M36 64C37.5 60.5 40.5 59 44 59C47.5 59 50.5 60.5 52 64"
              className="stroke-emerald-600 dark:stroke-emerald-400"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            {/* Skeleton Lines on Card */}
            <rect
              x="66"
              y="45"
              width="48"
              height="6"
              rx="3"
              className="fill-slate-800 dark:fill-slate-200"
            />
            <rect
              x="66"
              y="56"
              width="36"
              height="5"
              rx="2.5"
              className="fill-emerald-600/80 dark:fill-emerald-400/80"
            />
            <rect
              x="66"
              y="67"
              width="52"
              height="4"
              rx="2"
              className="fill-slate-200 dark:fill-slate-700"
            />
            {/* Bottom Metadata Dots */}
            <circle cx="34" cy="86" r="2.5" className="fill-slate-300 dark:fill-slate-700" />
            <rect
              x="41"
              y="84"
              width="28"
              height="4"
              rx="2"
              className="fill-slate-200 dark:fill-slate-700"
            />
            <circle cx="79" cy="86" r="2.5" className="fill-slate-300 dark:fill-slate-700" />
            <rect
              x="86"
              y="84"
              width="30"
              height="4"
              rx="2"
              className="fill-slate-200 dark:fill-slate-700"
            />
            {/* Floating Plus Badge */}
            <circle
              cx="130"
              cy="32"
              r="13"
              className="fill-slate-900 dark:fill-emerald-600"
            />
            <path
              d="M130 26.5V37.5M124.5 32H135.5"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Votre répertoire de contacts est actuellement vide
        </h3>
        <p className="mx-auto mt-1.5 max-w-lg text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Démarrez immédiatement en chargeant le jeu d&apos;exemples professionnels (organisations,
          coordonnées vérifiées, étiquettes et favoris) ou créez votre première fiche contact.
        </p>

        {/* Quick Action Buttons for Empty Database */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={isImportingSample}
            onClick={onImportSampleDataset}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            <Sparkles className="h-4 w-4" />
            <span>
              {isImportingSample
                ? 'Importation des exemples en cours...'
                : 'Importer des contacts d’exemple (1 clic)'}
            </span>
          </button>

          <button
            type="button"
            onClick={onCreateContact}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <Plus className="h-4 w-4" />
            <span>Créer un premier contact</span>
          </button>

          <button
            type="button"
            onClick={onOpenImportWizard}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Importer un fichier CSV / JSON</span>
          </button>
        </div>

        {/* Clean Feature Highlights */}
        <div className="mx-auto mt-7 grid max-w-2xl grid-cols-1 gap-3 border-t border-slate-100 pt-5 text-left text-[11px] text-slate-500 sm:grid-cols-3 dark:border-slate-800/80 dark:text-slate-400">
          <div className="rounded-lg bg-slate-50/70 p-3 dark:bg-slate-950/50">
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              Coordonnées vérifiées
            </div>
            <p className="mt-0.5">
              Emails contrôlés et numéros de téléphone formatés automatiquement.
            </p>
          </div>
          <div className="rounded-lg bg-slate-50/70 p-3 dark:bg-slate-950/50">
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              Détection des doublons
            </div>
            <p className="mt-0.5">
              Repérage automatique des fiches similaires et fusion en un clic.
            </p>
          </div>
          <div className="rounded-lg bg-slate-50/70 p-3 dark:bg-slate-950/50">
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              Import &amp; Export rapide
            </div>
            <p className="mt-0.5">
              Échangez facilement vos listes de contacts aux formats CSV, JSON et vCard.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Empty Search / Filtered Results State (when database has contacts, but current filters match 0)
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-900">
      {/* Lightweight Vector SVG Illustration: Search Magnifier over Filtered Cards */}
      <div className="mx-auto mb-5 flex h-24 w-32 items-center justify-center">
        <svg
          viewBox="0 0 140 105"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full"
          aria-hidden="true"
        >
          <rect
            x="16"
            y="18"
            width="92"
            height="62"
            rx="9"
            className="fill-slate-50 stroke-slate-300 dark:fill-slate-800/50 dark:stroke-slate-700"
            strokeWidth="1.5"
          />
          <rect
            x="28"
            y="31"
            width="42"
            height="5"
            rx="2.5"
            className="fill-slate-300 dark:fill-slate-600"
          />
          <rect
            x="28"
            y="42"
            width="60"
            height="4"
            rx="2"
            className="fill-slate-200 dark:fill-slate-700"
          />
          <rect
            x="28"
            y="52"
            width="34"
            height="4"
            rx="2"
            className="fill-slate-200 dark:fill-slate-700"
          />
          {/* Magnifying Glass */}
          <circle
            cx="95"
            cy="58"
            r="20"
            className="fill-white stroke-slate-800 dark:fill-slate-900 dark:stroke-emerald-400"
            strokeWidth="2"
          />
          <path
            d="M89 58H101"
            className="stroke-amber-500 dark:stroke-amber-400"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M110 73L122 85"
            className="stroke-slate-800 dark:stroke-emerald-400"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        Aucun contact ne correspond à vos critères de recherche
      </h3>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {searchQuery.trim() ? (
          <>
            Aucune fiche trouvée pour la requête{' '}
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
              &laquo; {searchQuery} &raquo;
            </span>
            {isExactMode
              ? ' en mode Correspondance Exacte (Stricte).'
              : ' avec les filtres sélectionnés.'}
          </>
        ) : (
          <>
            Aucun contact ne correspond à la combinaison actuelle de filtres (
            {selectedCategory !== 'all' ? `catégorie : ${selectedCategory}` : 'filtres actifs'}
            {selectedLetter !== 'all' ? `, initiale : ${selectedLetter}` : ''}).
          </>
        )}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Réinitialiser tous les filtres</span>
          </button>
        )}

        {isExactMode && searchQuery.trim() && (
          <button
            type="button"
            onClick={onSwitchToPartialSearch}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Passer en Recherche Partielle (Contient)</span>
          </button>
        )}

        <button
          type="button"
          onClick={onCreateContact}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Créer un nouveau contact</span>
        </button>

        <button
          type="button"
          disabled={isImportingSample}
          onClick={onImportSampleDataset}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
        >
          <Database className="h-3.5 w-3.5" />
          <span>Importer des exemples B2B</span>
        </button>
      </div>
    </div>
  );
};
