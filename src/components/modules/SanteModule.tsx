import React, { useEffect, useState } from "react";
import {
  Brain,
  Activity,
  Heart,
  Moon,
  Pill,
  Sparkles,
  Check,
  Play,
  Pause,
  RotateCcw,
  Zap,
  Edit3,
  Plus,
  Trash2,
  Loader2,
  Send,
  AlertCircle,
} from "lucide-react";
import { aiPost } from "@/lib/aiClient";
import type { HealthData, UserProfile } from "@/types";

interface SanteModuleProps {
  user: UserProfile;
  health: HealthData;
  onToggleSupplement: (id: string) => void;
  onUpdateBiomarkers: (patch: Partial<HealthData>) => void;
  onAddSupplement: (sup: {
    name: string;
    timing: "matin" | "midi" | "soir";
    benefit: string;
  }) => void;
  onDeleteSupplement: (id: string) => void;
}

interface CoachAdvice {
  title: string;
  validation: string;
  immediateAction: string;
  nextStep: string;
}

const STATIC_MOOD_GUIDANCE: Record<string, CoachAdvice> = {
  bloque: {
    title: "Paralysie de l'action TDAH (Overwhelm)",
    validation:
      "Ce blocage n'est pas un manque de volonté : ton cerveau surestime le coût d'entrée de la tâche.",
    immediateAction:
      "Engage-toi à ouvrir uniquement le document ou poser le premier outil pendant 2 minutes chrono.",
    nextStep: "Une fois lancé, décide librement si tu continues 5 minutes de plus ou si tu fais une pause.",
  },
  anxieux: {
    title: "Pic de tension / Anxiété (TAG)",
    validation:
      "Ton système nerveux est en mode alerte : inutile de raisonner à chaud, agissons d'abord sur le corps.",
    immediateAction:
      "Fais 3 soupirs physiologiques : 2 inspirations rapides par le nez, puis une longue expiration lente par la bouche.",
    nextStep: "Note en 1 phrase ce qui t'inquiète dans le Brain Dump pour le sortir de ta tête.",
  },
  fatigue: {
    title: "Baisse d'énergie / Crash dopaminergique",
    validation:
      "La batterie mentale est basse : forcer en mode haute intensité crée plus de fatigue que de résultat.",
    immediateAction:
      "Bois un grand verre d'eau et marche 3 minutes près d'une fenêtre ou dehors.",
    nextStep: "Passe ton niveau d'énergie sur « Basse » dans la barre latérale pour adapter tes tâches.",
  },
  focus: {
    title: "Zone de flow disponible",
    validation: "Bonne fenêtre d'attention : protège-la sans ouvrir dix onglets.",
    immediateAction: "Choisis UNE seule tâche prioritaire et lance le sprint 15 min ci-dessous.",
    nextStep: "Coupe les notifications pendant la durée du chrono.",
  },
};

