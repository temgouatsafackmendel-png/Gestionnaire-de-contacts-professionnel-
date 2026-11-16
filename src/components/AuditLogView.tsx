import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { AuditLogEntry, UserRole } from '../shared/types';

interface AuditLogViewProps {
  logs: AuditLogEntry[];
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({
  logs,
  currentRole,
  onRoleChange,
}) => {
  const [actionFilter, setActionFilter] = useState<string>('all');

  const filteredLogs =
    actionFilter === 'all' ? logs : logs.filter((l) => l.action === actionFilter);

  return (
    <div className="space-y-6">
      {/* RBAC Simulator & Security Posture Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Contrôle d&apos;accès basé sur les rôles (RBAC) &amp; Journal d&apos;Audit
              </h2>
            </div>
            <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
              Toutes les opérations sensibles (création, modification, suppression, fusion,
              import/export et refus d&apos;autorisation) sont tracées côté serveur. Vous pouvez
              simuler un profil ci-dessous pour vérifier l&apos;application du moindre privilège.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Rôle actif :
            </span>
            <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {(
                [
                  { role: UserRole.ADMIN, label: 'Admin (Complet)' },
                  { role: UserRole.EDITOR, label: 'Éditeur (Sans suppression)' },
                  { role: UserRole.VIEWER, label: 'Lecteur (Consultation/Export)' },
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
      </div>

      {/* Audit Log Table */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Événements d&apos;audit enregistrés ({filteredLogs.length})
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="audit-action-filter" className="text-xs text-slate-500">
              Filtrer par action :
            </label>
            <select
              id="audit-action-filter"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="all">Toutes les actions</option>
              <option value="CREATE_CONTACT">Création contact</option>
              <option value="UPDATE_CONTACT">Modification contact</option>
              <option value="DELETE_CONTACT">Suppression contact</option>
              <option value="MERGE_CONTACTS">Fusion de doublons</option>
              <option value="IMPORT_CONTACTS">Import CSV/JSON</option>
              <option value="EXPORT_CONTACTS">Export CSV/JSON</option>
              <option value="BACKUP_RESTORE">Sauvegarde / Restauration</option>
              <option value="PERMISSION_DENIED">Accès refusé (RBAC)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-6 py-3 font-medium">Horodatage UTC</th>
                <th className="px-4 py-3 font-medium">Rôle</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-6 py-3 font-medium">Détail de l&apos;opération</th>
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
                  <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                    {entry.actorRole}
                  </td>
                  <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                    {entry.action}
                  </td>
                  <td className="px-6 py-3 text-slate-700 dark:text-slate-300">
                    {entry.summary}
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                    Aucun événement d&apos;audit pour ce filtre.
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
