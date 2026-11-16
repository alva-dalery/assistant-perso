import React, { useState, useEffect } from "react";
import {
  Dumbbell,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  CheckCircle2,
  Clock,
  Flame,
  Volume2,
  VolumeX,
  X,
  Award,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { WorkoutSession, EnergyLevel } from "@/types";

interface SportModuleProps {
  workouts: WorkoutSession[];
  currentEnergy: EnergyLevel;
  onSetEnergy: (energy: EnergyLevel) => void;
  onWorkoutCompleted?: (workoutTitle: string, minutes: number) => void;
}

export const SportModule: React.FC<SportModuleProps> = ({
  workouts,
  currentEnergy,
  onSetEnergy,
  onWorkoutCompleted,
}) => {
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string>(
    currentEnergy === "low" ? "w-low" : currentEnergy === "medium" ? "w-med" : "w-high"
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

  // Ensure current energy selects appropriate routine
  useEffect(() => {
    if (currentEnergy === "low") setSelectedWorkoutId("w-low");
    else if (currentEnergy === "medium") setSelectedWorkoutId("w-med");
    else setSelectedWorkoutId("w-high");
  }, [currentEnergy]);

  const selectedWorkout =
    workouts.find((w) => w.id === selectedWorkoutId) || workouts[0];

  const currentExercise = selectedWorkout.exercises[currentExIdx] || selectedWorkout.exercises[0];

  // Web Audio Chime generator
  const playChime = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.25); // A5
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.7);
    } catch (e) {
      // Audio not permitted or unsupported
    }
  };

  // Helper to parse duration or default to seconds
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
    // If it's repetitions (e.g. "12 répétitions"), give 45 seconds timer
    return 45;
  };

  // Start the live guided workout
  const handleStartWorkout = (startIndex = 0) => {
    setCurrentExIdx(startIndex);
    const secs = parseSecondsForExercise(selectedWorkout.exercises[startIndex]);
    setInitialSeconds(secs);
    setTimerSeconds(secs);
    setIsPaused(false);
    setIsFinished(false);
    setIsLiveSession(true);
    playChime();
  };

  // Timer countdown hook
  useEffect(() => {
    let interval: any = null;
    if (isLiveSession && !isPaused && !isFinished && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0 && isLiveSession && !isFinished) {
      playChime();
      if (currentExIdx < selectedWorkout.exercises.length - 1) {
        // Go to next exercise automatically
        const nextIdx = currentExIdx + 1;
        setCurrentExIdx(nextIdx);
        const secs = parseSecondsForExercise(selectedWorkout.exercises[nextIdx]);
        setInitialSeconds(secs);
        setTimerSeconds(secs);
      } else {
        // Workout finished!
        setIsFinished(true);
        if (onWorkoutCompleted) {
          onWorkoutCompleted(selectedWorkout.title, selectedWorkout.durationMinutes);
        }
      }
    }
    return () => clearInterval(interval);
  }, [isLiveSession, isPaused, isFinished, timerSeconds, currentExIdx, selectedWorkout]);

  const handleNextExercise = () => {
    playChime();
    if (currentExIdx < selectedWorkout.exercises.length - 1) {
      const nextIdx = currentExIdx + 1;
      setCurrentExIdx(nextIdx);
      const secs = parseSecondsForExercise(selectedWorkout.exercises[nextIdx]);
      setInitialSeconds(secs);
      setTimerSeconds(secs);
    } else {
      setIsFinished(true);
      if (onWorkoutCompleted) {
        onWorkoutCompleted(selectedWorkout.title, selectedWorkout.durationMinutes);
      }
    }
  };

  const handlePrevExercise = () => {
    if (currentExIdx > 0) {
      const prevIdx = currentExIdx - 1;
      setCurrentExIdx(prevIdx);
      const secs = parseSecondsForExercise(selectedWorkout.exercises[prevIdx]);
      setInitialSeconds(secs);
      setTimerSeconds(secs);
    }
  };

  const handleQuitSession = () => {
    setIsLiveSession(false);
    setIsFinished(false);
  };

  // Progress calculations
  const progressRatio = Math.max(0, timerSeconds / (initialSeconds || 1));
  const strokeDashoffset = 283 * (1 - progressRatio);
  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;

  return (
    <div className="w-full space-y-6">
      {/* ======================================================== */}
      {/* 1. LIVE WORKOUT SESSION ACTIVE VIEW                      */}
      {/* ======================================================== */}
      {isLiveSession ? (
        <div className="p-6 md:p-10 rounded-[2.5rem] bg-white border border-slate-200/80 shadow-2xl space-y-8 animate-in fade-in zoom-in duration-300 relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-indigo-50/60 rounded-full blur-3xl pointer-events-none" />

          {/* Top Bar of Session */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 relative z-10">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-emerald-500 animate-ping" />
              <div>
                <h4 className="text-base font-extrabold text-slate-900">
                  {selectedWorkout.title}
                </h4>
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
                onClick={handleQuitSession}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
              >
                <X className="h-4 w-4" />
                <span>Quitter</span>
              </button>
            </div>
          </div>

          {/* Celebration Screen on Finish */}
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
                  Bravo Alva ! Vous avez pris soin de votre corps et de votre système nerveux. 
                  Une belle dose d'endorphines et de clarté mentale validée.
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
                  <span className="text-xs text-slate-400 block font-semibold">Dopamine</span>
                  <span className="text-xl font-extrabold text-emerald-600 font-mono">
                    +100% ⚡
                  </span>
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={handleQuitSession}
                  className="px-8 py-3.5 rounded-full bg-[#121316] hover:bg-slate-800 text-white font-extrabold text-xs shadow-md transition-all active:scale-95"
                >
                  Revenir au tableau de bord
                </button>
              </div>
            </div>
          ) : (
            /* Active Exercise Stage */
            <div className="space-y-8 relative z-10">
              {/* Exercise Title and Tip */}
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

              {/* Circular Animated Countdown Ring */}
              <div className="flex flex-col items-center justify-center py-4">
                <div className="relative h-56 w-56 flex items-center justify-center">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                    {/* Background Ring */}
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      className="stroke-slate-100"
                      strokeWidth="6"
                    />
                    {/* Animated Countdown Ring */}
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

                  {/* Digital Clock in Center */}
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

              {/* Next Exercise Preview */}
              {currentExIdx < selectedWorkout.exercises.length - 1 && (
                <div className="text-center text-xs text-slate-400">
                  À suivre : <span className="font-bold text-slate-700">{selectedWorkout.exercises[currentExIdx + 1].name}</span>
                </div>
              )}

              {/* Action Buttons: Pause / Resume, Next, Previous */}
              <div className="flex items-center justify-center gap-4 pt-2">
                <button
                  onClick={handlePrevExercise}
                  disabled={currentExIdx === 0}
                  className="h-12 w-12 rounded-full border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-600 disabled:opacity-30 transition-all"
                  title="Exercice précédent"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className="flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#121316] hover:bg-slate-800 text-white font-extrabold text-sm shadow-xl transition-all active:scale-95"
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
                  title="Exercice suivant"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ======================================================== */
        /* 2. DEFAULT WORKOUT OVERVIEW & SELECTION VIEW             */
        /* ======================================================== */
        <div className="space-y-6">
          {/* Module Title Banner */}
          <div className="p-6 rounded-[2.2rem] bg-white border border-slate-200/70 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight font-jakarta flex items-center gap-2">
                <Dumbbell className="h-6 w-6 text-indigo-600" />
                <span>Sport & Mouvement Adaptatif</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Séances interactives sur-mesure modulées selon votre énergie et votre sommeil • Zéro culpabilité
              </p>
            </div>

            {/* Energy selector shortcut */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl text-xs font-semibold">
              <span className="text-[11px] text-slate-400 px-2">Énergie :</span>
              <button
                onClick={() => {
                  onSetEnergy("low");
                  setSelectedWorkoutId("w-low");
                }}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  currentEnergy === "low"
                    ? "bg-[#f7da64] text-slate-900 font-bold shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Basse (8 min)
              </button>
              <button
                onClick={() => {
                  onSetEnergy("medium");
                  setSelectedWorkoutId("w-med");
                }}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  currentEnergy === "medium"
                    ? "bg-[#a8bf6f] text-slate-900 font-bold shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Modérée (20 min)
              </button>
              <button
                onClick={() => {
                  onSetEnergy("high");
                  setSelectedWorkoutId("w-high");
                }}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  currentEnergy === "high"
                    ? "bg-[#99b7e3] text-slate-900 font-bold shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Haute (35 min)
              </button>
            </div>
          </div>

          {/* Routine Detail Box */}
          <div className="p-6 md:p-8 rounded-[2.2rem] bg-white border border-slate-200/70 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold px-3 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {selectedWorkout.energyLevelRequired === "low"
                      ? "Micro-séance anti-blocage"
                      : selectedWorkout.energyLevelRequired === "medium"
                      ? "Circuit Dopamine & Focus"
                      : "Plein Régime Cardio/Force"}
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
                  Objectif physiologique : <span className="text-slate-800 font-semibold">{selectedWorkout.focus}</span>
                </p>
              </div>

              {/* FUNCTIONAL START BUTTON */}
              <button
                onClick={() => handleStartWorkout(0)}
                className="flex items-center gap-2.5 px-6 py-3.5 rounded-full bg-[#121316] hover:bg-slate-800 text-white font-extrabold text-xs shadow-lg shadow-slate-900/10 transition-all active:scale-95 shrink-0"
              >
                <Play className="h-4 w-4 text-[#f7da64] fill-[#f7da64]" />
                <span>Lancer la séance guidée</span>
              </button>
            </div>

            {/* Exercises list with click to launch individual movement */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Déroulé des mouvements ({selectedWorkout.exercises.length} étapes) :
                </span>
                <span className="text-xs text-slate-400">
                  Cliquez sur un mouvement pour démarrer directement dessus
                </span>
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
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="h-7 w-7 rounded-full bg-slate-100 text-slate-800 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            {ex.name}
                          </span>
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
                            <span>Démarrer ici</span>
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 mt-2 pl-10">
                        💡 Conseil d'exécution : <span className="text-slate-800 font-medium">{ex.tip}</span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
