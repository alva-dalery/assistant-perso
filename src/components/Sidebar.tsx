import React, { useMemo, useRef, useState } from "react";
import {
  LayoutDashboard,
  Mail,
  Shirt,
  Brain,
  ShoppingBag,
  Dumbbell,
  Scale,
  FolderGit2,
  Settings,
  ChevronLeft,
  ChevronRight,
  Focus,
  PlusCircle,
  BookOpen,
  History,
  Search,
  User,
  Bell,
  X,
  ArrowUpRight,
} from "lucide-react";
import type { ModuleType, EnergyLevel, GlobalSearchResult } from "@/types";

const FILTER_TAGS = [
  "Tous",
  "Rappels",
  "Projets",
  "Litiges",
  "Food",
  "Dressing",
  "Santé",
  "Sport",
  "Culture",
  "Secrétariat",
];

interface SidebarProps {
  currentModule: ModuleType;
  onSelectModule: (module: ModuleType) => void;
  pendingEmailsCount: number;
  urgentDisputesCount: number;
  undoableHistoryCount?: number;
  searchItems?: GlobalSearchResult[];
  energy: EnergyLevel;
  onSetEnergy: (energy: EnergyLevel) => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  onOpenBrainDump: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentModule,
  onSelectModule,
  pendingEmailsCount,
  urgentDisputesCount,
  undoableHistoryCount = 0,
  searchItems = [],
  energy,
  onSetEnergy,
  focusMode,
  onToggleFocusMode,
  onOpenBrainDump,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("Tous");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byTag =
      activeFilter === "Tous"
        ? searchItems
        : searchItems.filter(
            (item) => item.moduleLabel.toLowerCase() === activeFilter.toLowerCase()
          );

    if (!q) {
      return activeFilter === "Tous" ? [] : byTag.slice(0, 8);
    }

