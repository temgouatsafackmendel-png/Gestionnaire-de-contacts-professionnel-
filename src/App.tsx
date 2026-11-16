/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  Copy,
  Database,
  Download,
  Edit3,
  FileText,
  GitMerge,
  LayoutGrid,
  List,
  Mail,
  MapPin,
  Moon,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Search,
  Star,
  Sun,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { AuditLogView } from './components/AuditLogView';
import { CategoryDonutChart } from './components/CategoryDonutChart';
import { ContactFormModal } from './components/ContactFormModal';
import { DuplicatesView } from './components/DuplicatesView';
import { DirectoryEmptyState } from './components/EmptyStateIllustration';
import { ImportExportView } from './components/ImportExportView';
import { apiClient, generateVCard, triggerBrowserDownload } from './services/apiClient';
import { serializeContactsToCsv } from './shared/csv';
import {
  AuditLogEntry,
  Contact,
  ContactCategory,
  ContactInput,
  ContactQueryFilters,
  DuplicateGroup,
  SearchField,
  SearchMode,
  StorageStatus,
  UserRole,
} from './shared/types';

type ActiveTab = 'directory' | 'duplicates' | 'import_export' | 'audit';
type DirectoryViewMode = 'table' | 'grid' | 'companies';

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Tous',
  [ContactCategory.CLIENT]: 'Clients',
  [ContactCategory.PARTENAIRE]: 'Partenaires',
  [ContactCategory.FOURNISSEUR]: 'Fournisseurs',
  [ContactCategory.PROSPECT]: 'Prospects',
  [ContactCategory.INTERNE]: 'Internes',
  [ContactCategory.AUTRE]: 'Autres',
};