export const SanteModule: React.FC<SanteModuleProps> = ({
  user,
  health,
  onToggleSupplement,
  onUpdateBiomarkers,
  onAddSupplement,
  onDeleteSupplement,
}) => {
  // Chrono Body Doubling fonctionnel
  const [sprintMinutes, setSprintMinutes] = useState(15);
  const [timerActive, setTimerActive] = useState(false);
  const [seconds, setSeconds] = useState(15 * 60);

  // Édition biomarqueurs
  const [editingBio, setEditingBio] = useState(false);
  const [bioForm, setBioForm] = useState({
    sleepScore: health.sleepScore,
    sleepHours: health.sleepHours,
    restingHr: health.restingHr,
    hrv: health.hrv,
    steps: health.steps,
  });

  // Ajout complément
  const [showSupForm, setShowSupForm] = useState(false);
  const [supName, setSupName] = useState("");
  const [supTiming, setSupTiming] = useState<"matin" | "midi" | "soir">("matin");
  const [supBenefit, setSupBenefit] = useState("");

  // Coach émotionnel
  const [currentMood, setCurrentMood] = useState<string | null>(null);
  const [freeMoodMessage, setFreeMoodMessage] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [aiAdvice, setAiAdvice] = useState<CoachAdvice | null>(null);

  useEffect(() => {
    setBioForm({
      sleepScore: health.sleepScore,
      sleepHours: health.sleepHours,
      restingHr: health.restingHr,
      hrv: health.hrv,
      steps: health.steps,
    });
  }, [health]);

  const playEndChime = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch {
      // ignore audio error
    }
  };

  useEffect(() => {
    if (!timerActive) return;
    const interval = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          setTimerActive(false);
          playEndChime();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive]);

  const selectSprintDuration = (mins: number) => {
    setTimerActive(false);
    setSprintMinutes(mins);
    setSeconds(mins * 60);
  };

  const resetTimer = () => {
    setTimerActive(false);
    setSeconds(sprintMinutes * 60);
  };

  const handleSaveBio = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateBiomarkers({
      sleepScore: Math.max(0, Math.min(100, Number(bioForm.sleepScore) || 0)),
      sleepHours: Math.max(0, Math.min(24, Number(bioForm.sleepHours) || 0)),
      restingHr: Math.max(30, Math.min(200, Number(bioForm.restingHr) || 60)),
      hrv: Math.max(5, Math.min(250, Number(bioForm.hrv) || 50)),
      steps: Math.max(0, Number(bioForm.steps) || 0),
    });
    setEditingBio(false);
  };

  const handleAddSup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName.trim()) return;
    onAddSupplement({
      name: supName.trim(),
      timing: supTiming,
      benefit: supBenefit.trim() || "Soutien quotidien",
    });
    setSupName("");
    setSupBenefit("");
    setShowSupForm(false);
  };

  const askCoach = async (moodLabel?: string, customMsg?: string) => {
    setCoachLoading(true);
    setCoachError(null);
    try {
      const res = await aiPost<{ advice: CoachAdvice }>("/api/ai/coach", {
        action: "regulate",
        mood: moodLabel || currentMood || "libre",
        message: customMsg || freeMoodMessage,
        health,
        energyLevel: user.energyToday,
        tdahNotes: user.tdahNotes,
      });
      setAiAdvice(res.advice);
    } catch (err) {
      setCoachError(
        err instanceof Error ? err.message : "DeepSeek indisponible — conseil local affiché."
      );
    } finally {
      setCoachLoading(false);
    }
  };

  const minsDisplay = Math.floor(seconds / 60);
  const secsDisplay = seconds % 60;
  const activeFallbackAdvice = currentMood ? STATIC_MOOD_GUIDANCE[currentMood] : null;
  const displayedAdvice = aiAdvice || activeFallbackAdvice;

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
            Suivi manuel biomarqueurs • Compléments ciblés • Coach émotionnel DeepSeek & Body Doubling
          </p>
        </div>

        <button
          onClick={() => setEditingBio((v) => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all"
        >
          <Edit3 className="h-3.5 w-3.5" />
          <span>{editingBio ? "Fermer l'édition" : "Mettre à jour mes mesures"}</span>
        </button>
      </div>

      {/* Biomarkers edit form */}
      {editingBio && (
        <form
          onSubmit={handleSaveBio}
          className="p-5 rounded-3xl bg-white border border-rose-200 shadow-sm space-y-4 text-xs"
        >
          <h4 className="font-bold text-slate-900">Saisie manuelle des mesures du jour</h4>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 block">
                Score sommeil (/100)
              </span>
              <input
                type="number"
                min={0}
                max={100}
                value={bioForm.sleepScore}
                onChange={(e) => setBioForm({ ...bioForm, sleepScore: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 block">
                Durée nuit (h)
              </span>
              <input
                type="number"
                step="0.1"
                min={0}
                max={24}
                value={bioForm.sleepHours}
                onChange={(e) => setBioForm({ ...bioForm, sleepHours: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 block">
                Pouls repos (bpm)
              </span>
              <input
                type="number"
                min={30}
                max={200}
                value={bioForm.restingHr}
                onChange={(e) => setBioForm({ ...bioForm, restingHr: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 block">VFC (ms)</span>
              <input
                type="number"
                min={5}
                max={250}
                value={bioForm.hrv}
                onChange={(e) => setBioForm({ ...bioForm, hrv: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 block">Pas du jour</span>
              <input
                type="number"
                min={0}
                value={bioForm.steps}
                onChange={(e) => setBioForm({ ...bioForm, steps: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingBio(false)}
              className="px-4 py-2 rounded-xl text-slate-500 font-semibold"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold"
            >
              Enregistrer
            </button>
          </div>
        </form>
      )}

      {/* Biomarkers Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Moon className="h-4 w-4 text-indigo-500" />
            <span>Sommeil</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 font-mono">{health.sleepScore}/100</p>
          <p className="text-[11px] text-teal-600 font-bold">{health.sleepHours}h de repos</p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Heart className="h-4 w-4 text-rose-500" />
            <span>Pouls au repos</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 font-mono">{health.restingHr} bpm</p>
          <p className="text-[11px] text-slate-500">Saisie locale</p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Activity className="h-4 w-4 text-sky-500" />
            <span>VFC (Variabilité)</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 font-mono">{health.hrv} ms</p>
          <p className="text-[11px] text-sky-600 font-bold">Indicateur récupération</p>
        </div>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Zap className="h-4 w-4 text-amber-500" />
            <span>Activité du jour</span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 font-mono">
            {health.steps.toLocaleString("fr-FR")}
          </p>
          <p className="text-[11px] text-slate-500">pas enregistrés</p>
        </div>
      </div>

      {/* Mood / Emotional State Regulator + DeepSeek Coach */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-rose-500" />
            <span>Baromètre Émotionnel & Coach TDAH / TAG (DeepSeek)</span>
          </h4>
          {aiAdvice && (
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800">
              Réponse personnalisée DeepSeek
            </span>
          )}
        </div>

        <p className="text-xs text-slate-500">
          Clique sur un état rapide ou décris en 1 phrase ce qui te bloque pour recevoir un plan d'action immédiat.
        </p>

        <div className="flex flex-wrap gap-2">
          {[
            { id: "bloque", label: "🌪️ Bloqué / Procrastination" },
            { id: "anxieux", label: "⚡ Anxieux / Oppressé" },
            { id: "fatigue", label: "🪫 Fatigué / Déchargé" },
            { id: "focus", label: "🎯 Clair & Focus" },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setCurrentMood(m.id);
                setAiAdvice(null);
                setCoachError(null);
              }}
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

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={freeMoodMessage}
            onChange={(e) => setFreeMoodMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void askCoach(undefined, freeMoodMessage)}
            placeholder="Décris librement ce que tu ressens (ex: Trop de mails, paralysé devant mon écran)..."
            className="flex-1 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-rose-400"
          />
          <button
            onClick={() => void askCoach()}
            disabled={coachLoading || (!freeMoodMessage.trim() && !currentMood)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold disabled:opacity-40 transition-all shrink-0"
          >
            {coachLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Coach IA...</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5 text-rose-300" />
                <span>Demander au coach DeepSeek</span>
              </>
            )}
          </button>
        </div>

        {coachError && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{coachError}</span>
          </div>
        )}

        {displayedAdvice && (
          <div className="mt-2 p-5 rounded-2xl bg-rose-50/70 border border-rose-200 text-xs space-y-2.5">
            <p className="font-extrabold text-sm text-rose-950">{displayedAdvice.title}</p>
            <p className="text-rose-900 leading-relaxed">{displayedAdvice.validation}</p>
            <div className="p-3 rounded-xl bg-white/80 border border-rose-200/70">
              <span className="text-[10px] font-bold uppercase text-rose-700 block mb-0.5">
                Action immédiate (60-120 sec)
              </span>
              <p className="text-slate-800 font-semibold">{displayedAdvice.immediateAction}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/80 border border-rose-200/70">
              <span className="text-[10px] font-bold uppercase text-teal-700 block mb-0.5">
                Étape suivante toute douce
              </span>
              <p className="text-slate-800">{displayedAdvice.nextStep}</p>
            </div>
          </div>
        )}
      </div>

      {/* Supplements & Brain Nutrition */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Pill className="h-4 w-4 text-teal-600" />
            <span>Compléments Ciblés (Routine quotidienne)</span>
          </h4>
          <button
            onClick={() => setShowSupForm((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-teal-700 hover:text-teal-900"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{showSupForm ? "Annuler" : "Ajouter un complément"}</span>
          </button>
        </div>

        {showSupForm && (
          <form
            onSubmit={handleAddSup}
            className="p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs"
          >
            <input
              type="text"
              value={supName}
              onChange={(e) => setSupName(e.target.value)}
              placeholder="Nom (ex: Vitamine D3)"
              className="px-3 py-2 rounded-xl bg-white border border-slate-200"
              required
            />
            <select
              value={supTiming}
              onChange={(e) => setSupTiming(e.target.value as "matin" | "midi" | "soir")}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200"
            >
              <option value="matin">Matin</option>
              <option value="midi">Midi</option>
              <option value="soir">Soir</option>
            </select>
            <input
              type="text"
              value={supBenefit}
              onChange={(e) => setSupBenefit(e.target.value)}
              placeholder="Bénéfice / dosage..."
              className="px-3 py-2 rounded-xl bg-white border border-slate-200"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold"
            >
              Ajouter
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {health.supplements.map((sup) => (
            <div
              key={sup.id}
              className={`p-4 rounded-2xl border flex items-start justify-between gap-2 transition-all ${
                sup.taken
                  ? "bg-emerald-50/50 border-emerald-200 text-slate-600"
                  : "bg-white border-slate-200/80 hover:border-slate-300 shadow-sm"
              }`}
            >
              <div
                onClick={() => onToggleSupplement(sup.id)}
                className="flex items-start gap-3 cursor-pointer select-none flex-1 min-w-0"
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

                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-slate-900">{sup.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-teal-800 font-mono font-bold">
                      {sup.timing}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">{sup.benefit}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onDeleteSupplement(sup.id)}
                aria-label="Supprimer ce complément"
                className="text-slate-300 hover:text-rose-600 p-1 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Body Doubling Virtual Co-Worker (chrono réel) */}
      <div className="p-6 rounded-3xl bg-white card-glow-teal border border-teal-100 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-teal-950 uppercase tracking-wide">
            Compagnon "Body Doubling" Virtuel
          </h4>
          <p className="text-xs text-slate-600 max-w-md">
            Démarrez un sprint chronométré pour réduire la friction du démarrage. Un carillon doux retentit à la fin.
          </p>
          <div className="flex items-center gap-1.5">
            {[5, 15, 25].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => selectSprintDuration(mins)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all ${
                  sprintMinutes === mins
                    ? "bg-teal-600 text-white border-teal-600"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {mins} min
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2.5 rounded-2xl bg-slate-100 font-mono text-base font-extrabold text-slate-900 border border-slate-200">
            {String(minsDisplay).padStart(2, "0")}:{String(secsDisplay).padStart(2, "0")}
          </div>
          <button
            type="button"
            onClick={() => {
              if (seconds === 0) setSeconds(sprintMinutes * 60);
              setTimerActive((v) => !v);
            }}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-sm"
          >
            {timerActive ? (
              <>
                <Pause className="h-3.5 w-3.5 text-amber-400" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 text-amber-400" />
                <span>
                  {seconds === 0
                    ? "Relancer"
                    : seconds < sprintMinutes * 60
                      ? "Reprendre"
                      : `Lancer ${sprintMinutes} min`}
                </span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={resetTimer}
            title="Réinitialiser le chrono"
            className="h-9 w-9 rounded-2xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
