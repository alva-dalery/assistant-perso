import React, { useMemo, useState } from "react";
import {
  History,
  RotateCcw,
  Trash2,
  Check,
  ArrowUpRight,
  Search,
  Sparkles,
} from "lucide-react";
import type { CommandHistoryEntry, ModuleType } from "@/types";

interface HistoriqueModuleProps {
  entries: CommandHistoryEntry[];
  onUndoEntry: (entryId: string) => void;
  onClearHistory: () => void;
  onNavigate: (module: ModuleType) => void;
}

type StatusFilter = "all" | "active" | "undone";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const timeStr = date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (sameDay) return `Aujourd'hui à ${timeStr}`;

  const dateStr = date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
  return `${dateStr} à ${timeStr}`;
}

export const HistoriqueModule: React.FC<HistoriqueModuleProps> = ({
  entries,
  onUndoEntry,
  onClearHistory,
  onNavigate,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const activeCount = useMemo(
    () => entries.filter((e) => !e.undoneAt).length,
    [entries]
  );
  const undoneCount = entries.length - activeCount;

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (statusFilter === "active" && entry.undoneAt) return false;
      if (statusFilter === "undone" && !entry.undoneAt) return false;
      if (!q) return true;
      return (
        entry.label.toLowerCase().includes(q) ||
        (entry.detail && entry.detail.toLowerCase().includes(q)) ||
        entry.moduleLabel.toLowerCase().includes(q) ||
        (entry.source && entry.source.toLowerCase().includes(q))
      );
    });
  }, [entries, statusFilter, query]);

  return (
    <div className="space-y-6 pb-8">
      {/* Header Banner */}
      <div className="bg-[#121316] text-white rounded-[2rem] p-6 md:p-8 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-[#f7b5d5] text-[11px] font-bold">
            <History className="h-3.5 w-3.5" />
            <span>Journal des manipulations</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Historique des commandes
          </h1>
          <p className="text-xs md:text-sm text-slate-300 max-w-xl">
            Retrouvez vos dernières actions (ajouts, suppressions, modifications, Brain Dump) et
            annulez n&apos;importe quelle manipulation en un clic.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-center">
            <p className="text-lg font-bold text-[#f7da64]">{activeCount}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Annulables</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-center">
            <p className="text-lg font-bold text-slate-200">{undoneCount}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Annulées</p>
          </div>

          {entries.length > 0 && (
            <div className="flex items-center gap-2">
              {confirmClear ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onClearHistory();
                      setConfirmClear(false);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition-colors"
                  >
                    Confirmer
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-3 py-2 rounded-xl bg-white/10 text-slate-200 text-xs font-medium hover:bg-white/20 transition-colors"
                  >
                    Annuler
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-medium transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Vider</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: "all", label: `Toutes (${entries.length})` },
              { id: "active", label: `Annulables (${activeCount})` },
              { id: "undone", label: `Annulées (${undoneCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                statusFilter === tab.id
                  ? "bg-[#121316] text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer l'historique..."
            className="w-full pl-8 pr-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#f7b5d5]"
          />
        </div>
      </div>

      {/* Command List */}
      {filteredEntries.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-10 text-center space-y-3 shadow-sm">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-[#FAF8F2] border border-slate-200 flex items-center justify-center text-slate-500">
            <History className="h-6 w-6" />
          </div>
          <h2 className="text-sm font-bold text-slate-900">
            {entries.length === 0
              ? "Aucune commande enregistrée pour le moment"
              : "Aucune commande ne correspond à ce filtre"}
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {entries.length === 0
              ? "Dès que vous ajoutez un rappel, modifiez un projet, cochez un article ou utilisez le Brain Dump, la manipulation apparaît ici."
              : "Essayez de réinitialiser la recherche ou de sélectionner « Toutes »."}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredEntries.map((entry) => {
            const isUndone = Boolean(entry.undoneAt);
            return (
              <div
                key={entry.id}
                className={`bg-white rounded-2xl border p-4 shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isUndone
                    ? "border-slate-200/70 opacity-70"
                    : "border-slate-200/90 hover:border-[#f7b5d5]"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${
                      isUndone ? "bg-slate-300" : "bg-[#f7b5d5]"
                    }`}
                  />
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className={`text-xs md:text-sm font-bold ${
                          isUndone ? "text-slate-500 line-through" : "text-slate-900"
                        }`}
                      >
                        {entry.label}
                      </p>
                      {entry.source === "Brain Dump" && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f7da64]/30 text-slate-800">
                          <Sparkles className="h-2.5 w-2.5" />
                          Brain Dump
                        </span>
                      )}
                    </div>

                    {entry.detail && (
                      <p className="text-[11px] text-slate-500 truncate">{entry.detail}</p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-400">
                      <span>{formatTimestamp(entry.timestamp)}</span>
                      <span>·</span>
                      <button
                        type="button"
                        onClick={() => onNavigate(entry.module)}
                        className="inline-flex items-center gap-0.5 font-semibold text-slate-600 hover:text-[#121316] hover:underline"
                      >
                        <span>{entry.moduleLabel}</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </button>
                      {isUndone && entry.undoneAt && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-700 font-medium">
                            Annulée ({formatTimestamp(entry.undoneAt)})
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end shrink-0">
                  {isUndone ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-bold">
                      <Check className="h-3.5 w-3.5" />
                      Annulée
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onUndoEntry(entry.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#121316] text-white hover:bg-[#f7b5d5] hover:text-[#121316] text-xs font-bold transition-colors shadow-sm"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Annuler</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
