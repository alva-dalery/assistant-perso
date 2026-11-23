import React, { useEffect, useMemo, useState } from "react";
import {
  Dumbbell,
  Sparkles,
  Play,
  Pause,
  ChevronRight,
  ChevronLeft,
  Clock,
  Volume2,
  VolumeX,
  X,
  Award,
  Loader2,
  AlertCircle,
  CalendarCheck,
} from "lucide-react";
import { aiPost } from "@/lib/aiClient";
import type { EnergyLevel, WorkoutLog, WorkoutSession } from "@/types";

interface SportModuleProps {
  workouts: WorkoutSession[];
  workoutLogs: WorkoutLog[];
  currentEnergy: EnergyLevel;
  onSetEnergy: (energy: EnergyLevel) => void;
  onAddWorkout: (workout: WorkoutSession) => void;
  onWorkoutCompleted?: (workout: WorkoutSession) => void;
}

export const SportModule: React.FC<SportModuleProps> = ({
  workouts,
  workoutLogs,
  currentEnergy,
  onSetEnergy,
  onAddWorkout,
  onWorkoutCompleted,
}) => {
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string>(
    workouts.find((w) => w.energyLevelRequired === currentEnergy)?.id || workouts[0]?.id || "w-med"
  );
  const [activeExerciseIndex, setActiveExerciseIndex] = useState<number | null>(null);

  // Live Workout Player State
  const [isLiveSession, setIsLiveSession] = useState(false);
  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(45);
  const [initialSeconds, setInitialSeconds] = useState(45);
  const [isPaused, setIsPaused] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Générateur de séance DeepSeek
  const [showGenerator, setShowGenerator] = useState(false);
  const [genDuration, setGenDuration] = useState(15);
  const [genFocus, setGenFocus] = useState("Mobilité, renforcement doux et énergie mentale");
  const [genConstraints, setGenConstraints] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    const match = workouts.find((w) => w.energyLevelRequired === currentEnergy);
    if (match && !isLiveSession) {
      setSelectedWorkoutId(match.id);
    }
  }, [currentEnergy]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedWorkout =
    workouts.find((w) => w.id === selectedWorkoutId) || workouts[0];

  const currentExercise =
    selectedWorkout?.exercises[currentExIdx] || selectedWorkout?.exercises[0];

  const playChime = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.7);
    } catch {
      // Audio not supported
    }
  };

  const parseSecondsForExercise = (ex: { durationOrReps: string }) => {
    const text = ex.durationOrReps.toLowerCase();
    if (text.includes("minute")) {
      const match = text.match(/\d+/);
      const mins = match ? parseInt(match[0], 10) : 2;
      return mins * 60;
    }
    if (text.includes("seconde")) {
      const match = text.match(/\d+/);
      return match ? parseInt(match[0], 10) : 45;
    }
    return 45;
  };

  const handleStartWorkout = (startIndex = 0) => {
    if (!selectedWorkout || selectedWorkout.exercises.length === 0) return;
    setCurrentExIdx(startIndex);
    const secs = parseSecondsForExercise(selectedWorkout.exercises[startIndex]);
    setInitialSeconds(secs);
    setTimerSeconds(secs);
    setIsPaused(false);
    setIsFinished(false);
    setIsLiveSession(true);
    playChime();
  };

  useEffect(() => {
    if (!isLiveSession || isPaused || isFinished || !selectedWorkout) return;
    if (timerSeconds > 0) {
      const interval = setInterval(() => {
        setTimerSeconds((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }

    playChime();
    if (currentExIdx < selectedWorkout.exercises.length - 1) {
      const nextIdx = currentExIdx + 1;
      setCurrentExIdx(nextIdx);
      const secs = parseSecondsForExercise(selectedWorkout.exercises[nextIdx]);
      setInitialSeconds(secs);
      setTimerSeconds(secs);
    } else {
      setIsFinished(true);
      onWorkoutCompleted?.(selectedWorkout);
    }
  }, [isLiveSession, isPaused, isFinished, timerSeconds, currentExIdx, selectedWorkout]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNextExercise = () => {
    if (!selectedWorkout) return;
    playChime();
    if (currentExIdx < selectedWorkout.exercises.length - 1) {
      const nextIdx = currentExIdx + 1;
      setCurrentExIdx(nextIdx);
      const secs = parseSecondsForExercise(selectedWorkout.exercises[nextIdx]);
      setInitialSeconds(secs);
      setTimerSeconds(secs);
    } else {
      setIsFinished(true);
      onWorkoutCompleted?.(selectedWorkout);
    }
  };

  const handlePrevExercise = () => {
    if (!selectedWorkout || currentExIdx <= 0) return;
    const prevIdx = currentExIdx - 1;
    setCurrentExIdx(prevIdx);
    const secs = parseSecondsForExercise(selectedWorkout.exercises[prevIdx]);
    setInitialSeconds(secs);
    setTimerSeconds(secs);
  };

  const handleGenerateWorkoutAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (generating) return;
    setGenerating(true);
    setGenError(null);
    try {
      const res = await aiPost<{ workout: WorkoutSession }>("/api/ai/coach", {
        action: "generate_workout",
        energyLevel: currentEnergy,
        durationMinutes: genDuration,
        focus: genFocus.trim(),
        constraints: genConstraints.trim(),
      });
      if (res.workout && res.workout.exercises.length > 0) {
        onAddWorkout(res.workout);
        setSelectedWorkoutId(res.workout.id);
        setShowGenerator(false);
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Génération IA impossible.");
    } finally {
      setGenerating(false);
    }
  };

  const weeklyStats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = workoutLogs.filter((l) => new Date(l.completedAt).getTime() >= weekAgo);
    return {
      count: recent.length,
      minutes: recent.reduce((acc, l) => acc + l.durationMinutes, 0),
    };
  }, [workoutLogs]);

  const progressRatio = Math.max(0, timerSeconds / (initialSeconds || 1));
  const strokeDashoffset = 283 * (1 - progressRatio);
  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;

  if (!selectedWorkout) return null;

  return (
    <div className="w-full space-y-6">
      {isLiveSession && currentExercise ? (
        <div className="p-6 md:p-10 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-2xl space-y-8 animate-in fade-in zoom-in duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-50/60 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between border-b border-slate-100 pb-4 relative z-10">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-emerald-500 animate-ping" />
              <div>
                <h4 className="text-base font-extrabold text-slate-900">{selectedWorkout.title}</h4>
                <p className="text-xs text-slate-400">
                  Exercice {currentExIdx + 1} sur {selectedWorkout.exercises.length}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="h-9 w-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
                title={soundEnabled ? "Couper le son" : "Activer le son"}
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>

              <button
                onClick={() => {
                  setIsLiveSession(false);
                  setIsFinished(false);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
              >
                <X className="h-4 w-4" />
                <span>Quitter</span>
              </button>
            </div>
          </div>

          {isFinished ? (
            <div className="py-12 text-center space-y-5 animate-in zoom-in duration-300">
              <div className="h-24 w-24 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-100">
                <Award className="h-12 w-12 stroke-[2.2]" />
              </div>

              <div>
                <h3 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  Séance terminée avec succès ! 🎉
                </h3>
                <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
                  Séance enregistrée dans votre historique hebdomadaire.
                </p>
              </div>

              <div className="flex items-center justify-center gap-6 pt-3">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center w-36">
                  <span className="text-xs text-slate-400 block font-semibold">Temps actif</span>
                  <span className="text-xl font-extrabold text-slate-900 font-mono">
                    {selectedWorkout.durationMinutes} min
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center w-36">
                  <span className="text-xs text-slate-400 block font-semibold">Cette semaine</span>
                  <span className="text-xl font-extrabold text-emerald-600 font-mono">
                    {weeklyStats.minutes} min
                  </span>
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={() => {
                    setIsLiveSession(false);
                    setIsFinished(false);
                  }}
                  className="px-8 py-3.5 rounded-full bg-[#121316] hover:bg-slate-800 text-white font-extrabold text-xs shadow-md transition-all"
                >
                  Revenir aux séances
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-8 relative z-10">
              <div className="text-center space-y-2 max-w-xl mx-auto">
                <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 uppercase tracking-widest border border-indigo-200/60">
                  Exercice {currentExIdx + 1} / {selectedWorkout.exercises.length}
                </span>

                <h3 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight font-jakarta">
                  {currentExercise.name}
                </h3>

                <p className="text-sm font-semibold text-teal-700">
                  Cible : {currentExercise.durationOrReps}
                </p>

                <div className="mt-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 italic max-w-md mx-auto">
                  💡 {currentExercise.tip}
                </div>
              </div>

              <div className="flex flex-col items-center justify-center py-4">
                <div className="relative h-56 w-56 flex items-center justify-center">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      className="stroke-slate-100"
                      strokeWidth="6"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      className="stroke-indigo-600 transition-all duration-1000 ease-linear"
                      strokeWidth="6"
                      strokeDasharray="283"
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                    />
                  </svg>

                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-4xl font-extrabold font-mono text-slate-900 tracking-tight">
                      {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                      {isPaused ? "En pause" : "En cours..."}
                    </span>
                  </div>
                </div>
              </div>

              {currentExIdx < selectedWorkout.exercises.length - 1 && (
                <div className="text-center text-xs text-slate-400">
                  À suivre :{" "}
                  <span className="font-bold text-slate-700">
                    {selectedWorkout.exercises[currentExIdx + 1].name}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-center gap-4 pt-2">
                <button
                  onClick={handlePrevExercise}
                  disabled={currentExIdx === 0}
                  className="h-12 w-12 rounded-full border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-600 disabled:opacity-30 transition-all"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#121316] hover:bg-slate-800 text-white font-extrabold text-sm shadow-xl transition-all"
                >
                  {isPaused ? (
                    <>
                      <Play className="h-4 w-4 text-[#f7da64] fill-[#f7da64]" />
                      <span>Reprendre</span>
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4 text-[#f7da64] fill-[#f7da64]" />
                      <span>Pause</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleNextExercise}
                  className="h-12 w-12 rounded-full border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-all shadow-sm"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="p-6 rounded-[2.2rem] bg-white border border-slate-200/70 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight font-jakarta flex items-center gap-2">
                <Dumbbell className="h-6 w-6 text-indigo-600" />
                <span>Sport & Mouvement Adaptatif</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Séances adaptées à votre énergie • Génération sur mesure par DeepSeek • Historique enregistré
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl text-xs font-semibold">
                <button
                  onClick={() => onSetEnergy("low")}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    currentEnergy === "low"
                      ? "bg-[#f7da64] text-slate-900 font-bold shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Basse
                </button>
                <button
                  onClick={() => onSetEnergy("medium")}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    currentEnergy === "medium"
                      ? "bg-[#a8bf6f] text-slate-900 font-bold shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Modérée
                </button>
                <button
                  onClick={() => onSetEnergy("high")}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    currentEnergy === "high"
                      ? "bg-[#99b7e3] text-slate-900 font-bold shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Haute
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowGenerator((v) => !v)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm"
              >
                <Sparkles className="h-3.5 w-3.5 text-[#f7da64]" />
                <span>Créer une séance (DeepSeek)</span>
              </button>
            </div>
          </div>

          {/* DeepSeek Generator Form */}
          {showGenerator && (
            <form
              onSubmit={(e) => void handleGenerateWorkoutAi(e)}
              className="p-6 rounded-3xl bg-white border border-indigo-200 shadow-sm space-y-4 text-xs"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                  <span>Générer une séance personnalisée (DeepSeek)</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setShowGenerator(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {genError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{genError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Durée (min)</label>
                  <input
                    type="number"
                    min={5}
                    max={45}
                    value={genDuration}
                    onChange={(e) => setGenDuration(Number(e.target.value) || 15)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-600 block mb-1">Objectif</label>
                  <input
                    type="text"
                    value={genFocus}
                    onChange={(e) => setGenFocus(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Contraintes</label>
                  <input
                    type="text"
                    value={genConstraints}
                    onChange={(e) => setGenConstraints(e.target.value)}
                    placeholder="Ex: sans saut, dos fragile"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={generating}
                  className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold flex items-center gap-2 disabled:opacity-40"
                >
                  {generating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Générer la séance</span>
                </button>
              </div>
            </form>
          )}

          {/* Workout selector pills */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {workouts.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedWorkoutId(w.id)}
                className={`px-4 py-2 rounded-2xl border text-xs font-bold shrink-0 transition-all ${
                  w.id === selectedWorkout.id
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                }`}
              >
                {w.title} ({w.durationMinutes} min)
              </button>
            ))}
          </div>

          {/* Selected Routine Detail */}
          <div className="p-6 md:p-8 rounded-[2.2rem] bg-white border border-slate-200/70 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold px-3 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Énergie : {selectedWorkout.energyLevelRequired}
                  </span>
                  <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {selectedWorkout.durationMinutes} minutes chrono
                  </span>
                </div>

                <h4 className="text-2xl font-extrabold text-slate-900 tracking-tight font-jakarta">
                  {selectedWorkout.title}
                </h4>

                <p className="text-xs text-slate-500 mt-1">
                  Objectif :{" "}
                  <span className="text-slate-800 font-semibold">{selectedWorkout.focus}</span>
                </p>
              </div>

              <button
                onClick={() => handleStartWorkout(0)}
                className="flex items-center gap-2.5 px-6 py-3.5 rounded-full bg-[#121316] hover:bg-slate-800 text-white font-extrabold text-xs shadow-lg shadow-slate-900/10 transition-all shrink-0"
              >
                <Play className="h-4 w-4 text-[#f7da64] fill-[#f7da64]" />
                <span>Lancer la séance guidée</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {selectedWorkout.exercises.map((ex, idx) => {
                const isSelected = activeExerciseIndex === idx;
                return (
                  <div
                    key={idx}
                    onClick={() => setActiveExerciseIndex(isSelected ? null : idx)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-slate-50 border-indigo-400 shadow-sm"
                        : "bg-white border-slate-200/80 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="h-7 w-7 rounded-full bg-slate-100 text-slate-800 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-900">{ex.name}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-teal-700 font-bold">
                          {ex.durationOrReps}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartWorkout(idx);
                          }}
                          className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-[#121316] hover:text-white text-slate-700 text-[11px] font-bold transition-all flex items-center gap-1"
                        >
                          <Play className="h-2.5 w-2.5 fill-current" />
                          <span>Démarrer</span>
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 mt-2 pl-10">
                      💡 <span className="text-slate-800 font-medium">{ex.tip}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weekly History */}
          <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-emerald-600" />
                <span>Historique d'activité</span>
              </h4>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                7 derniers jours : {weeklyStats.count} séance(s) · {weeklyStats.minutes} min
              </span>
            </div>

            {workoutLogs.length === 0 ? (
              <p className="text-xs text-slate-400">
                Aucune séance terminée pour le moment. Complétez une séance guidée pour la tracer ici.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                {workoutLogs.slice(0, 6).map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{log.title}</p>
                      <p className="text-[11px] text-slate-500">
                        {new Date(log.completedAt).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span className="font-mono font-bold text-emerald-700 shrink-0">
                      +{log.durationMinutes} min
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