const CATEGORY_BAR_COLORS: Record<string, string> = {
  [ContactCategory.CLIENT]: 'bg-emerald-600 dark:bg-emerald-500',
  [ContactCategory.PARTENAIRE]: 'bg-sky-600 dark:bg-sky-500',
  [ContactCategory.FOURNISSEUR]: 'bg-amber-500 dark:bg-amber-400',
  [ContactCategory.PROSPECT]: 'bg-violet-600 dark:bg-violet-500',
  [ContactCategory.INTERNE]: 'bg-slate-700 dark:bg-slate-400',
  [ContactCategory.AUTRE]: 'bg-slate-400 dark:bg-slate-600',
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function getInitials(firstName: string, lastName: string): string {
  const f = (firstName || '').trim().charAt(0).toUpperCase();
  const l = (lastName || '').trim().charAt(0).toUpperCase();
  return `${f}${l}` || 'VC';
}

function getAvatarTone(category: ContactCategory): string {
  switch (category) {
    case ContactCategory.CLIENT:
      return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200';
    case ContactCategory.PARTENAIRE:
      return 'bg-sky-100 text-sky-900 dark:bg-sky-950/80 dark:text-sky-200';
    case ContactCategory.FOURNISSEUR:
      return 'bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200';
    case ContactCategory.PROSPECT:
      return 'bg-violet-100 text-violet-900 dark:bg-violet-950/80 dark:text-violet-200';
    case ContactCategory.INTERNE:
      return 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-200';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
}

function computeContactCompleteness(c: Contact): number {
  let points = 4; // firstName, lastName, email, phone are mandatory
  if (c.company?.trim()) points += 1.5;
  if (c.jobTitle?.trim()) points += 1.5;
  if (c.city?.trim()) points += 1;
  if (c.tags && c.tags.length > 0) points += 1;
  if (c.notes?.trim()) points += 1;
  return Math.round((points / 10) * 100);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('directory');
  const [viewMode, setViewMode] = useState<DirectoryViewMode>('table');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<UserRole>(UserRole.ADMIN);

  // Contacts & workspace state
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [searchMode, setSearchMode] = useState<SearchMode>(SearchMode.PARTIAL);
  const [searchField, setSearchField] = useState<SearchField>(SearchField.ALL);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(false);
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [selectedLetter, setSelectedLetter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'recent' | 'company_asc'>(
    'name_asc'
  );

  // Multi-selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Selected contact for side inspector & modals
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactPendingDelete, setContactPendingDelete] = useState<Contact | null>(null);

  // Quick copy, inline notes & inline tag states
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [quickTagInput, setQuickTagInput] = useState<string>('');
  const [inlineNotesDraft, setInlineNotesDraft] = useState<string>('');
  const [isSavingInlineNotes, setIsSavingInlineNotes] = useState<boolean>(false);
  const [isImportingSample, setIsImportingSample] = useState<boolean>(false);
  const [exportModalData, setExportModalData] = useState<{
    filename: string;
    format: 'csv' | 'json' | 'vcf';
    content: string;
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const activeFilters: ContactQueryFilters = useMemo(
    () => ({
      q: debouncedSearchQuery.trim() || undefined,
      searchMode,
      searchField,
      category: selectedCategory !== 'all' ? selectedCategory : undefined,
      favorite: onlyFavorites ? true : undefined,
      tag: selectedTag !== 'all' ? selectedTag : undefined,
      sortBy,
    }),
    [
      debouncedSearchQuery,
      searchMode,
      searchField,
      selectedCategory,
      onlyFavorites,
      selectedTag,
      sortBy,
    ]
  );

  const loadWorkspaceData = useCallback(async () => {
    setErrorMessage(null);
    try {
      const [filteredRes, fullRes, dupRes, storageRes, auditRes] = await Promise.all([
        apiClient.listContacts(activeFilters, userRole),
        apiClient.listContacts({}, userRole),
        apiClient.getDuplicates(userRole),
        apiClient.getStorageStatus(userRole),
        apiClient.getAuditLogs(userRole),
      ]);

      setFilteredContacts(filteredRes.contacts);
      setAllContacts(fullRes.contacts);
      setDuplicates(dupRes.duplicates);
      setStorageStatus(storageRes);
      setAuditLogs(auditRes.logs);

      setSelectedContactId((prev) => {
        if (prev && fullRes.contacts.some((c) => c.id === prev)) return prev;
        return filteredRes.contacts[0]?.id ?? null;
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Impossible de charger les données du serveur.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeFilters, userRole]);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  // Apply alphabetical letter filter on top of API-filtered contacts
  const displayedContacts = useMemo(() => {
    if (selectedLetter === 'all') return filteredContacts;
    return filteredContacts.filter((c) => {
      const firstChar = (c.lastName || c.firstName || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .charAt(0)
        .toUpperCase();
      return firstChar === selectedLetter;
    });
  }, [filteredContacts, selectedLetter]);

  const inspectedContact = useMemo(() => {
    if (!selectedContactId) return null;
    return (
      displayedContacts.find((c) => c.id === selectedContactId) ||
      allContacts.find((c) => c.id === selectedContactId) ||
      null
    );
  }, [selectedContactId, displayedContacts, allContacts]);

  // Sync inline notes draft when inspected contact changes
  useEffect(() => {
    setInlineNotesDraft(inspectedContact?.notes ?? '');
  }, [inspectedContact?.id, inspectedContact?.notes]);

  // Global keyboard shortcuts (/, Ctrl+K, Escape, Up/Down arrows)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.key === '/' && !isInputFocused) || ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
        e.preventDefault();
        setActiveTab('directory');
        setTimeout(() => searchInputRef.current?.focus(), 20);
        return;
      }

      if (e.key === 'Escape') {
        if (isFormModalOpen) setIsFormModalOpen(false);
        else if (contactPendingDelete) setContactPendingDelete(null);
        else if (exportModalData) setExportModalData(null);
        return;
      }

      if (!isInputFocused && activeTab === 'directory' && displayedContacts.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const idx = displayedContacts.findIndex((c) => c.id === selectedContactId);
          const next = displayedContacts[Math.min(displayedContacts.length - 1, idx + 1)];
          if (next) setSelectedContactId(next.id);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const idx = displayedContacts.findIndex((c) => c.id === selectedContactId);
          const prev = displayedContacts[Math.max(0, idx - 1)];
          if (prev) setSelectedContactId(prev.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeTab,
    displayedContacts,
    selectedContactId,
    isFormModalOpen,
    contactPendingDelete,
    exportModalData,
  ]);

  const showNotice = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const handleCopyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2000);
    } catch {
      showNotice(`Valeur : ${text}`);
    }
  };

  // Letters that exist in filteredContacts
  const activeLettersSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of filteredContacts) {
      const ch = (c.lastName || c.firstName || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .charAt(0)
        .toUpperCase();
      if (ch) set.add(ch);
    }
    return set;
  }, [filteredContacts]);

  // Available tags & stats across all contacts
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of allContacts) {
      for (const t of c.tags || []) {
        set.add(t);
      }
    }
    return Array.from(set).sort();
  }, [allContacts]);

  const stats = useMemo(() => {
    const companies = new Set(allContacts.map((c) => c.company).filter(Boolean));
    const countries = new Set(allContacts.map((c) => c.country).filter(Boolean));
    const favoritesCount = allContacts.filter((c) => c.favorite).length;
    const categoryCounts: Record<string, number> = { all: allContacts.length };
    let totalCompleteness = 0;
    for (const c of allContacts) {
      categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
      totalCompleteness += computeContactCompleteness(c);
    }
    const avgCompleteness =
      allContacts.length > 0 ? Math.round(totalCompleteness / allContacts.length) : 100;

    return {
      companiesCount: companies.size,
      countriesCount: countries.size,
      favoritesCount,
      categoryCounts,
      avgCompleteness,
    };
  }, [allContacts]);

  // Group contacts by company for the "Organisations" view mode
  const groupedByCompany = useMemo(() => {
    const map = new Map<string, Contact[]>();
    for (const c of displayedContacts) {
      const compName = c.company?.trim() || 'Consultants & Indépendants';
      const arr = map.get(compName) || [];
      arr.push(c);
      map.set(compName, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [displayedContacts]);

  // Map of contact IDs involved in duplicates
  const duplicateContactIds = useMemo(() => {
    const set = new Set<string>();
    for (const group of duplicates) {
      set.add(group.primaryContact.id);
      set.add(group.duplicateContact.id);
    }
    return set;
  }, [duplicates]);

  // Related contacts in the same company for the inspector drawer
  const colleaguesInSameCompany = useMemo(() => {
    if (!inspectedContact || !inspectedContact.company.trim()) return [];
    const comp = inspectedContact.company.trim().toLowerCase();
    return allContacts.filter(
      (c) => c.id !== inspectedContact.id && c.company.trim().toLowerCase() === comp
    );
  }, [inspectedContact, allContacts]);

  const handleSaveContact = async (payload: ContactInput, contactId?: string) => {
    if (contactId) {
      const res = await apiClient.updateContact(contactId, payload, userRole);
      showNotice(`Fiche mise à jour : ${res.contact.firstName} ${res.contact.lastName}`);
      setSelectedContactId(res.contact.id);
    } else {
      const res = await apiClient.createContact(payload, userRole);
      if (res.duplicateWarnings.length > 0) {
        showNotice(
          `Contact créé (${res.contact.firstName} ${res.contact.lastName}) — ${res.duplicateWarnings.length} doublon(s) potentiel(s) détecté(s).`
        );
      } else {
        showNotice(`Nouveau contact enregistré : ${res.contact.firstName} ${res.contact.lastName}`);
      }
      setSelectedContactId(res.contact.id);
    }
    await loadWorkspaceData();
  };

  const handleToggleFavorite = async (contact: Contact) => {
    try {
      await apiClient.updateContact(contact.id, { favorite: !contact.favorite }, userRole);
      await loadWorkspaceData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Action non autorisée.');
    }
  };

  const handleInlineCategoryChange = async (contact: Contact, nextCategory: ContactCategory) => {
    try {
      await apiClient.updateContact(contact.id, { category: nextCategory }, userRole);
      showNotice(`Catégorie mise à jour (${nextCategory}) pour ${contact.firstName}`);
      await loadWorkspaceData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Modification refusée.');
    }
  };

  const handleSaveInlineNotes = async () => {
    if (!inspectedContact) return;
    setIsSavingInlineNotes(true);
    try {
      await apiClient.updateContact(inspectedContact.id, { notes: inlineNotesDraft }, userRole);
      showNotice(`Note enregistrée pour ${inspectedContact.firstName} ${inspectedContact.lastName}`);
      await loadWorkspaceData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Impossible de sauvegarder la note.');
    } finally {
      setIsSavingInlineNotes(false);
    }
  };

  const handleAddQuickTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectedContact || !quickTagInput.trim()) return;
    const cleanTag = quickTagInput.trim().toLowerCase().replace(/^#/, '');
    if (!cleanTag) return;
    const nextTags = Array.from(new Set([...inspectedContact.tags, cleanTag]));
    try {
      await apiClient.updateContact(inspectedContact.id, { tags: nextTags }, userRole);
      setQuickTagInput('');
      showNotice(`Étiquette #${cleanTag} ajoutée à ${inspectedContact.firstName}`);
      await loadWorkspaceData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Impossible d'ajouter l'étiquette.");
    }
  };

  const handleRemoveTag = async (contact: Contact, tagToRemove: string) => {
    const nextTags = contact.tags.filter((t) => t !== tagToRemove);
    try {
      await apiClient.updateContact(contact.id, { tags: nextTags }, userRole);
      await loadWorkspaceData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Modification refusée.');
    }
  };

  const handleCreateTestDuplicateFromContact = async (contact: Contact) => {
    try {
      const res = await apiClient.createContact(
        {
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          company: `${contact.company || 'Veridian'} (Copie Test Doublon)`,
          jobTitle: contact.jobTitle,
          category: contact.category,
          tags: [...contact.tags, 'doublon-test'],
          city: contact.city,
          country: contact.country,
          favorite: false,
          notes: `Fiche dupliquée pour tester l'assistant de détection et fusion.`,
        },
        userRole
      );
      showNotice(
        `Doublon de test créé pour ${res.contact.firstName} ${res.contact.lastName}. Ouvrez l'onglet Doublons pour le fusionner.`
      );
      await loadWorkspaceData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Action refusée.');
    }
  };

  const handleQuickExport = async (format: 'csv' | 'json') => {
    try {
      const res = await apiClient.downloadExport(format, activeFilters, userRole);
      setExportModalData({
        filename: res.filename,
        format,
        content: res.content.replace(/^\uFEFF/, ''),
      });
      await loadWorkspaceData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Échec de l'export.");
    }
  };

  const handleExportVCard = (contact: Contact) => {
    const vcf = generateVCard(contact);
    const filename = `${contact.firstName.toLowerCase()}-${contact.lastName.toLowerCase()}.vcf`;
    triggerBrowserDownload(vcf, filename, 'text/vcard;charset=utf-8');
    setExportModalData({
      filename,
      format: 'vcf',
      content: vcf,
    });
  };

  // Multi-selection handlers
  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllDisplayed = () => {
    if (selectedIds.size === displayedContacts.length && displayedContacts.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedContacts.map((c) => c.id)));
    }
  };

  const handleBulkExportCsv = () => {
    const selectedList = allContacts.filter((c) => selectedIds.has(c.id));
    if (selectedList.length === 0) return;
    const csv = serializeContactsToCsv(selectedList);
    const filename = `selection-${selectedList.length}-contacts.csv`;
    triggerBrowserDownload(`\uFEFF${csv}`, filename, 'text/csv;charset=utf-8');
    setExportModalData({
      filename,
      format: 'csv',
      content: csv,
    });
  };

  const handleBulkFavorite = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      for (const id of ids) {
        await apiClient.updateContact(id, { favorite: true }, userRole);
      }
      showNotice(`${ids.length} contact(s) marqué(s) en favoris.`);
      setSelectedIds(new Set());
      await loadWorkspaceData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur lors du traitement groupé.');
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      for (const id of ids) {
        await apiClient.deleteContact(id, userRole);
      }
      showNotice(`${ids.length} contact(s) supprimé(s).`);
      setSelectedIds(new Set());
      await loadWorkspaceData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Suppression groupée refusée.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!contactPendingDelete) return;
    try {
      await apiClient.deleteContact(contactPendingDelete.id, userRole);
      showNotice(
        `Contact supprimé : ${contactPendingDelete.firstName} ${contactPendingDelete.lastName}`
      );
      if (selectedContactId === contactPendingDelete.id) {
        setSelectedContactId(null);
      }
      setContactPendingDelete(null);
      await loadWorkspaceData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Suppression refusée.');
      setContactPendingDelete(null);
    }
  };

  const handleMergeContacts = async (
    primaryId: string,
    secondaryId: string,
    overrides: Partial<ContactInput>
  ) => {
    await apiClient.mergeContacts(primaryId, secondaryId, overrides, userRole);
    await loadWorkspaceData();
  };

  const handleDeleteFromDuplicates = async (id: string) => {
    try {
      await apiClient.deleteContact(id, userRole);
      showNotice('Doublon supprimé avec succès.');
      await loadWorkspaceData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Suppression refusée.');
    }
  };

  const resetAllFilters = () => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setSearchMode(SearchMode.PARTIAL);
    setSearchField(SearchField.ALL);
    setSelectedCategory('all');
    setOnlyFavorites(false);
    setSelectedTag('all');
    setSelectedLetter('all');
    setSortBy('name_asc');
  };

  const handleImportSampleDataset = async () => {
    setIsImportingSample(true);
    setErrorMessage(null);
    try {
      if (allContacts.length === 0 && userRole === UserRole.ADMIN) {
        const res = await apiClient.resetDemoData(userRole);
        resetAllFilters();
        showNotice(`${res.message} (${res.count} contacts d'exemple chargés).`);
      } else {
        const sampleCsv = [
          'firstName,lastName,email,phone,company,jobTitle,category,tags,city,country,favorite,notes',
          'Éléonore,Vasseur,eleonore.vasseur@luminance-ai.fr,+33 6 44 55 66 77,Luminance Analytics,VP Data & IA,client,"vip;ia;cloud",Paris,France,true,Contrat cadre annuel signé.',
          'Marc-Antoine,Delacroix,ma.delacroix@helvetia-med.ch,+41 22 819 00 11,Helvetia MedTech,Directeur R&D,partenaire,"biotech;suisse",Genève,Suisse,true,Partenaire stratégique R&D.',
          'Sonia,Benali,s.benali@greengrid-energy.eu,+32 2 588 44 10,GreenGrid Europe,Responsable Achats,fournisseur,"energie;esg",Bruxelles,Belgique,false,Fournisseur infrastructure verte.',
          'Gaspard,Lemoine,gaspard.lemoine@fintech-horizon.fr,06 78 91 02 34,Fintech Horizon,Directeur Financier,prospect,"finance;q4",Lyon,France,false,Démonstration produit planifiée.',
        ].join('\n');

        const report = await apiClient.importContacts(
          {
            format: 'csv',
            content: sampleCsv,
            dryRun: false,
            duplicateStrategy: 'update',
          },
          userRole
        );
        resetAllFilters();
        showNotice(
          `Exemples importés avec succès : ${report.importedCount} créé(s), ${report.updatedCount} mis à jour.`
        );
      }
      await loadWorkspaceData();
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Impossible d'importer les exemples (vérifiez que votre rôle RBAC est admin ou editor)."
      );
    } finally {
      setIsImportingSample(false);
    }
  };

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    searchMode !== SearchMode.PARTIAL ||
    searchField !== SearchField.ALL ||
    selectedCategory !== 'all' ||
    onlyFavorites ||
    selectedTag !== 'all' ||
    selectedLetter !== 'all';

  const inspectedCompleteness = inspectedContact
    ? computeContactCompleteness(inspectedContact)
    : 100;
  const isInlineNotesDirty =
    inspectedContact && inlineNotesDraft.trim() !== (inspectedContact.notes || '').trim();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      {/* Mandatory 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#repertoire"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('directory');
          }}
          className="shrink-0 text-lg font-bold tracking-tight whitespace-nowrap text-slate-900 dark:text-slate-100"
        >
          Veridian Contacts
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav
          aria-label="Navigation principale"
          className="flex items-center gap-6 overflow-x-auto text-sm font-medium text-slate-600 dark:text-slate-400"
        >
          <button
            type="button"
            onClick={() => setActiveTab('directory')}
            className={`shrink-0 border-b-2 py-1 whitespace-nowrap transition-colors ${
              activeTab === 'directory'
                ? 'border-slate-900 font-semibold text-slate-900 dark:border-emerald-400 dark:text-slate-100'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Répertoire ({allContacts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('duplicates')}
            className={`shrink-0 border-b-2 py-1 whitespace-nowrap transition-colors ${
              activeTab === 'duplicates'
                ? 'border-slate-900 font-semibold text-slate-900 dark:border-emerald-400 dark:text-slate-100'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Doublons ({duplicates.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import_export')}
            className={`shrink-0 border-b-2 py-1 whitespace-nowrap transition-colors ${
              activeTab === 'import_export'
                ? 'border-slate-900 font-semibold text-slate-900 dark:border-emerald-400 dark:text-slate-100'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Import &amp; Export
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`shrink-0 border-b-2 py-1 whitespace-nowrap transition-colors ${
              activeTab === 'audit'
                ? 'border-slate-900 font-semibold text-slate-900 dark:border-emerald-400 dark:text-slate-100'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Journal d&apos;Audit ({auditLogs.length})
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => {
              setEditingContact(null);
              setIsFormModalOpen(true);
            }}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium whitespace-nowrap text-white transition-colors hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" />
            <span>Nouveau Contact</span>
          </button>
        </div>
      </header>

      {/* Secondary Workspace Context & Utility Bar */}
      <div className="border-b border-slate-200 bg-white/80 px-6 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-400">
            <span className="font-medium text-slate-900 dark:text-slate-200">
              Annuaire Professionnel
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {stats.companiesCount} organisations · {stats.countriesCount} pays
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Qualité des fiches : {stats.avgCompleteness}%
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Profile Selector */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="workspace-role-select" className="text-slate-500 dark:text-slate-400">
                Profil :
              </label>
              <select
                id="workspace-role-select"
                value={userRole}
                onChange={(e) => setUserRole(e.target.value as UserRole)}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value={UserRole.ADMIN}>Administrateur</option>
                <option value={UserRole.EDITOR}>Éditeur</option>
                <option value={UserRole.VIEWER}>Lecteur seul</option>
              </select>
            </div>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label="Basculer le thème clair ou sombre"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              <span>{darkMode ? 'Mode Clair' : 'Mode Sombre'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="mx-auto max-w-[1440px] px-6 py-6">
        {/* Interactive KPI Strip + Category Distribution Bar */}
        <section
          aria-label="Indicateurs clés du carnet de contacts"
          className="mb-6 space-y-3"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => {
                setActiveTab('directory');
                resetAllFilters();
              }}
              className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
            >
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Contacts enregistrés
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
                  {allContacts.length}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {stats.companiesCount} organisations · {stats.countriesCount} pays
                </div>
              </div>
              <Users className="h-5 w-5 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('directory');
                setOnlyFavorites((f) => !f);
              }}
              className={`flex items-start justify-between rounded-xl border p-4 text-left transition-colors ${
                onlyFavorites && activeTab === 'directory'
                  ? 'border-amber-400 bg-amber-50/40 dark:border-amber-500/70 dark:bg-amber-950/20'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
              }`}
            >
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Contacts favoris &amp; VIP
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
                  {stats.favoritesCount}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {onlyFavorites
                    ? 'Filtre favoris actif (cliquer pour tout voir)'
                    : 'Cliquer pour filtrer les favoris'}
                </div>
              </div>
              <Star
                className={`h-5 w-5 ${
                  onlyFavorites ? 'fill-amber-400 text-amber-500' : 'text-amber-500'
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('duplicates')}
              className={`flex items-start justify-between rounded-xl border p-4 text-left transition-colors ${
                activeTab === 'duplicates'
                  ? 'border-slate-900 bg-white dark:border-emerald-500 dark:bg-slate-900'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
              }`}
            >
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Doublons détectés
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
                  {duplicates.length}
                </div>
                <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  {duplicates.length > 0
                    ? 'Examiner et fusionner en 1 clic →'
                    : 'Aucune anomalie d’homonymie'}
                </div>
              </div>
              <GitMerge className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('import_export')}
              className={`flex items-start justify-between rounded-xl border p-4 text-left transition-colors ${
                activeTab === 'import_export'
                  ? 'border-slate-900 bg-white dark:border-emerald-500 dark:bg-slate-900'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
              }`}
            >
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Import &amp; Export
                </div>
                <div className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
                  CSV · JSON · vCard
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Importer ou exporter vos fiches →
                </div>
              </div>
              <Download className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </button>
          </div>

          {/* Interactive Recharts Category Donut Chart in Directory Header */}
          <CategoryDonutChart
            categoryCounts={stats.categoryCounts}
            totalContacts={allContacts.length}
            selectedCategory={selectedCategory}
            avgCompleteness={stats.avgCompleteness}
            onSelectCategory={(category) => {
              setActiveTab('directory');
              setSelectedCategory(category);
            }}
            onImportSampleDataset={handleImportSampleDataset}
          />
        </section>

        {/* Toast & Error Banners */}
        {toastMessage && (
          <div
            role="status"
            className="mb-5 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
          >
            <span>{toastMessage}</span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="ml-4 text-emerald-700 hover:text-emerald-950 dark:text-emerald-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mb-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="ml-4 text-red-700 hover:text-red-950 dark:text-red-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Quick Export Preview Banner when triggered from Directory */}
        {exportModalData && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Export généré avec succès :{' '}
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">
                    {exportModalData.filename}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Le téléchargement a été déclenché. Vous pouvez aussi inspecter ou copier le contenu
                  ci-dessous :
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyText(exportModalData.content, 'export-modal')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-emerald-600"
                >
                  {copiedKey === 'export-modal' ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Copié !</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copier dans le presse-papiers</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setExportModalData(null)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Fermer
                </button>
              </div>
            </div>
            <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
              {exportModalData.content}
            </pre>
          </div>
        )}

        {/* TAB 1: DIRECTORY */}
        {activeTab === 'directory' && (
          <div className="space-y-5">
            {/* Search & Multi-Criteria Filter Bar */}
            <section
              aria-label="Recherche et filtres"
              className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Search Input with keyboard shortcut hint */}
                <div className="lg:col-span-5">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <label
                      htmlFor="contact-search-input"
                      className="font-medium text-slate-700 dark:text-slate-300"
                    >
                      Rechercher un contact (nom, email, téléphone, entreprise, ville)
                    </label>
                    <span className="font-mono text-[11px] text-slate-400">Raccourci : /</span>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      ref={searchInputRef}
                      id="contact-search-input"
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={
                        searchMode === SearchMode.EXACT
                          ? 'Correspondance exacte (ex. camille.moreau@atelier-veridian.fr)...'
                          : 'Recherche rapide (ex. Moreau, +33 6, Genève, biotech)...'
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-4 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-400"
                    />
                  </div>
                </div>

                {/* Exact vs Partial Mode Toggle */}
                <div className="lg:col-span-3">
                  <span className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Mode de correspondance
                  </span>
                  <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => setSearchMode(SearchMode.PARTIAL)}
                      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                        searchMode === SearchMode.PARTIAL
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      Partielle (Contient)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSearchMode(SearchMode.EXACT)}
                      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                        searchMode === SearchMode.EXACT
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      Exacte (Stricte)
                    </button>
                  </div>
                </div>

                {/* Field Target Selector */}
                <div className="lg:col-span-2">
                  <label
                    htmlFor="search-field-select"
                    className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Champ ciblé
                  </label>
                  <select
                    id="search-field-select"
                    value={searchField}
                    onChange={(e) => setSearchField(e.target.value as SearchField)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value={SearchField.ALL}>Tous les champs</option>
                    <option value={SearchField.NAME}>Nom &amp; Prénom</option>
                    <option value={SearchField.EMAIL}>Adresse Email</option>
                    <option value={SearchField.PHONE}>Téléphone</option>
                    <option value={SearchField.COMPANY}>Entreprise</option>
                  </select>
                </div>

                {/* Sort Selector */}
                <div className="lg:col-span-2">
                  <label
                    htmlFor="sort-by-select"
                    className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Tri du répertoire
                  </label>
                  <select
                    id="sort-by-select"
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(
                        e.target.value as 'name_asc' | 'name_desc' | 'recent' | 'company_asc'
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  >
                    <option value="name_asc">Nom (A → Z)</option>
                    <option value="name_desc">Nom (Z → A)</option>
                    <option value="company_asc">Entreprise (A → Z)</option>
                    <option value="recent">Récemment modifiés</option>
                  </select>
                </div>
              </div>

              {/* Second Filter Row: Interactive Category Segmented Controls, Tag Filter, 3-Mode View Switcher, Quick Export */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Category Segmented Filter Buttons with counts */}
                  <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                    {Object.entries(CATEGORY_LABELS).map(([catKey, catLabel]) => {
                      const count = stats.categoryCounts[catKey] || 0;
                      return (
                        <button
                          key={catKey}
                          type="button"
                          onClick={() => setSelectedCategory(catKey)}
                          className={`rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                            selectedCategory === catKey
                              ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                          }`}
                        >
                          {catLabel}{' '}
                          <span className="font-mono text-[11px] opacity-70 tabular-nums">
                            ({count})
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Tag dropdown */}
                  <select
                    aria-label="Filtrer par étiquette"
                    value={selectedTag}
                    onChange={(e) => setSelectedTag(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <option value="all">Toutes les étiquettes ({availableTags.length})</option>
                    {availableTags.map((tag) => (
                      <option key={tag} value={tag}>
                        #{tag}
                      </option>
                    ))}
                  </select>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-slate-600 underline hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Réinitialiser</span>
                    </button>
                  )}
                </div>

                {/* 3-Way View Mode Toggle (Tableau / Cartes / Organisations) + Quick Export */}
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  <span className="font-mono text-slate-500 tabular-nums dark:text-slate-400">
                    {displayedContacts.length} sur {allContacts.length} affiché(s)
                  </span>

                  <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => setViewMode('table')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                        viewMode === 'table'
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      <List className="h-3.5 w-3.5" />
                      <span>Tableau</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('grid')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                        viewMode === 'grid'
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      <span>Cartes</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('companies')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                        viewMode === 'companies'
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      <span>Organisations</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleQuickExport('csv')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Exporter CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickExport('json')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium whitespace-nowrap text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Exporter JSON</span>
                  </button>
                </div>
              </div>

              {/* Alphabetical A-Z Quick Filter Bar */}
              <div className="mt-3 flex items-center gap-1 overflow-x-auto border-t border-slate-100 pt-3 text-xs dark:border-slate-800/70">
                <button
                  type="button"
                  onClick={() => setSelectedLetter('all')}
                  className={`rounded px-2 py-1 font-medium whitespace-nowrap transition-colors ${
                    selectedLetter === 'all'
                      ? 'bg-slate-900 text-white dark:bg-emerald-600'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  A–Z Tous
                </button>
                {ALPHABET.map((letter) => {
                  const hasItems = activeLettersSet.has(letter);
                  const isActive = selectedLetter === letter;
                  return (
                    <button
                      key={letter}
                      type="button"
                      disabled={!hasItems && !isActive}
                      onClick={() => setSelectedLetter(isActive ? 'all' : letter)}
                      className={`h-7 w-7 shrink-0 rounded font-mono text-xs transition-colors ${
                        isActive
                          ? 'bg-slate-900 font-bold text-white dark:bg-emerald-600'
                          : hasItems
                            ? 'font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                            : 'cursor-not-allowed text-slate-300 dark:text-slate-700'
                      }`}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Bulk Action Bar when contacts are checked */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-300 bg-slate-900 px-5 py-3 text-xs text-white dark:border-emerald-700 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold tabular-nums">
                    {selectedIds.size} contact(s) sélectionné(s)
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-slate-300 underline hover:text-white"
                  >
                    Tout désélectionner
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleBulkExportCsv}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 font-medium text-white hover:bg-white/20"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Exporter la sélection (CSV)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkFavorite}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 font-medium text-white hover:bg-white/20"
                  >
                    <Star className="h-3.5 w-3.5" />
                    <span>Ajouter aux favoris</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Supprimer la sélection</span>
                  </button>
                </div>
              </div>
            )}

            {/* Main Directory Grid + Side Inspector */}
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
              <div className={`${inspectedContact ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
                {isLoading ? (
                  /* Skeleton Loading State */
                  <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white p-6 dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div key={n} className="flex items-center justify-between py-4">
                        <div className="space-y-2">
                          <div className="h-4 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                          <div className="h-3 w-72 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
                        </div>
                        <div className="h-4 w-28 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                      </div>
                    ))}
                  </div>
                ) : displayedContacts.length === 0 ? (
                  /* Engaging Vector Empty State with 1-Click Sample Import */
                  <DirectoryEmptyState
                    isDatabaseEmpty={allContacts.length === 0}
                    hasActiveFilters={hasActiveFilters}
                    searchQuery={searchQuery}
                    isExactMode={searchMode === SearchMode.EXACT}
                    selectedCategory={selectedCategory}
                    selectedLetter={selectedLetter}
                    isImportingSample={isImportingSample}
                    onResetFilters={resetAllFilters}
                    onSwitchToPartialSearch={() => setSearchMode(SearchMode.PARTIAL)}
                    onCreateContact={() => {
                      setEditingContact(null);
                      setIsFormModalOpen(true);
                    }}
                    onImportSampleDataset={handleImportSampleDataset}
                    onOpenImportWizard={() => setActiveTab('import_export')}
                  />
                ) : viewMode === 'table' ? (
                  /* High-Density Data Table View */
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                            <th className="w-10 py-3 pl-4">
                              <input
                                type="checkbox"
                                aria-label="Sélectionner tous les contacts affichés"
                                checked={
                                  displayedContacts.length > 0 &&
                                  selectedIds.size === displayedContacts.length
                                }
                                onChange={toggleSelectAllDisplayed}
                                className="h-3.5 w-3.5 rounded border-slate-300"
                              />
                            </th>
                            <th className="w-9 py-3" aria-label="Favori" />
                            <th className="px-4 py-3 font-medium">Contact &amp; Fonction</th>
                            <th className="px-4 py-3 font-medium">Coordonnées</th>
                            <th className="px-4 py-3 font-medium">Organisation &amp; Catégorie</th>
                            <th className="px-5 py-3 text-right font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          {displayedContacts.map((contact) => {
                            const isSelected = inspectedContact?.id === contact.id;
                            const isChecked = selectedIds.has(contact.id);
                            const hasDup = duplicateContactIds.has(contact.id);

                            return (
                              <tr
                                key={contact.id}
                                onClick={() => setSelectedContactId(contact.id)}
                                className={`cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-slate-100/90 dark:bg-slate-800/75'
                                    : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/40'
                                }`}
                              >
                                <td
                                  className="py-3.5 pl-4"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    aria-label={`Sélectionner ${contact.firstName} ${contact.lastName}`}
                                    checked={isChecked}
                                    onChange={() => toggleSelectId(contact.id)}
                                    className="h-3.5 w-3.5 rounded border-slate-300"
                                  />
                                </td>

                                <td
                                  className="py-3.5"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleFavorite(contact);
                                  }}
                                >
                                  <button
                                    type="button"
                                    aria-label={`Favori ${contact.firstName} ${contact.lastName}`}
                                    className="rounded p-1 text-slate-400 hover:text-amber-500"
                                  >
                                    <Star
                                      className={`h-4 w-4 ${
                                        contact.favorite
                                          ? 'fill-amber-400 text-amber-400'
                                          : 'text-slate-300 dark:text-slate-600'
                                      }`}
                                    />
                                  </button>
                                </td>

                                {/* Identity with Initials Avatar */}
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${getAvatarTone(
                                        contact.category
                                      )}`}
                                    >
                                      {getInitials(contact.firstName, contact.lastName)}
                                    </div>
                                    <div>
                                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                                        {contact.firstName} {contact.lastName}
                                      </div>
                                      <div className="mt-0.5 text-slate-500 dark:text-slate-400">
                                        <span>{contact.jobTitle || 'Fonction non renseignée'}</span>
                                        {hasDup && (
                                          <>
                                            <span className="mx-1.5" aria-hidden="true">
                                              ·
                                            </span>
                                            <span className="font-medium text-amber-700 dark:text-amber-400">
                                              Doublon détecté
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                {/* Email & Phone with 1-click copy */}
                                <td
                                  className="px-4 py-3.5 font-mono tabular-nums"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCopyText(contact.email, `email-${contact.id}`)
                                      }
                                      title="Cliquer pour copier l'email"
                                      className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-slate-200/60 dark:hover:bg-slate-800"
                                    >
                                      <span>{contact.email}</span>
                                      {copiedKey === `email-${contact.id}` ? (
                                        <Check className="h-3 w-3 text-emerald-600" />
                                      ) : (
                                        <Copy className="h-3 w-3 opacity-40 hover:opacity-100" />
                                      )}
                                    </button>
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-1.5 pl-1 text-slate-500 dark:text-slate-400">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCopyText(
                                          contact.phone,
                                          `phone-${contact.id}`
                                        )
                                      }
                                      title="Cliquer pour copier le numéro"
                                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-200"
                                    >
                                      <span>{contact.phone}</span>
                                      {copiedKey === `phone-${contact.id}` && (
                                        <span className="text-[10px] font-semibold text-emerald-600">
                                          Copié
                                        </span>
                                      )}
                                    </button>
                                  </div>
                                </td>

                                {/* Zero-Pill Metadata Column */}
                                <td className="px-4 py-3.5">
                                  <div className="font-medium text-slate-800 dark:text-slate-200">
                                    {contact.company || 'Indépendant'}
                                  </div>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-slate-500 dark:text-slate-400">
                                    <span className="capitalize">{contact.category}</span>
                                    {contact.city && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span>{contact.city}</span>
                                      </>
                                    )}
                                    {contact.tags.length > 0 && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                          {contact.tags.map((t) => `#${t}`).join(' ')}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </td>

                                {/* Row Actions */}
                                <td
                                  className="px-5 py-3.5 text-right whitespace-nowrap"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      aria-label={`Modifier ${contact.firstName} ${contact.lastName}`}
                                      onClick={() => {
                                        setEditingContact(contact);
                                        setIsFormModalOpen(true);
                                      }}
                                      className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                                    >
                                      <Edit3 className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label={`Supprimer ${contact.firstName} ${contact.lastName}`}
                                      onClick={() => setContactPendingDelete(contact)}
                                      className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-red-100 hover:text-red-700 dark:text-slate-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : viewMode === 'grid' ? (
                  /* Business Card Grid View */
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {displayedContacts.map((contact) => {
                      const isSelected = inspectedContact?.id === contact.id;
                      const hasDup = duplicateContactIds.has(contact.id);

                      return (
                        <div
                          key={contact.id}
                          onClick={() => setSelectedContactId(contact.id)}
                          className={`cursor-pointer rounded-xl border bg-white p-5 transition-colors dark:bg-slate-900 ${
                            isSelected
                              ? 'border-slate-900 dark:border-emerald-500'
                              : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold ${getAvatarTone(
                                  contact.category
                                )}`}
                              >
                                {getInitials(contact.firstName, contact.lastName)}
                              </div>
                              <div>
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {contact.firstName} {contact.lastName}
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {contact.jobTitle || 'Sans titre'} ·{' '}
                                  {contact.company || 'Indépendant'}
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleFavorite(contact);
                              }}
                              aria-label="Basculer favori"
                              className="rounded p-1 text-slate-400 hover:text-amber-500"
                            >
                              <Star
                                className={`h-4 w-4 ${
                                  contact.favorite
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-slate-300 dark:text-slate-600'
                                }`}
                              />
                            </button>
                          </div>

                          <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 font-mono text-xs tabular-nums dark:border-slate-800/80">
                            <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                              <span className="truncate">{contact.email}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyText(contact.email, `card-email-${contact.id}`);
                                }}
                                className="ml-2 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                              >
                                {copiedKey === `card-email-${contact.id}` ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                              <span>
                                {contact.phone} · {contact.phoneNormalized}
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800/80 dark:text-slate-400">
                            <div>
                              <span className="capitalize">{contact.category}</span>
                              {contact.city && ` · ${contact.city}`}
                              {hasDup && (
                                <span className="ml-1.5 font-medium text-amber-700 dark:text-amber-400">
                                  · Doublon
                                </span>
                              )}
                            </div>
                            <div
                              className="flex items-center gap-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingContact(contact);
                                  setIsFormModalOpen(true);
                                }}
                                className="font-medium text-slate-700 hover:underline dark:text-slate-300"
                              >
                                Modifier
                              </button>
                              <span aria-hidden="true">·</span>
                              <button
                                type="button"
                                onClick={() => setContactPendingDelete(contact)}
                                className="font-medium text-red-600 hover:underline dark:text-red-400"
                              >
                                Supprimer
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* View Mode 3: Grouped by Organization (Entreprises) */
                  <div className="space-y-4">
                    {groupedByCompany.map(([companyName, members]) => (
                      <div
                        key={companyName}
                        className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                      >
                        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                          <div className="flex items-center gap-2.5">
                            <Building2 className="h-4 w-4 text-slate-400" />
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {companyName}
                            </h3>
                          </div>
                          <span className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                            {members.length} interlocuteur(s) · {members[0]?.city || 'France'}
                          </span>
                        </div>
                        <div className="divide-y divide-slate-200 dark:divide-slate-800">
                          {members.map((member) => {
                            const isSelected = inspectedContact?.id === member.id;
                            return (
                              <div
                                key={member.id}
                                onClick={() => setSelectedContactId(member.id)}
                                className={`flex cursor-pointer flex-wrap items-center justify-between gap-4 px-5 py-3 text-xs transition-colors ${
                                  isSelected
                                    ? 'bg-slate-100/90 dark:bg-slate-800/70'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${getAvatarTone(
                                      member.category
                                    )}`}
                                  >
                                    {getInitials(member.firstName, member.lastName)}
                                  </div>
                                  <div>
                                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                                      {member.firstName} {member.lastName}
                                    </div>
                                    <div className="text-slate-500 dark:text-slate-400">
                                      {member.jobTitle || 'Collaborateur'} ·{' '}
                                      <span className="capitalize">{member.category}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="font-mono text-slate-600 tabular-nums dark:text-slate-300">
                                  {member.email} · {member.phone}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Interactive Contact Inspector Panel */}
              {inspectedContact && (
                <aside
                  aria-label="Détails du contact sélectionné"
                  className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-mono text-base font-bold ${getAvatarTone(
                          inspectedContact.category
                        )}`}
                      >
                        {getInitials(inspectedContact.firstName, inspectedContact.lastName)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            {inspectedContact.firstName} {inspectedContact.lastName}
                          </h2>
                          <button
                            type="button"
                            onClick={() => handleToggleFavorite(inspectedContact)}
                            aria-label="Favori"
                          >
                            <Star
                              className={`h-4 w-4 ${
                                inspectedContact.favorite
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-slate-300 dark:text-slate-600'
                              }`}
                            />
                          </button>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {inspectedContact.jobTitle || 'Sans fonction'} ·{' '}
                          {inspectedContact.company || 'Indépendant'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedContactId(null)}
                      aria-label="Fermer le panneau détail"
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Profile Completeness Indicator */}
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Complétude de la fiche :</span>
                    <span className="font-mono font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                      {inspectedCompleteness}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      style={{ width: `${inspectedCompleteness}%` }}
                      className="h-full bg-emerald-600 transition-all dark:bg-emerald-500"
                    />
                  </div>

                  {/* Quick Contact Action Strip */}
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyText(inspectedContact.email, 'inspector-email')}
                      className="flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {copiedKey === 'inspector-email' ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Mail className="h-4 w-4 text-slate-500" />
                      )}
                      <span>
                        {copiedKey === 'inspector-email' ? 'Email copié !' : 'Copier Email'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(
                          inspectedContact.phoneNormalized || inspectedContact.phone,
                          'inspector-phone'
                        )
                      }
                      className="flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {copiedKey === 'inspector-phone' ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Phone className="h-4 w-4 text-slate-500" />
                      )}
                      <span>{copiedKey === 'inspector-phone' ? 'N° copié !' : 'Copier Tél.'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExportVCard(inspectedContact)}
                      className="flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <FileText className="h-4 w-4 text-slate-500" />
                      <span>Fiche vCard</span>
                    </button>
                  </div>

                  {/* Detailed Attributes */}
                  <dl className="mt-5 space-y-3.5 border-t border-slate-200 pt-4 text-xs dark:border-slate-800">
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Adresse email</dt>
                      <dd className="mt-0.5 font-mono font-medium text-slate-900 dark:text-slate-100">
                        {inspectedContact.email}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Téléphone</dt>
                      <dd className="mt-0.5 font-mono text-slate-900 tabular-nums dark:text-slate-100">
                        {inspectedContact.phone}
                      </dd>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <dt className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          <Building2 className="h-3.5 w-3.5" />
                          <span>Catégorie</span>
                        </dt>
                        <dd className="mt-1">
                          <select
                            aria-label="Changer la catégorie du contact"
                            value={inspectedContact.category}
                            onChange={(e) =>
                              handleInlineCategoryChange(
                                inspectedContact,
                                e.target.value as ContactCategory
                              )
                            }
                            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium capitalize focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
                          >
                            {Object.values(ContactCategory).map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </dd>
                      </div>
                      <div>
                        <dt className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          <MapPin className="h-3.5 w-3.5" />
                          <span>Localisation</span>
                        </dt>
                        <dd className="mt-1.5 font-medium text-slate-800 dark:text-slate-200">
                          {inspectedContact.city || 'Ville N/A'} · {inspectedContact.country}
                        </dd>
                      </div>
                    </div>

                    {/* Interactive Tags with Quick Add */}
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        Étiquettes (cliquer sur × pour retirer)
                      </dt>
                      <dd className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {inspectedContact.tags.length > 0 ? (
                          inspectedContact.tags.map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center gap-1 border-b border-slate-300 pb-0.5 dark:border-slate-700"
                            >
                              <span>#{t}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveTag(inspectedContact, t)}
                                aria-label={`Retirer l'étiquette ${t}`}
                                className="text-slate-400 hover:text-red-600"
                              >
                                ×
                              </button>
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400">Aucune étiquette</span>
                        )}
                      </dd>

                      <form onSubmit={handleAddQuickTag} className="mt-2 flex gap-1.5">
                        <input
                          type="text"
                          value={quickTagInput}
                          onChange={(e) => setQuickTagInput(e.target.value)}
                          placeholder="Ajouter une étiquette (ex. prioritaire)..."
                          className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs focus:border-slate-900 focus:outline-none dark:border-slate-700 dark:bg-slate-950"
                        />
                        <button
                          type="submit"
                          className="rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          + Ajouter
                        </button>
                      </form>
                    </div>

                    {/* Inline Editable Notes */}
                    <div>
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="inspector-inline-notes"
                          className="text-slate-500 dark:text-slate-400"
                        >
                          Notes métier (Édition rapide)
                        </label>
                        {isInlineNotesDirty && (
                          <button
                            type="button"
                            disabled={isSavingInlineNotes}
                            onClick={handleSaveInlineNotes}
                            className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                          >
                            <Save className="h-3 w-3" />
                            <span>
                              {isSavingInlineNotes ? 'Sauvegarde...' : 'Enregistrer la note'}
                            </span>
                          </button>
                        )}
                      </div>
                      <textarea
                        id="inspector-inline-notes"
                        rows={3}
                        value={inlineNotesDraft}
                        onChange={(e) => setInlineNotesDraft(e.target.value)}
                        placeholder="Saisissez vos notes d'échange ou de suivi..."
                        className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs text-slate-800 focus:border-slate-900 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200"
                      />
                    </div>

                    {/* Colleagues in the same organization */}
                    {colleaguesInSameCompany.length > 0 && (
                      <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
                        <dt className="text-slate-500 dark:text-slate-400">
                          Autres contacts chez {inspectedContact.company} (
                          {colleaguesInSameCompany.length})
                        </dt>
                        <dd className="mt-1.5 space-y-1">
                          {colleaguesInSameCompany.map((col) => (
                            <button
                              key={col.id}
                              type="button"
                              onClick={() => setSelectedContactId(col.id)}
                              className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {col.firstName} {col.lastName}
                              </span>
                              <span className="font-mono text-[11px] text-slate-500">
                                {col.jobTitle || col.email}
                              </span>
                            </button>
                          ))}
                        </dd>
                      </div>
                    )}

                    <div className="border-t border-slate-200 pt-3 text-[11px] text-slate-400 tabular-nums dark:border-slate-800">
                      <div>
                        Dernière modification :{' '}
                        {inspectedContact.updatedAt.replace('T', ' ').slice(0, 16)}
                      </div>
                    </div>
                  </dl>

                  {/* Primary Inspector Actions */}
                  <div className="mt-5 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingContact(inspectedContact);
                          setIsFormModalOpen(true);
                        }}
                        className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                      >
                        Modifier la fiche complète
                      </button>
                      <button
                        type="button"
                        onClick={() => setContactPendingDelete(inspectedContact)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
                      >
                        Supprimer
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCreateTestDuplicateFromContact(inspectedContact)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>Cloner pour tester la détection de doublons</span>
                    </button>
                  </div>
                </aside>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: DUPLICATES */}
        {activeTab === 'duplicates' && (
          <DuplicatesView
            duplicates={duplicates}
            onMerge={handleMergeContacts}
            onDeleteContact={handleDeleteFromDuplicates}
            onCreateTestDuplicate={async () => {
              const base = allContacts[0];
              if (base) {
                await handleCreateTestDuplicateFromContact(base);
              }
            }}
          />
        )}

        {/* TAB 3: IMPORT & EXPORT */}
        {activeTab === 'import_export' && (
          <ImportExportView
            activeFilters={activeFilters}
            totalContactsCount={allContacts.length}
            filteredContactsCount={displayedContacts.length}
            role={userRole}
            storageStatus={storageStatus}
            onDataChanged={loadWorkspaceData}
          />
        )}

        {/* TAB 4: AUDIT LOG */}
        {activeTab === 'audit' && (
          <AuditLogView
            logs={auditLogs}
            currentRole={userRole}
            onRoleChange={setUserRole}
            onReplaySearch={(query) => {
              setSearchQuery(query);
              setDebouncedSearchQuery(query);
              setActiveTab('directory');
            }}
          />
        )}
      </main>

      {/* Clean End-to-End Authorship Footer */}
      <footer className="mt-10 border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3">
          <div>
            <strong className="font-semibold text-slate-900 dark:text-slate-200">
              Veridian Contacts
            </strong>{' '}
            · Projet conçu et réalisé de bout en bout par{' '}
            <strong className="font-semibold text-slate-900 dark:text-slate-100">
              Mendel Temgoua
            </strong>
          </div>
          <div className="text-slate-400">Gestionnaire de contacts professionnel</div>
        </div>
      </footer>

      {/* Create / Edit Contact Modal */}
      <ContactFormModal
        isOpen={isFormModalOpen}
        initialContact={editingContact}
        existingContacts={allContacts}
        onClose={() => setIsFormModalOpen(false)}
        onSubmit={handleSaveContact}
      />

      {/* Delete Confirmation Modal (replaces window.confirm) */}
      {contactPendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <h3
              id="delete-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Confirmer la suppression
            </h3>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              Voulez-vous vraiment supprimer la fiche de{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {contactPendingDelete.firstName} {contactPendingDelete.lastName}
              </strong>{' '}
              ({contactPendingDelete.email}) ? Cette action est enregistrée dans le journal
              d&apos;activité.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setContactPendingDelete(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700"
              >
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
