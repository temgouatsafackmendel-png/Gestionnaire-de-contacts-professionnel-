import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  RefreshCw,
  Upload,
} from 'lucide-react';
import {
  ContactQueryFilters,
  ImportResultReport,
  StorageStatus,
  UserRole,
} from '../shared/types';
import { apiClient, triggerBrowserDownload } from '../services/apiClient';

interface ImportExportViewProps {
  activeFilters: ContactQueryFilters;
  totalContactsCount: number;
  filteredContactsCount: number;
  role: UserRole;
  storageStatus: StorageStatus | null;
  onDataChanged: () => Promise<void>;
}

const SAMPLE_VALID_CSV = `firstName,lastName,email,phone,company,jobTitle,category,tags,city,country,favorite,notes
Nadia,Khelifi,nadia.khelifi@aurum-fintech.fr,+33 6 77 88 99 10,Aurum Fintech,Directrice Juridique,client,fintech;conformite,Paris,France,true,Nouveau contrat signé en novembre.
Hugo,Blanchard,h.blanchard@alpes-industrie.fr,04 50 12 88 34,Alpes Industrie,Ingénieur Qualité,fournisseur,iso9001;usinage,Annecy,France,false,Audit qualité annuel validé.`;

const SAMPLE_MIXED_INVALID_CSV = `firstName,lastName,email,phone,company,jobTitle,category,tags,city,country,favorite,notes
Inès,Roche,ines.roche@valmy-med.fr,+33 6 21 43 65 87,Valmy Médical,Responsable Clinique,client,sante;prioritaire,Lyon,France,true,Ligne parfaitement valide.
Jean,Dupont,email-invalide-sans-domaine,06 12 34 56 78,Dupont & Co,Consultant,prospect,test,Paris,France,false,Erreur attendue : format email invalide.
,Martin,paul.martin@exemple.fr,12345,Martin SAS,Gérant,fournisseur,test,Lille,France,false,Erreur attendue : prénom manquant et numéro trop court.
Camille,Moreau,camille.moreau@atelier-veridian.fr,+33 6 14 28 39 50,Atelier Veridian SAS,Directrice Produit,client,vip,Paris,France,true,Doublon exact avec une fiche existante.`;

const SAMPLE_MIXED_JSON = JSON.stringify(
  [
    {
      firstName: 'Sébastien',
      lastName: 'Delaunay',
      email: 's.delaunay@oceanic-freight.fr',
      phone: '+33 6 89 45 12 70',
      company: 'Oceanic Freight',
      jobTitle: 'Directeur des Opérations',
      category: 'partenaire',
      tags: ['maritime', 'logistique'],
      city: 'Le Havre',
      country: 'France',
      favorite: true,
      notes: 'Contact valide importé par JSON.',
    },
    {
      firstName: 'Erreur',
      lastName: 'TestJSON',
      email: 'contact@domaine-sans-tld.123',
      phone: 'abc-numero-invalide',
      company: 'Test Rejet',
      category: 'autre',
    },
  ],
  null,
  2
);

