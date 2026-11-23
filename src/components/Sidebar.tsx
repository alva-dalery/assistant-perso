import React, { useState } from "react";
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
} from "lucide-react";
import { ModuleType, EnergyLevel } from "@/types";

interface SidebarProps {
  currentModule: ModuleType;
  onSelectModule: (module: ModuleType) => void;
  pendingEmailsCount: number;
  urgentDisputesCount: number;
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
  energy,
  onSetEnergy,
  focusMode,
  onToggleFocusMode,
  onOpenBrainDump,
}) => {
  const [collapsed, setCollapsed] = useState(false);

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
      } w-full bg-[#121316] text-slate-300 rounded-[2.2rem] p-4 flex flex-col justify-between shrink-0 select-none shadow-xl relative my-3 md:ml-3 transition-all duration-200`}
    >
      {/* Brand Header */}
      <div>
        <div className="flex items-center justify-between px-2 pt-2 pb-6 border-b border-slate-800/80 relative">
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

        {/* Section 1: General */}
        <div className="pt-5 space-y-1">
          {!collapsed && (
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 px-3 block mb-2">
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
                } py-2 rounded-xl text-xs font-medium transition-all ${
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
        <div className="pt-5 space-y-1 border-t border-slate-800/80 mt-4">
          {!collapsed && (
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 px-3 block mb-2">
              Outils & Focus
            </span>
          )}

          <button
            onClick={onToggleFocusMode}
            title="Mode Focus"
            className={`w-full flex items-center ${
              collapsed ? "justify-center px-2" : "justify-between px-3"
            } py-2 rounded-xl text-xs font-medium transition-all ${
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
            } py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-all`}
          >
            <PlusCircle className="h-4 w-4 text-[#f7da64] shrink-0" />
            {!collapsed && <span>Brain Dump</span>}
          </button>

          <button
            onClick={() => onSelectModule("parametres")}
            title="Paramètres"
            className={`w-full flex items-center ${
              collapsed ? "justify-center px-2" : "gap-2.5 px-3"
            } py-2 rounded-xl text-xs font-medium transition-all ${
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

      {/* Footer Energy level badge */}
      {!collapsed ? (
        <div className="p-3 bg-slate-900/90 rounded-2xl border border-slate-800/60 space-y-2 mt-4">
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
