import React, { useMemo, useRef, useState } from "react";
import { Search, User, Bell, Settings, X, ArrowUpRight } from "lucide-react";
import type { GlobalSearchResult, ModuleType } from "@/types";

interface HeaderProps {
  onSelectModule: (module: ModuleType) => void;
  pendingEmailsCount: number;
  searchItems?: GlobalSearchResult[];
}

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

export const Header: React.FC<HeaderProps> = ({
  onSelectModule,
  pendingEmailsCount,
  searchItems = [],
}) => {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("Tous");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  const showDropdown = isOpen && (query.trim().length > 0 || activeFilter !== "Tous");

  const handleClear = () => {
    setQuery("");
    setActiveFilter("Tous");
    setIsOpen(false);
  };

  return (
    <header className="w-full flex items-center justify-between gap-4 py-3.5 px-4 md:px-8 select-none relative z-30">
      {/* Pill Search Bar */}
      <div className="flex-1 max-w-4xl relative">
        <div className="bg-white/85 backdrop-blur-md rounded-full border border-slate-200/80 px-2.5 py-1.5 flex items-center gap-2.5 shadow-sm">
          <button
            type="button"
            onClick={() => {
              setIsOpen(true);
              inputRef.current?.focus();
            }}
            aria-label="Rechercher"
            className="h-7 w-7 rounded-full bg-[#f7b5d5] text-[#121316] flex items-center justify-center shrink-0 shadow-sm hover:scale-105 transition-transform"
          >
            <Search className="h-3.5 w-3.5 stroke-[2.5]" />
          </button>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onFocus={() => setIsOpen(true)}
            onBlur={() => {
              // Laisser le temps au clic sur un résultat
              setTimeout(() => setIsOpen(false), 180);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                handleClear();
                inputRef.current?.blur();
              } else if (e.key === "Enter" && filteredResults.length > 0) {
                onSelectModule(filteredResults[0].module);
                handleClear();
              }
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            placeholder="Rechercher une tâche, un vêtement, une recette, un litige, un livre..."
            className="flex-1 bg-transparent text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none min-w-[140px]"
          />

          {(query || activeFilter !== "Tous") && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Effacer la recherche"
              className="h-6 w-6 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Filter pills */}
          <div className="hidden lg:flex items-center gap-1 text-[11px] text-slate-400 pr-1">
            {FILTER_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setActiveFilter(tag);
                  setIsOpen(true);
                }}
                className={`px-2 py-0.5 rounded-full font-medium transition-all ${
                  activeFilter === tag
                    ? "bg-[#121316] text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Search Dropdown */}
        {showDropdown && (
          <div className="absolute left-0 right-0 mt-2 bg-white rounded-3xl border border-slate-200/90 shadow-xl p-3 space-y-1.5 max-h-80 overflow-y-auto z-40">
            {filteredResults.length === 0 ? (
              <p className="text-xs text-slate-400 px-3 py-2">
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
                    handleClear();
                  }}
                  className="w-full text-left px-3 py-2 rounded-2xl hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{item.title}</p>
                    <p className="text-[11px] text-slate-500 truncate">{item.subtitle}</p>
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 shrink-0 flex items-center gap-1">
                    {item.moduleLabel}
                    <ArrowUpRight className="h-3 w-3" />
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onSelectModule("parametres")}
          className="h-9 w-9 rounded-full bg-[#121316] text-white flex items-center justify-center hover:bg-slate-800 transition-colors shadow-sm"
          title="Mon Profil"
        >
          <User className="h-4 w-4" />
        </button>

        <button
          onClick={() => onSelectModule("emails")}
          className="h-9 w-9 rounded-full bg-[#121316] text-white flex items-center justify-center hover:bg-slate-800 transition-colors shadow-sm relative"
          title="Secrétariat & Emails en attente"
        >
          <Bell className="h-4 w-4" />
          {pendingEmailsCount > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[#f7b5d5]" />
          )}
        </button>

        <button
          onClick={() => onSelectModule("parametres")}
          className="h-9 w-9 rounded-full bg-[#121316] text-white flex items-center justify-center hover:bg-slate-800 transition-colors shadow-sm"
          title="Réglages"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
};