export const ImportExportView: React.FC<ImportExportViewProps> = ({
  activeFilters,
  totalContactsCount,
  filteredContactsCount,
  role,
  storageStatus,
  onDataChanged,
}) => {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [content, setContent] = useState<string>(SAMPLE_MIXED_INVALID_CSV);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'update' | 'create_anyway'>(
    'skip'
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [report, setReport] = useState<ImportResultReport | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  // Live Export Preview state so users can inspect, copy, and download exported CSV/JSON
  const [exportPreview, setExportPreview] = useState<{
    format: 'csv' | 'json';
    filename: string;
    content: string;
  } | null>(null);
  const [copiedExport, setCopiedExport] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const detectedFormat = file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv';
    setFormat(detectedFormat);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setContent(reader.result);
        setReport(null);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleExportAndPreview = async (
    expFormat: 'csv' | 'json',
    filtersToUse: ContactQueryFilters
  ) => {
    setActionError(null);
    try {
      const res = await apiClient.downloadExport(expFormat, filtersToUse, role);
      setExportPreview({
        format: expFormat,
        filename: res.filename,
        content: res.content.replace(/^\uFEFF/, ''),
      });
      await onDataChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Échec de l'export.");
    }
  };

  const handleCopyExport = async () => {
    if (!exportPreview) return;
    try {
      await navigator.clipboard.writeText(exportPreview.content);
      setCopiedExport(true);
      setTimeout(() => setCopiedExport(false), 2500);
    } catch {
      // Fallback copy
    }
  };

  const handleRunImport = async (dryRun: boolean) => {
    setActionError(null);
    setBackupMessage(null);
    setIsProcessing(true);
    try {
      const res = await apiClient.importContacts(
        {
          format,
          content,
          dryRun,
          duplicateStrategy,
        },
        role
      );
      setReport(res);
      if (!dryRun) {
        await onDataChanged();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erreur lors de l'import.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualBackup = async () => {
    setActionError(null);
    setBackupMessage(null);
    try {
      const res = await apiClient.triggerBackup(role);
      setBackupMessage(res.message);
      await onDataChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Échec de la sauvegarde.');
    }
  };

  const handleResetDemo = async () => {
    setActionError(null);
    setBackupMessage(null);
    try {
      const res = await apiClient.resetDemoData(role);
      setBackupMessage(res.message);
      setReport(null);
      await onDataChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Échec de la réinitialisation.');
    }
  };

  const downloadErrorsJson = () => {
    if (!report || report.errors.length === 0) return;
    triggerBrowserDownload(
      JSON.stringify(report.errors, null, 2),
      `rapport-erreurs-import-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json;charset=utf-8'
    );
  };

  return (
    <div className="space-y-6">
      {actionError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50/80 px-4 py-3 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {actionError}
        </div>
      )}

      {backupMessage && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          {backupMessage}
        </div>
      )}

      {/* Top Row: Export & Storage Reliability */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Export Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Exportation multi-formats (CSV &amp; JSON)
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Export conforme RFC 4180 (UTF-8 avec BOM Excel, protection anti-injection de formules{' '}
                <code className="font-mono">= + - @</code>) avec téléchargement et aperçu direct.
              </p>
            </div>
            <FileSpreadsheet className="h-5 w-5 shrink-0 text-slate-400" />
          </div>

          <div className="mt-5 space-y-3 border-t border-slate-200 pt-4 text-xs dark:border-slate-800">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span>Répertoire complet enregistré :</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {totalContactsCount} contacts
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span>Sélection selon les filtres actifs :</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                {filteredContactsCount} contacts
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => handleExportAndPreview('csv', {})}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium whitespace-nowrap text-white transition-colors hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Exporter &amp; Voir CSV ({totalContactsCount})</span>
              </button>
              <button
                type="button"
                onClick={() => handleExportAndPreview('json', {})}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium whitespace-nowrap text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Exporter &amp; Voir JSON ({totalContactsCount})</span>
              </button>
              {filteredContactsCount !== totalContactsCount && (
                <button
                  type="button"
                  onClick={() => handleExportAndPreview('csv', activeFilters)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium whitespace-nowrap text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Exporter la vue filtrée ({filteredContactsCount})</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Reliable Persistence & Backup Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Sauvegarde fiable &amp; Intégrité ACID
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Base SQLite en mode journalisé WAL doublée d&apos;un miroir atomique JSON sur disque.
              </p>
            </div>
            <Database className="h-5 w-5 shrink-0 text-slate-400" />
          </div>

          <div className="mt-5 space-y-2.5 border-t border-slate-200 pt-4 text-xs dark:border-slate-800">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span>Moteur de persistance :</span>
              <span className="font-mono text-slate-900 dark:text-slate-100">
                {storageStatus?.engine || 'sqlite+json-mirror'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span>Contrôle PRAGMA integrity_check :</span>
              <span className="font-mono font-medium text-emerald-700 dark:text-emerald-400">
                {storageStatus?.integrityOk !== false ? 'OK (Vérifié)' : 'Erreur détectée'}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
              <span>Fichier SQLite / Miroir JSON :</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {storageStatus?.dbPath} · {storageStatus?.backupPath}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleManualBackup}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium whitespace-nowrap text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Vérifier &amp; Synchroniser la sauvegarde</span>
              </button>
              <button
                type="button"
                onClick={handleResetDemo}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium whitespace-nowrap text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
              >
                <span>Réinitialiser le jeu de démo (10 contacts)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Live Export Preview Box (when an export is triggered) */}
      {exportPreview && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Aperçu du fichier exporté : <span className="font-mono">{exportPreview.filename}</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Le téléchargement a été lancé. Vous pouvez également copier le contenu brut ci-dessous en 1 clic.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyExport}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {copiedExport ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Copié dans le presse-papiers !</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copier le contenu {exportPreview.format.toUpperCase()}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setExportPreview(null)}
                className="rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Fermer l&apos;aperçu
              </button>
            </div>
          </div>
          <pre className="mt-3 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3.5 font-mono text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
            {exportPreview.content}
          </pre>
        </div>
      )}

      {/* Import Section with Validation & Error Reporting */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Importation CSV / JSON avec signalement des lignes invalides
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Chaque enregistrement est validé côté serveur. Les lignes comportant un email ou un
              téléphone invalide sont isolées et signalées avec leur numéro de ligne exact.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Charger un fichier (.csv / .json)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFormat('csv');
                setContent(SAMPLE_MIXED_INVALID_CSV);
                setReport(null);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Jeu d&apos;essai CSV avec erreurs (Démo QA)
            </button>
            <button
              type="button"
              onClick={() => {
                setFormat('csv');
                setContent(SAMPLE_VALID_CSV);
                setReport(null);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Jeu d&apos;essai CSV 100% valide
            </button>
            <button
              type="button"
              onClick={() => {
                setFormat('json');
                setContent(SAMPLE_MIXED_JSON);
                setReport(null);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Jeu d&apos;essai JSON mixte
            </button>
          </div>
        </div>

        {/* Configuration Controls */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Format des données
            </label>
            <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`rounded-md px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  format === 'csv'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                CSV (RFC 4180)
              </button>
              <button
                type="button"
                onClick={() => setFormat('json')}
                className={`rounded-md px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  format === 'json'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                JSON
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="dup-strategy-select"
              className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Politique en cas de doublon détecté à l&apos;import
            </label>
            <select
              id="dup-strategy-select"
              value={duplicateStrategy}
              onChange={(e) =>
                setDuplicateStrategy(e.target.value as 'skip' | 'update' | 'create_anyway')
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="skip">Ignorer les doublons et les signaler dans le rapport</option>
              <option value="update">Mettre à jour la fiche existante correspondante</option>
              <option value="create_anyway">Importer malgré tout comme nouvelle fiche</option>
            </select>
          </div>
        </div>

        {/* Raw Content Editor */}
        <div className="mt-4">
          <label
            htmlFor="import-content-textarea"
            className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            Contenu {format.toUpperCase()} à analyser et importer
          </label>
          <textarea
            id="import-content-textarea"
            rows={7}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3.5 font-mono text-xs text-slate-800 focus:border-slate-900 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          />
        </div>

        {/* Action Buttons */}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => handleRunImport(true)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium whitespace-nowrap text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Simuler &amp; Vérifier les erreurs (Dry-Run)
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => handleRunImport(false)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium whitespace-nowrap text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {isProcessing ? 'Traitement...' : 'Exécuter l’importation des lignes valides'}
          </button>
        </div>

        {/* Detailed Import Report */}
        {report && (
          <div className="mt-6 border-t border-slate-200 pt-6 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Rapport d&apos;analyse {report.dryRun ? '(Mode Simulation Dry-Run)' : '(Import Exécuté)'}
              </h3>
              <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                Total analysé : {report.totalRows} · Valides : {report.validRowsCount} · Créés :{' '}
                {report.importedCount} · Mis à jour : {report.updatedCount} · Doublons ignorés :{' '}
                {report.skippedDuplicatesCount} · Rejets invalides : {report.invalidRowsCount}
              </span>
            </div>

            {/* Invalid rows table */}
            {report.errors.length > 0 ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-red-900 dark:text-red-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span>
                      {report.errors.length} ligne(s) invalide(s) signalée(s) et rejetée(s)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={downloadErrorsJson}
                    className="text-xs font-medium text-red-700 underline hover:text-red-900 dark:text-red-300"
                  >
                    Télécharger le rapport d&apos;erreurs (.json)
                  </button>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-red-200 text-red-800 dark:border-red-900/60 dark:text-red-300">
                        <th className="py-2 pr-4 font-medium">Ligne</th>
                        <th className="py-2 pr-4 font-medium">Entrée concernée</th>
                        <th className="py-2 font-medium">Anomalies détectées</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-200/60 dark:divide-red-900/40">
                      {report.errors.map((err, idx) => (
                        <tr key={`${err.line}-${idx}`}>
                          <td className="py-2.5 pr-4 font-mono font-semibold text-red-900 tabular-nums dark:text-red-200">
                            Ligne {err.line}
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-red-800 dark:text-red-300">
                            {err.rawIdentifier}
                          </td>
                          <td className="py-2.5 text-red-900 dark:text-red-200">
                            {err.messages.join(' · ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>Aucune erreur de format ou de validation détectée dans le lot.</span>
              </div>
            )}

            {/* Duplicate warnings during import */}
            {report.duplicateWarnings.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-4 text-xs dark:border-amber-900/50 dark:bg-amber-950/20">
                <div className="font-semibold text-amber-900 dark:text-amber-200">
                  Doublons détectés lors de l&apos;import ({report.duplicateWarnings.length})
                </div>
                <ul className="mt-2 space-y-1.5 text-amber-800 dark:text-amber-300">
                  {report.duplicateWarnings.map((w, i) => (
                    <li key={`${w.line}-${i}`} className="font-mono">
                      Ligne {w.line} : {w.incomingContact.firstName} {w.incomingContact.lastName} (
                      {w.incomingContact.email}) correspond à la fiche existante{' '}
                      {w.existingContact.firstName} {w.existingContact.lastName} —{' '}
                      {w.reasons.join(' · ')} [Action : {w.actionTaken}]
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
