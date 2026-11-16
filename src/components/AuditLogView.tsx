import React, { useMemo, useState } from 'react';
import { History, Search, ShieldCheck } from 'lucide-react';
import { AuditLogEntry, UserRole } from '../shared/types';

interface AuditLogViewProps {
  logs: AuditLogEntry[];
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  onReplaySearch?: (query: string) => void;
}

const ACTION_LABELS: Record<string, string> = {
  SEARCH_CONTACTS: 'Recherche répertoire',
  CREATE_CONTACT: 'Création de fiche',
  UPDATE_CONTACT: 'Mise à jour',
  DELETE_CONTACT: 'Suppression',
  MERGE_CONTACTS: 'Fusion de doublons',
  IMPORT_CONTACTS: 'Importation de données',
  EXPORT_CONTACTS: 'Exportation de données',
  BACKUP_RESTORE: 'Sauvegarde',
  SEED_RESET: 'Chargement exemples',
  PERMISSION_DENIED: 'Action non autorisée',
};

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Administrateur',
  [UserRole.EDITOR]: 'Éditeur',
  [UserRole.VIEWER]: 'Lecteur',
};

export const AuditLogView: React.FC<AuditLogViewProps> = ({
  logs,
  currentRole,
  onRoleChange,
  onReplaySearch,
}) => {
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');

  const searchLogs = useMemo(
    () => logs.filter((entry) => entry.action === 'SEARCH_CONTACTS'),
    [logs]
  );

  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      if (actionFilter !== 'all' && entry.action !== actionFilter) return false;
      if (searchFilter.trim()) {
        const q = searchFilter.trim().toLowerCase();
        const label = (ACTION_LABELS[entry.action] || entry.action).toLowerCase();
        return (
          entry.summary.toLowerCase().includes(q) ||
          label.includes(q) ||
          ROLE_LABELS[entry.actorRole]?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, actionFilter, searchFilter]);

  return (
    <div className="space-y-6">
      {/* Top Row: Access Profile & Search Compliance Summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Access Profile Selector */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Conformité &amp; Profils d&apos;utilisation
            </h2>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Consultez l&apos;historique des actions et des recherches effectuées sur le carnet de
            contacts. Changez de profil ci-dessous pour ajuster vos droits d&apos;édition.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Profil actif :
            </span>
            <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {(
                [
                  { role: UserRole.ADMIN, label: 'Administrateur' },
                  { role: UserRole.EDITOR, label: 'Éditeur' },
                  { role: UserRole.VIEWER, label: 'Lecteur seul' },
                ] as const
              ).map((item) => (
                <button
                  key={item.role}
                  type="button"
                  onClick={() => onRoleChange(item.role)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                    currentRole === item.role
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Search Activity History Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-slate-700 dark:text-slate-300" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Historique des recherches ({searchLogs.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() =>
                setActionFilter(
                  actionFilter === 'SEARCH_CONTACTS' ? 'all' : 'SEARCH_CONTACTS'
                )
              }
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                actionFilter === 'SEARCH_CONTACTS'
                  ? 'bg-slate-900 text-white dark:bg-emerald-600'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {actionFilter === 'SEARCH_CONTACTS'
                ? 'Voir toutes les activités'
                : 'Filtrer les recherches'}
            </button>
          </div>

          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Suivi de conformité et d&apos;usage des requêtes de recherche exécutées dans l&apos;annuaire.
          </p>

          {searchLogs.length > 0 ? (
            <div className="mt-3.5 flex flex-wrap gap-2">
              {searchLogs.slice(0, 6).map((sLog) => {
                const queryText = String(sLog.metadata?.query || '');
                const resultsCount =
                  typeof sLog.metadata?.resultsCount === 'number'
                    ? sLog.metadata.resultsCount
                    : null;
                return (
                  <button
                    key={sLog.id}
                    type="button"
                    onClick={() => {
                      if (queryText && onReplaySearch) {
                        onReplaySearch(queryText);
                      } else {
                        setActionFilter('SEARCH_CONTACTS');
                      }
                    }}
                    title="Cliquer pour relancer cette recherche dans le répertoire"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:border-slate-700"
                  >
                    <Search className="h-3 w-3 text-slate-400" />
                    <span className="font-medium">
                      {queryText || sLog.summary}
                    </span>
                    {resultsCount !== null && (
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                        ({resultsCount})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-3.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
              Aucune recherche enregistrée pour le moment. Saisissez un terme dans la barre de
              recherche du répertoire pour tracer l&apos;activité.
            </div>
          )}
        </div>
      </div>

      {/* Activity Table */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Journal d&apos;activité ({filteredLogs.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Rechercher dans le journal..."
                className="rounded-lg border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="audit-action-filter" className="text-xs text-slate-500">
                Catégorie :
              </label>
              <select
                id="audit-action-filter"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="all">Toutes les activités</option>
                <option value="SEARCH_CONTACTS">Recherches répertoire ({searchLogs.length})</option>
                <option value="CREATE_CONTACT">Création de fiche</option>
                <option value="UPDATE_CONTACT">Mise à jour</option>
                <option value="DELETE_CONTACT">Suppression</option>
                <option value="MERGE_CONTACTS">Fusion de doublons</option>
                <option value="IMPORT_CONTACTS">Importation</option>
                <option value="EXPORT_CONTACTS">Exportation</option>
                <option value="BACKUP_RESTORE">Sauvegarde</option>
                <option value="PERMISSION_DENIED">Accès restreint</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                <th className="px-6 py-3 font-medium">Date &amp; Heure</th>
                <th className="px-4 py-3 font-medium">Profil</th>
                <th className="px-4 py-3 font-medium">Type d&apos;activité</th>
                <th className="px-6 py-3 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredLogs.map((entry) => (
                <tr
                  key={entry.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <td className="px-6 py-3 font-mono whitespace-nowrap text-slate-500 tabular-nums dark:text-slate-400">
                    {entry.timestamp.replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {ROLE_LABELS[entry.actorRole] || entry.actorRole}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                    {ACTION_LABELS[entry.action] || entry.action}
                  </td>
                  <td className="px-6 py-3 text-slate-700 dark:text-slate-300">
                    {entry.summary}
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center">
                    <div className="mx-auto mb-3 flex h-16 w-20 items-center justify-center">
                      <svg
                        viewBox="0 0 80 64"
                        fill="none"
                        className="h-full w-full"
                        aria-hidden="true"
                      >
                        <rect
                          x="14"
                          y="10"
                          width="52"
                          height="44"
                          rx="6"
                          className="fill-slate-50 stroke-slate-300 dark:fill-slate-800/60 dark:stroke-slate-700"
                          strokeWidth="1.5"
                        />
                        <path
                          d="M24 24H56M24 32H48M24 40H40"
                          className="stroke-slate-300 dark:stroke-slate-600"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      Aucune activité enregistrée pour ce filtre
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Aucune entrée ne correspond au filtre sélectionné.
                    </p>
                    {(actionFilter !== 'all' || searchFilter.trim()) && (
                      <button
                        type="button"
                        onClick={() => {
                          setActionFilter('all');
                          setSearchFilter('');
                        }}
                        className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      >
                        Afficher tout l&apos;historique
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
