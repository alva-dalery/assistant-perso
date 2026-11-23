import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, X, Clock, Sparkles, Plus, ArrowUpRight } from "lucide-react";
import type {
  DisputeCase,
  HealthData,
  ModuleType,
  PersonalProject,
  ReminderItem,
} from "@/types";
import { todayDateString } from "@/lib/storage";

interface FocusAction {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  durationMinutes: number;
  kind: "supplement" | "reminder" | "project" | "dispute" | "email" | "custom";
  supplementId?: string;
  reminderId?: string;
  projectId?: string;
  taskId?: string;
  module?: ModuleType;
}

interface FocusModeViewProps {
  onExit: () => void;
  health: HealthData;
  projects: PersonalProject[];
  disputes: DisputeCase[];
  reminders: ReminderItem[];
  pendingEmailsCount: number;
  onToggleSupplement: (id: string) => void;
  onToggleProjectTask: (projectId: string, taskId: string) => void;
  onToggleReminder: (id: string) => void;
  onNavigate: (module: ModuleType) => void;
}

export const FocusModeView: React.FC<FocusModeViewProps> = ({
  onExit,
  health,
  projects,
  disputes,
  reminders,
  pendingEmailsCount,
  onToggleSupplement,
  onToggleProjectTask,
  onToggleReminder,
  onNavigate,
}) => {
  const [customActions, setCustomActions] = useState<FocusAction[]>([]);
  const [customTitle, setCustomTitle] = useState("");
  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  const [completedCustomIds, setCompletedCustomIds] = useState<string[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(5 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [celebration, setCelebration] = useState(false);

  const actions = useMemo<FocusAction[]>(() => {
    const list: FocusAction[] = [...customActions.filter((a) => !completedCustomIds.includes(a.id))];
    const today = todayDateString();

    for (const sup of health.supplements.filter((s) => !s.taken).slice(0, 2)) {
      list.push({
        id: `sup-${sup.id}`,
        category: "Santé & Compléments",
        title: `Prendre : ${sup.name}`,
        subtitle: `${sup.timing} · ${sup.benefit}`,
        durationMinutes: 2,
        kind: "supplement",
        supplementId: sup.id,
      });
    }

    for (const rem of reminders.filter((r) => !r.completed && r.date <= today)) {
      list.push({
        id: `rem-${rem.id}`,
        category: "Rappel du jour",
        title: rem.title,
        subtitle: rem.note || `Prévu à ${rem.time}`,
        durationMinutes: 5,
        kind: "reminder",
        reminderId: rem.id,
      });
    }

    if (pendingEmailsCount > 0) {
      list.push({
        id: "email-pending",
        category: "Secrétariat Gmail",
        title: `Répondre à ${pendingEmailsCount} email${pendingEmailsCount > 1 ? "s" : ""} en attente`,
        subtitle: "Ouvrir le secrétariat et générer un brouillon en 1 clic.",
        durationMinutes: 5,
        kind: "email",
        module: "emails",
      });
    }

    for (const disp of disputes.filter((d) => d.status === "action_requise")) {
      list.push({
        id: `disp-${disp.id}`,
        category: "Litige prioritaire",
        title: disp.title,
        subtitle: disp.actionRequired,
        durationMinutes: 10,
        kind: "dispute",
        module: "litiges",
      });
    }

    for (const proj of projects) {
      const nextTask = proj.tasks.find((t) => !t.completed);
      if (nextTask) {
        list.push({
          id: `proj-${proj.id}-${nextTask.id}`,
          category: `Projet · ${proj.title}`,
          title: nextTask.title,
          subtitle: nextTask.description,
          durationMinutes: 10,
          kind: "project",
          projectId: proj.id,
          taskId: nextTask.id,
        });
      }
    }

    return list.filter((item) => !skippedIds.includes(item.id));
  }, [
    customActions,
    completedCustomIds,
    health.supplements,
    reminders,
    pendingEmailsCount,
    disputes,
    projects,
    skippedIds,
  ]);

  const currentAction = actions[0] || null;

  useEffect(() => {
    if (currentAction) {
      setSecondsLeft(currentAction.durationMinutes * 60);
      setIsRunning(false);
    }
  }, [currentAction?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isRunning || secondsLeft <= 0) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, secondsLeft]);

  const handleComplete = () => {
    if (!currentAction) return;
    setCelebration(true);
    setIsRunning(false);

    if (currentAction.kind === "supplement" && currentAction.supplementId) {
      onToggleSupplement(currentAction.supplementId);
    } else if (currentAction.kind === "reminder" && currentAction.reminderId) {
      onToggleReminder(currentAction.reminderId);
    } else if (
      currentAction.kind === "project" &&
      currentAction.projectId &&
      currentAction.taskId
    ) {
      onToggleProjectTask(currentAction.projectId, currentAction.taskId);
    } else if (currentAction.kind === "custom") {
      setCompletedCustomIds((prev) => [...prev, currentAction.id]);
    } else {
      setSkippedIds((prev) => [...prev, currentAction.id]);
    }

    setTimeout(() => {
      setCelebration(false);
    }, 1000);
  };

  const handleSkip = () => {
    if (!currentAction) return;
    setSkippedIds((prev) => [...prev, currentAction.id]);
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim()) return;
    setCustomActions((prev) => [
      {
        id: `custom-${Date.now()}`,
        category: "Micro-action Focus",
        title: customTitle.trim(),
        subtitle: "Ajoutée pour cette session sans distraction",
        durationMinutes: 5,
        kind: "custom",
      },
      ...prev,
    ]);
    setCustomTitle("");
  };

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 text-center max-w-xl mx-auto">
      {/* Top bar */}
      <div className="w-full flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2 text-xs text-indigo-600 font-semibold">
          <span className="h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
          <span>Mode Focus TDAH — {actions.length} micro-action(s) restante(s)</span>
        </div>
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200 shadow-sm transition-all"
        >
          <X className="h-3.5 w-3.5" />
          <span>Quitter le mode Focus</span>
        </button>
      </div>

      {/* Quick add single task */}
      <form onSubmit={handleAddCustom} className="w-full flex gap-2 mb-6">
        <input
          type="text"
          value={customTitle}
          onChange={(e) => setCustomTitle(e.target.value)}
          placeholder="Ajouter une micro-action immédiate (5 min)..."
          className="flex-1 px-4 py-2 rounded-2xl bg-white border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-indigo-400"
        />
        <button
          type="submit"
          disabled={!customTitle.trim()}
          className="px-4 py-2 rounded-2xl bg-slate-900 text-white text-xs font-bold disabled:opacity-40 flex items-center gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Ajouter</span>
        </button>
      </form>

      {celebration ? (
        <div className="py-16 space-y-4 animate-in fade-in zoom-in duration-300">
          <div className="h-20 w-20 mx-auto rounded-3xl bg-teal-100 text-teal-700 flex items-center justify-center shadow-lg shadow-teal-100">
            <Sparkles className="h-10 w-10 animate-bounce" />
          </div>
          <h3 className="text-2xl font-extrabold text-slate-900">Super travail !</h3>
          <p className="text-xs text-slate-500">
            Micro-action validée et enregistrée dans votre espace.
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

          <p className="text-xs text-slate-500 max-w-md mx-auto">{currentAction.subtitle}</p>

          {/* Timer */}
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
              <span>C'est fait !</span>
            </button>

            {currentAction.module && (
              <button
                onClick={() => onNavigate(currentAction.module!)}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-3.5 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold transition-all"
              >
                <span>Ouvrir le module</span>
                <ArrowUpRight className="h-4 w-4" />
              </button>
            )}

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
            Bravo, vos priorités du moment sont accomplies sans surcharge mentale.
          </p>
          <div className="flex items-center justify-center gap-3">
            {skippedIds.length > 0 && (
              <button
                onClick={() => setSkippedIds([])}
                className="px-5 py-2.5 rounded-2xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
              >
                Réafficher les {skippedIds.length} action(s) passée(s)
              </button>
            )}
            <button
              onClick={onExit}
              className="px-6 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 shadow-sm"
            >
              Retour au tableau de bord
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