    return byTag
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.moduleLabel.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [query, activeFilter, searchItems]);

  const showDropdown =
    !collapsed && isSearchOpen && (query.trim().length > 0 || activeFilter !== "Tous");

  const handleClearSearch = () => {
    setQuery("");
    setActiveFilter("Tous");
    setIsSearchOpen(false);
  };

  const generalLinks = [
    {
      id: "dashboard" as ModuleType,
      label: "Dashboard",
      icon: LayoutDashboard,
      badge: null as string | number | null,
    },
    {
      id: "emails" as ModuleType,
      label: "Secrétariat",
      icon: Mail,
      badge: pendingEmailsCount > 0 ? pendingEmailsCount : null,
    },
    {
      id: "dressing" as ModuleType,
      label: "Dressing",
      icon: Shirt,
      badge: null,
    },
    {
      id: "sante" as ModuleType,
      label: "Santé",
      icon: Brain,
      badge: null,
    },
    {
      id: "courses" as ModuleType,
      label: "Food",
      icon: ShoppingBag,
      badge: null,
    },
    {
      id: "sport" as ModuleType,
      label: "Sport",
      icon: Dumbbell,
      badge: null,
    },
    {
      id: "culture" as ModuleType,
      label: "Culture",
      icon: BookOpen,
      badge: null,
    },
    {
      id: "litiges" as ModuleType,
      label: "Litiges",
      icon: Scale,
      badge:
        urgentDisputesCount > 0
          ? `${urgentDisputesCount} action${urgentDisputesCount > 1 ? "s" : ""}`
          : null,
    },
    {
      id: "projets" as ModuleType,
      label: "Projets",
      icon: FolderGit2,
      badge: null,
    },
  ];

  return (
    <aside
      className={`${
        collapsed ? "md:w-20" : "md:w-60"
      } w-full bg-[#121316] text-slate-300 rounded-[2.2rem] p-3.5 md:p-4 flex flex-col justify-between shrink-0 select-none shadow-xl relative my-3 md:ml-3 md:h-[calc(100vh-1.5rem)] transition-all duration-200`}
    >
      {/* Brand Header + Quick Controls + Search + Scrollable Nav */}
      <div className="flex flex-col min-h-0 flex-1">
        <div className="flex items-center justify-between px-2 pt-1 pb-3 border-b border-slate-800/80 relative shrink-0">
          {!collapsed ? (
            <div className="flex items-end gap-2">
              <span className="font-logo text-2xl font-bold tracking-wide text-white leading-[1.05]">
                Assistant
                <br />
                perso
              </span>
              <span className="h-2 w-2 rounded-full bg-[#f7b5d5] mb-1.5" />
            </div>
          ) : (
            <div className="mx-auto flex items-center justify-center py-1">
              <span className="font-logo text-xl font-bold text-white">AP</span>
              <span className="h-2 w-2 rounded-full bg-[#f7b5d5] ml-0.5 mb-2" />
            </div>
          )}

          {/* Collapse toggle */}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Déplier le menu" : "Réduire le menu"}
            aria-label={collapsed ? "Déplier le menu" : "Réduire le menu"}
            className="hidden md:flex h-6 w-6 rounded-full bg-[#f7b5d5] text-[#121316] items-center justify-center absolute -right-6 top-3 shadow-md hover:scale-105 transition-all"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5 stroke-[3]" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5 stroke-[3]" />
            )}
          </button>
        </div>

        {/* Top-right icons + Search moved into Sidebar */}
        {!collapsed ? (
          <div className="pt-2.5 pb-2 border-b border-slate-800/80 space-y-2 shrink-0 relative z-40">
            {/* Quick Icons Row */}
            <div className="flex items-center justify-between gap-1.5 px-1">
              <button
                type="button"
                onClick={() => onSelectModule("parametres")}
                className={`h-8 flex-1 rounded-xl flex items-center justify-center transition-colors ${
                  currentModule === "parametres"
                    ? "bg-[#f7b5d5] text-[#121316]"
                    : "bg-slate-900/90 text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
                title="Mon Profil"
                aria-label="Mon Profil"
              >
                <User className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onSelectModule("emails")}
                className={`h-8 flex-1 rounded-xl flex items-center justify-center transition-colors relative ${
                  currentModule === "emails"
                    ? "bg-[#f7b5d5] text-[#121316]"
                    : "bg-slate-900/90 text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
                title="Secrétariat & Emails en attente"
                aria-label="Secrétariat & Emails en attente"
              >
                <Bell className="h-3.5 w-3.5" />
                {pendingEmailsCount > 0 && (
                  <span className="absolute top-1.5 right-2 h-1.5 w-1.5 rounded-full bg-[#f7b5d5]" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onSelectModule("historique")}
                className={`h-8 flex-1 rounded-xl flex items-center justify-center transition-colors relative ${
                  currentModule === "historique"
                    ? "bg-[#f7b5d5] text-[#121316]"
                    : "bg-slate-900/90 text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
                title="Historique des commandes"
                aria-label="Historique des commandes"
              >
                <History className="h-3.5 w-3.5" />
                {undoableHistoryCount > 0 && (
                  <span className="absolute top-1.5 right-2 h-1.5 w-1.5 rounded-full bg-[#f7da64]" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onSelectModule("parametres")}
                className="h-8 flex-1 rounded-xl bg-slate-900/90 text-slate-300 hover:bg-white/10 hover:text-white flex items-center justify-center transition-colors"
                title="Réglages"
                aria-label="Réglages"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <div className="bg-slate-900/90 border border-slate-800 rounded-full px-2 py-1 flex items-center gap-2 focus-within:border-[#f7b5d5]/70 transition-colors">
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen(true);
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Rechercher"
                  className="h-6 w-6 rounded-full bg-[#f7b5d5] text-[#121316] flex items-center justify-center shrink-0 hover:scale-105 transition-transform"
                >
                  <Search className="h-3 w-3 stroke-[2.5]" />
                </button>

                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onFocus={() => setIsSearchOpen(true)}
                  onBlur={() => {
                    setTimeout(() => setIsSearchOpen(false), 180);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      handleClearSearch();
                      searchInputRef.current?.blur();
                    } else if (e.key === "Enter" && filteredResults.length > 0) {
                      onSelectModule(filteredResults[0].module);
                      handleClearSearch();
                    }
                  }}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setIsSearchOpen(true);
                  }}
                  placeholder="Rechercher..."
                  className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none min-w-0"
                />

                {(query || activeFilter !== "Tous") && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleClearSearch}
                    aria-label="Effacer la recherche"
                    className="h-5 w-5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Search Dropdown */}
              {(isSearchOpen || showDropdown) && (
                <div className="absolute left-0 md:w-72 right-0 mt-2 bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-2xl p-2.5 space-y-2 z-50">
                  <div className="flex items-center gap-1 flex-wrap">
                    {FILTER_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setActiveFilter(tag);
                          setIsSearchOpen(true);
                        }}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
                          activeFilter === tag
                            ? "bg-[#121316] text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>

                  {showDropdown && (
                    <div className="max-h-60 overflow-y-auto space-y-1 pt-1 border-t border-slate-100">
                      {filteredResults.length === 0 ? (
                        <p className="text-xs text-slate-400 px-2 py-1.5">
                          Aucun résultat pour « {query || activeFilter} ».
                        </p>
                      ) : (
                        filteredResults.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              onSelectModule(item.module);
                              handleClearSearch();
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-slate-50 flex items-center justify-between gap-2 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate">
                                {item.title}
                              </p>
                              <p className="text-[10px] text-slate-500 truncate">
                                {item.subtitle}
                              </p>
                            </div>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0 flex items-center gap-0.5">
                              {item.moduleLabel}
                              <ArrowUpRight className="h-2.5 w-2.5" />
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="pt-2.5 pb-2 border-b border-slate-800/80 flex flex-col items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setCollapsed(false);
                setTimeout(() => searchInputRef.current?.focus(), 120);
              }}
              title="Rechercher"
              aria-label="Rechercher"
              className="h-8 w-8 rounded-full bg-[#f7b5d5] text-[#121316] flex items-center justify-center hover:scale-105 transition-transform"
            >
              <Search className="h-3.5 w-3.5 stroke-[2.5]" />
            </button>
            <button
              type="button"
              onClick={() => onSelectModule("emails")}
              title="Secrétariat & Emails en attente"
              aria-label="Secrétariat & Emails en attente"
              className="h-8 w-8 rounded-xl bg-slate-900/90 text-slate-300 hover:bg-white/10 hover:text-white flex items-center justify-center relative"
            >
              <Bell className="h-3.5 w-3.5" />
              {pendingEmailsCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[#f7b5d5]" />
              )}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Section 1: General */}
        <div className="pt-3.5 space-y-0.5">
          {!collapsed && (
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 px-3 block mb-1.5">
              Général
            </span>
          )}

          {generalLinks.map((item) => {
            const Icon = item.icon;
            const isActive = currentModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectModule(item.id)}
                title={item.label}
                className={`w-full flex items-center ${
                  collapsed ? "justify-center px-2" : "justify-between px-3"
                } py-1.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? "text-[#f7b5d5] font-bold bg-white/5 shadow-sm"
                    : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? "text-[#f7b5d5]" : "text-slate-400"
                    }`}
                  />
                  {!collapsed && <span>{item.label}</span>}
                </div>

                {!collapsed && item.badge !== null && (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                      isActive
                        ? "bg-[#f7b5d5] text-[#121316]"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Section 2: Tools & Focus */}
        <div className="pt-3.5 space-y-0.5 border-t border-slate-800/80 mt-2.5">
          {!collapsed && (
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 px-3 block mb-1.5">
              Outils & Focus
            </span>
          )}

          <button
            onClick={onToggleFocusMode}
            title="Mode Focus"
            className={`w-full flex items-center ${
              collapsed ? "justify-center px-2" : "justify-between px-3"
            } py-1.5 rounded-xl text-xs font-medium transition-all ${
              focusMode
                ? "bg-[#f7b5d5] text-[#121316] font-bold"
                : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Focus className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Mode Focus</span>}
            </div>
            {!collapsed && focusMode && <span className="text-[9px] font-bold">ON</span>}
          </button>

          <button
            onClick={onOpenBrainDump}
            title="Brain Dump"
            className={`w-full flex items-center ${
              collapsed ? "justify-center px-2" : "gap-2.5 px-3"
            } py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-all`}
          >
            <PlusCircle className="h-4 w-4 text-[#f7da64] shrink-0" />
            {!collapsed && <span>Brain Dump</span>}
          </button>

          <button
            onClick={() => onSelectModule("historique")}
            title="Historique des commandes"
            className={`w-full flex items-center ${
              collapsed ? "justify-center px-2" : "justify-between px-3"
            } py-1.5 rounded-xl text-xs font-medium transition-all ${
              currentModule === "historique"
                ? "text-[#f7b5d5] font-bold bg-white/5"
                : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <History className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Historique</span>}
            </div>
            {!collapsed && undoableHistoryCount > 0 && (
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                  currentModule === "historique"
                    ? "bg-[#f7b5d5] text-[#121316]"
                    : "bg-slate-800 text-slate-300"
                }`}
              >
                {undoableHistoryCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onSelectModule("parametres")}
            title="Paramètres"
            className={`w-full flex items-center ${
              collapsed ? "justify-center px-2" : "gap-2.5 px-3"
            } py-1.5 rounded-xl text-xs font-medium transition-all ${
              currentModule === "parametres"
                ? "text-[#f7b5d5] font-bold bg-white/5"
                : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
            }`}
          >
            <Settings className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Paramètres</span>}
          </button>
        </div>
        </div>
      </div>

      {/* Footer Energy level badge */}
      {!collapsed ? (
        <div className="p-2.5 bg-slate-900/90 rounded-2xl border border-slate-800/60 space-y-1.5 mt-2.5 shrink-0">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Énergie TDAH :</span>
            <span className="font-bold text-[#f7da64]">
              {energy === "low" ? "Douce" : energy === "medium" ? "Modérée" : "Optimale"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-[10px]">
            <button
              onClick={() => onSetEnergy("low")}
              className={`py-1 rounded-lg font-bold transition-all ${
                energy === "low"
                  ? "bg-[#f7da64] text-[#121316]"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              Basse
            </button>
            <button
              onClick={() => onSetEnergy("medium")}
              className={`py-1 rounded-lg font-bold transition-all ${
                energy === "medium"
                  ? "bg-[#a8bf6f] text-[#121316]"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              Mod.
            </button>
            <button
              onClick={() => onSetEnergy("high")}
              className={`py-1 rounded-lg font-bold transition-all ${
                energy === "high"
                  ? "bg-[#99b7e3] text-[#121316]"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              Haute
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() =>
            onSetEnergy(energy === "low" ? "medium" : energy === "medium" ? "high" : "low")
          }
          title={`Énergie : ${energy} (cliquer pour changer)`}
          className="mt-4 mx-auto h-9 w-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] font-bold text-[#f7da64]"
        >
          {energy === "low" ? "B" : energy === "medium" ? "M" : "H"}
        </button>
      )}
    </aside>
  );
};
