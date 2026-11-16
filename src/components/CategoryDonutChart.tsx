import React, { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ContactCategory } from '../shared/types';

interface CategoryDonutChartProps {
  categoryCounts: Record<string, number>;
  totalContacts: number;
  selectedCategory: string;
  avgCompleteness: number;
  onSelectCategory: (category: string) => void;
  onImportSampleDataset?: () => void;
}

interface ChartDatum {
  category: ContactCategory;
  label: string;
  value: number;
  percentage: number;
  color: string;
}

const CATEGORY_META: Record<
  ContactCategory,
  { label: string; color: string; dotClass: string }
> = {
  [ContactCategory.CLIENT]: {
    label: 'Clients',
    color: '#059669', // emerald-600
    dotClass: 'bg-emerald-600 dark:bg-emerald-500',
  },
  [ContactCategory.PARTENAIRE]: {
    label: 'Partenaires',
    color: '#0284c7', // sky-600
    dotClass: 'bg-sky-600 dark:bg-sky-500',
  },
  [ContactCategory.FOURNISSEUR]: {
    label: 'Fournisseurs',
    color: '#f59e0b', // amber-500
    dotClass: 'bg-amber-500 dark:bg-amber-400',
  },
  [ContactCategory.PROSPECT]: {
    label: 'Prospects',
    color: '#7c3aed', // violet-600
    dotClass: 'bg-violet-600 dark:bg-violet-500',
  },
  [ContactCategory.INTERNE]: {
    label: 'Internes',
    color: '#334155', // slate-700
    dotClass: 'bg-slate-700 dark:bg-slate-400',
  },
  [ContactCategory.AUTRE]: {
    label: 'Autres',
    color: '#94a3b8', // slate-400
    dotClass: 'bg-slate-400 dark:bg-slate-500',
  },
};

export const CategoryDonutChart: React.FC<CategoryDonutChartProps> = ({
  categoryCounts,
  totalContacts,
  selectedCategory,
  avgCompleteness,
  onSelectCategory,
  onImportSampleDataset,
}) => {
  const [hoveredItem, setHoveredItem] = useState<ChartDatum | null>(null);

  const data: ChartDatum[] = useMemo(() => {
    if (totalContacts <= 0) return [];
    return Object.values(ContactCategory)
      .map((cat) => {
        const count = categoryCounts[cat] || 0;
        const pct = Math.round((count / totalContacts) * 100);
        return {
          category: cat,
          label: CATEGORY_META[cat].label,
          value: count,
          percentage: pct,
          color: CATEGORY_META[cat].color,
        };
      })
      .filter((item) => item.value > 0);
  }, [categoryCounts, totalContacts]);

  if (totalContacts === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-4">
          <svg
            viewBox="0 0 64 64"
            fill="none"
            className="h-14 w-14 shrink-0"
            aria-hidden="true"
          >
            <circle
              cx="32"
              cy="32"
              r="22"
              className="stroke-slate-200 dark:stroke-slate-800"
              strokeWidth="8"
            />
            <circle
              cx="32"
              cy="32"
              r="22"
              className="stroke-emerald-500/50"
              strokeWidth="8"
              strokeDasharray="34 110"
              strokeLinecap="round"
            />
          </svg>
          <div>
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Graphique analytique en attente de données
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Importez des contacts d&apos;exemple ou créez une fiche pour visualiser la répartition
              par catégorie avec Recharts.
            </p>
          </div>
        </div>
        {onImportSampleDataset && (
          <button
            type="button"
            onClick={onImportSampleDataset}
            className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            Charger les exemples B2B
          </button>
        )}
      </div>
    );
  }

  const activeDatum =
    hoveredItem ||
    (selectedCategory !== 'all'
      ? data.find((d) => d.category === selectedCategory) || null
      : null);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
        {/* Left: Interactive Recharts Donut Chart */}
        <div className="flex items-center gap-5 lg:col-span-5">
          <div
            className="relative h-36 w-36 shrink-0"
            aria-label="Graphique en anneau de la répartition des contacts par catégorie"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={44}
                  outerRadius={64}
                  paddingAngle={2}
                  strokeWidth={0}
                  onMouseEnter={(_, index) => {
                    if (data[index]) {
                      setHoveredItem(data[index]);
                    }
                  }}
                  onMouseLeave={() => setHoveredItem(null)}
                  onClick={(_, index) => {
                    const item = data[index];
                    if (item) {
                      onSelectCategory(
                        selectedCategory === item.category ? 'all' : item.category
                      );
                    }
                  }}
                >
                  {data.map((entry) => {
                    const isSelected =
                      selectedCategory === 'all' || selectedCategory === entry.category;
                    return (
                      <Cell
                        key={entry.category}
                        fill={entry.color}
                        fillOpacity={isSelected ? 1 : 0.28}
                        className="cursor-pointer transition-opacity outline-none"
                      />
                    );
                  })}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const item = payload[0].payload as ChartDatum;
                    return (
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span>{item.label}</span>
                        </div>
                        <div className="mt-1 font-mono text-slate-600 tabular-nums dark:text-slate-300">
                          {item.value} contact{item.value > 1 ? 's' : ''} ({item.percentage}%)
                        </div>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Center readout updated live on hover */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
                {activeDatum ? `${activeDatum.percentage}%` : totalContacts}
              </span>
              <span className="max-w-[76px] truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">
                {activeDatum ? activeDatum.label : 'Total'}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Répartition par catégorie
            </div>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Survolez l&apos;anneau pour inspecter chaque segment ou cliquez pour filtrer le
              répertoire instantanément.
            </p>
            <div className="pt-1 font-mono text-xs text-slate-600 tabular-nums dark:text-slate-300">
              {activeDatum ? (
                <span>
                  Segment actif :{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {activeDatum.label}
                  </strong>{' '}
                  · {activeDatum.value} fiche{activeDatum.value > 1 ? 's' : ''} (
                  {activeDatum.percentage}%)
                </span>
              ) : (
                <span>Indice qualité global des fiches : {avgCompleteness}%</span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Interactive Category Breakdown Grid */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:col-span-7">
          {Object.values(ContactCategory).map((cat) => {
            const count = categoryCounts[cat] || 0;
            const pct = totalContacts > 0 ? Math.round((count / totalContacts) * 100) : 0;
            const isSelected = selectedCategory === cat;
            const isHovered = hoveredItem?.category === cat;
            const meta = CATEGORY_META[cat];

            return (
              <button
                key={cat}
                type="button"
                onMouseEnter={() => {
                  if (count > 0) {
                    setHoveredItem({
                      category: cat,
                      label: meta.label,
                      value: count,
                      percentage: pct,
                      color: meta.color,
                    });
                  }
                }}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => onSelectCategory(isSelected ? 'all' : cat)}
                className={`flex flex-col justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  isSelected
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-100'
                    : isHovered
                      ? 'border-slate-400 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/70'
                      : 'border-slate-200 bg-slate-50/60 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-medium">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: meta.color }}
                    />
                    <span className="truncate">{meta.label}</span>
                  </span>
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      isSelected
                        ? 'text-slate-200 dark:text-emerald-300'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {pct}%
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="font-mono text-sm font-bold tabular-nums">{count}</span>
                  <span
                    className={`text-[11px] ${
                      isSelected
                        ? 'text-slate-300 dark:text-emerald-300/80'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    contact{count > 1 ? 's' : ''}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
