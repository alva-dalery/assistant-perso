import React, { useState } from "react";
import { Search, User, Bell, Settings, Sparkles } from "lucide-react";
import { ModuleType } from "@/types";

interface HeaderProps {
  onSearch?: (query: string) => void;
  onSelectModule: (module: ModuleType) => void;
  pendingEmailsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onSearch,
  onSelectModule,
  pendingEmailsCount,
}) => {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("Secrétariat");

  const filterTags = ["Secrétariat", "Dressing", "Santé", "Food", "Sport", "Litiges"];

  return (
    <header className="w-full flex items-center justify-between gap-4 py-3.5 px-4 md:px-8 select-none">
      {/* Pill Search Bar matching reference image */}
      <div className="flex-1 max-w-3xl bg-white/80 backdrop-blur-md rounded-full border border-slate-200/80 px-2.5 py-1.5 flex items-center gap-3 shadow-sm">
        {/* Pink circular search button */}
        <button className="h-7 w-7 rounded-full bg-[#f7b5d5] text-[#121316] flex items-center justify-center shrink-0 shadow-sm hover:scale-105 transition-transform">
          <Search className="h-3.5 w-3.5 stroke-[2.5]" />
        </button>

        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (onSearch) onSearch(e.target.value);
          }}
          placeholder="Rechercher une tâche, un vêtement, une recette, un litige..."
          className="flex-1 bg-transparent text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />

        {/* Filter pills on the right side of the search bar */}
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-400 pr-1">
          <span className="font-semibold text-slate-400">Dans:</span>
          {filterTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveFilter(tag)}
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

      {/* Right Controls: 3 rounded black circular buttons */}
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
          title="Notifications & Brouillons"
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
