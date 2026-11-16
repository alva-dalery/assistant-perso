import React, { useState } from "react";
import {
  Brain,
  Activity,
  Heart,
  Moon,
  Pill,
  Sparkles,
  Check,
  ShieldAlert,
  Play,
  RotateCcw,
  Zap,
} from "lucide-react";
import { HealthData } from "@/types";

interface SanteModuleProps {
  health: HealthData;
  onToggleSupplement: (id: string) => void;
}

export const SanteModule: React.FC<SanteModuleProps> = ({
  health,
  onToggleSupplement,
}) => {
  const [timerActive, setTimerActive] = useState(false);
  const [seconds, setSeconds] = useState(15 * 60);
  const [currentMood, setCurrentMood] = useState<string | null>(null);

  const moodGuidance: Record<string, { title: string; advice: string }> = {
    bloque: {
      title: "Paralysie de l'action TDAH (Overwhelm)",
      advice: "Ne cherche pas à finir la tâche. Engage-toi seulement à ouvrir le fichier ou faire l'action pendant 2 minutes chrono. Le plus dur est la friction du démarrage.",
    },
    anxieux: {
      title: "Pic de TAG (Anxiété / Tachycardie)",
      advice: "Fais 3 soupirs physiologiques : deux inspirations rapides par le nez, puis une longue expiration lente par la bouche. Cela active instantanément le nerf vague et baisse le pouls.",
    },
    fatigue: {
      title: "Crash d'énergie ou baisse de dopamine",
      advice: "Bois 300ml d'eau avec une pincée de sel ou électrolytes, marche 3 minutes à la lumière du jour. Pas de culpabilité, c'est de la biologie.",
    },
    focus: {
      title: "Zone de flow stimulée",
      advice: "Parfait ! Élimine les notifications et profite de cette vague d'attention sans t'interrompre.",
    },
  };

  return (
    <div className="space-y-6">
      {/* Module Title */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Brain className="h-5 w-5 text-rose-500" />
            <span>Santé</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Biomarqueurs en direct • Compléments ciblés • Soutien anti-paralysie
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Withings & Apple Santé connectés
          </span>
        </div>
      </div>

      {/* Biomarkers Live Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Moon className="h-4 w-4 text-indigo-500" />
            <span>Sommeil (Withings)</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 font-mono">{health.sleepScore}/100</p>
          <p className="text-[11px] text-teal-600 font-bold">{health.sleepHours}h • Réparateur</p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Heart className="h-4 w-4 text-rose-500" />
            <span>Pouls au repos</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 font-mono">{health.restingHr} bpm</p>
          <p className="text-[11px] text-slate-500">Normal & régulier</p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Activity className="h-4 w-4 text-sky-500" />
            <span>VFC (Variabilité)</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 font-mono">{health.hrv} ms</p>
          <p className="text-[11px] text-sky-600 font-bold">Système apaisé</p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Zap className="h-4 w-4 text-amber-500" />
            <span>Activité du jour</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 font-mono">{health.steps.toLocaleString()}</p>
          <p className="text-[11px] text-slate-500">pas synchronisés Apple</p>
        </div>
      </div>

      {/* Mood / Emotional State Regulator */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-3">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-rose-500" />
          <span>Baromètre Émotionnel & Régulation TDAH / TAG</span>
        </h4>
        <p className="text-xs text-slate-500">
          Comment te sens-tu en ce moment ? Clique sur ton état pour une régulation ciblée immédiate :
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {[
            { id: "bloque", label: "🌪️ Bloqué / Procrastination" },
            { id: "anxieux", label: "⚡ Anxieux / Oppressé" },
            { id: "fatigue", label: "🪫 Fatigué / Déchargé" },
            { id: "focus", label: "🎯 Clair & Focus" },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setCurrentMood(currentMood === m.id ? null : m.id)}
              className={`px-4 py-2 rounded-2xl text-xs font-semibold border transition-all ${
                currentMood === m.id
                  ? "bg-rose-50 text-rose-900 border-rose-300 shadow-sm"
                  : "bg-slate-50 text-slate-700 border-slate-200/80 hover:bg-slate-100"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {currentMood && moodGuidance[currentMood] && (
          <div className="mt-3 p-4 rounded-2xl bg-rose-50/70 border border-rose-200 text-xs space-y-1 animate-in fade-in duration-200">
            <p className="font-bold text-rose-900">
              {moodGuidance[currentMood].title}
            </p>
            <p className="text-rose-800 leading-relaxed">
              {moodGuidance[currentMood].advice}
            </p>
          </div>
        )}
      </div>

      {/* Supplements & Brain Nutrition */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Pill className="h-4 w-4 text-teal-600" />
            <span>Compléments Ciblés (Focus Dopaminergique & Anti-Stress)</span>
          </h4>
          <span className="text-[11px] text-slate-400 font-medium">Horodatage optimal</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {health.supplements.map((sup) => (
            <div
              key={sup.id}
              onClick={() => onToggleSupplement(sup.id)}
              className={`p-4 rounded-2xl border flex items-start gap-3.5 cursor-pointer transition-all select-none ${
                sup.taken
                  ? "bg-emerald-50/50 border-emerald-200 text-slate-600"
                  : "bg-white border-slate-200/80 hover:border-slate-300 shadow-sm"
              }`}
            >
              <div
                className={`h-5 w-5 rounded-lg mt-0.5 flex items-center justify-center shrink-0 border ${
                  sup.taken
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "border-slate-300 bg-white"
                }`}
              >
                {sup.taken && <Check className="h-3.5 w-3.5 stroke-[3]" />}
              </div>

              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">{sup.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-teal-800 font-mono font-bold">
                    {sup.timing}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">{sup.benefit}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Body Doubling Virtual Co-Worker */}
      <div className="p-6 rounded-3xl bg-white card-glow-teal border border-teal-100 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-teal-950 uppercase tracking-wide">
            Compagnon "Body Doubling" Virtuel
          </h4>
          <p className="text-xs text-slate-600 mt-1 max-w-md">
            Pour un cerveau TDAH, travailler « en présence » d'une aide diminue la résistance mentale. Démarrez un sprint de 15 minutes sans distraction.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-2xl bg-slate-100 font-mono text-sm font-bold text-slate-800 border border-slate-200">
            {Math.floor(seconds / 60)}:00
          </div>
          <button
            onClick={() => setTimerActive(!timerActive)}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-sm"
          >
            <Play className="h-3.5 w-3.5 text-amber-400" />
            <span>{timerActive ? "Pause" : "Lancer le Sprint 15 min"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
