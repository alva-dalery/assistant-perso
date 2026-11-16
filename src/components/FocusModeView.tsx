import React, { useState, useEffect } from "react";
import { CheckCircle2, ChevronRight, X, Clock, Sparkles } from "lucide-react";

interface FocusAction {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  durationMinutes: number;
}

interface FocusModeViewProps {
  onExit: () => void;
}

export const FocusModeView: React.FC<FocusModeViewProps> = ({ onExit }) => {
  const actions: FocusAction[] = [
    {
      id: "act-1",
      category: "Santé & Régulation",
      title: "Boire un grand verre d'eau et prendre tes compléments du matin",
      subtitle: "Magnésium + Tyrosine prêts pour nourrir ta concentration.",
      durationMinutes: 2,
    },
    {
      id: "act-2",
      category: "Emails & Secrétariat",
      title: "Valider en 1 clic le mail de réponse à Marc Lefèvre",
      subtitle: "Le brouillon est déjà rédigé avec tes mots et ton style habituel.",
      durationMinutes: 3,
    },
    {
      id: "act-3",
      category: "Corps & Énergie",
      title: "Faire 5 minutes de respiration ou étirements doux",
      subtitle: "Baisse le niveau de cortisol et réveille la circulation.",
      durationMinutes: 5,
    },
  ];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedList, setCompletedList] = useState<string[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(actions[0].durationMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [celebration, setCelebration] = useState(false);

  const currentAction = actions[currentIndex] || null;

  useEffect(() => {
    if (currentAction) {
      setSecondsLeft(currentAction.durationMinutes * 60);
      setIsRunning(false);
    }
  }, [currentIndex, currentAction]);

  useEffect(() => {
    let interval: any = null;
    if (isRunning && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, secondsLeft]);

  const handleComplete = () => {
    if (!currentAction) return;
    setCelebration(true);
    setCompletedList([...completedList, currentAction.id]);

    setTimeout(() => {
      setCelebration(false);
      if (currentIndex < actions.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    }, 1200);
  };

  const handleSkip = () => {
    if (currentIndex < actions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setCurrentIndex(0);
    }
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto">
      {/* Top bar in focus mode */}
      <div className="w-full flex items-center justify-between mb-8 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs text-indigo-600 font-semibold">
          <span className="h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
          <span>Mode Focus TDAH — Une seule action à la fois</span>
        </div>
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200 shadow-sm transition-all"
        >
          <X className="h-3.5 w-3.5" />
          <span>Quitter le mode Focus</span>
        </button>
      </div>

      {celebration ? (
        <div className="py-16 space-y-4 animate-in fade-in zoom-in duration-300">
          <div className="h-20 w-20 mx-auto rounded-3xl bg-teal-100 text-teal-700 flex items-center justify-center shadow-lg shadow-teal-100">
            <Sparkles className="h-10 w-10 animate-bounce" />
          </div>
          <h3 className="text-2xl font-extrabold text-slate-900">Super travail !</h3>
          <p className="text-xs text-slate-500">
            Micro-action validée. Une goutte de dopamine bien méritée 💧
          </p>
        </div>
      ) : currentAction ? (
        <div className="w-full bg-white rounded-3xl p-8 border border-slate-200/80 shadow-[0_15px_40px_-15px_rgba(0,0,0,0.06)] space-y-6">
          <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider">
            {currentAction.category}
          </span>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-snug">
            {currentAction.title}
          </h2>

          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {currentAction.subtitle}
          </p>

          {/* Simple Zen Timer */}
          <div className="py-2">
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-3xl font-mono font-bold text-slate-800">
              <Clock className="h-6 w-6 text-teal-600" />
              <span>
                {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
              </span>
              <button
                onClick={() => setIsRunning(!isRunning)}
                className="text-xs px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-sans font-semibold ml-2 shadow-sm"
              >
                {isRunning ? "Pause" : "Démarrer"}
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleComplete}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md shadow-slate-900/10 active:scale-95 transition-all"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>C'est fait ! (+ Dopamine)</span>
            </button>

            <button
              onClick={handleSkip}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition-all"
            >
              <span>Passer sans culpabiliser</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="py-12 space-y-4">
          <div className="h-16 w-16 mx-auto rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">
            Toutes les micro-actions sont terminées !
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Bravo, vos priorités sont accomplies sans surcharge mentale.
          </p>
          <button
            onClick={onExit}
            className="px-6 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 shadow-sm"
          >
            Retour au tableau de bord
          </button>
        </div>
      )}
    </div>
  );
};
