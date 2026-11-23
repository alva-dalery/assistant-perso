import React, { useState } from "react";
import {
  FolderGit2,
  Sparkles,
  Check,
  Plus,
  Coins,
  Wrench,
  Plane,
  Compass,
  Trash2,
  Loader2,
  X,
  AlertCircle,
} from "lucide-react";
import { aiPost } from "@/lib/aiClient";
import type { PersonalProject, ProjectTask } from "@/types";

interface ProjetsModuleProps {
  projects: PersonalProject[];
  onCreateProject: (project: Omit<PersonalProject, "id">) => void;
  onUpdateProject: (id: string, patch: Partial<PersonalProject>) => void;
  onDeleteProject: (id: string) => void;
  onToggleTask: (projectId: string, taskId: string) => void;
}

export const ProjetsModule: React.FC<ProjetsModuleProps> = ({
  projects,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onToggleTask,
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || "");

  // Modal nouveau projet
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<PersonalProject["category"]>("diy");
  const [newSummary, setNewSummary] = useState("");
  const [newBudget, setNewBudget] = useState("500");
  const [generateWithAi, setGenerateWithAi] = useState(true);
  const [creatingAi, setCreatingAi] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Ajout manuel tâche
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDuration, setNewTaskDuration] = useState("15 min");

  // Découpage tâche IA
  const [breakingTaskId, setBreakingTaskId] = useState<string | null>(null);
  const [breakError, setBreakError] = useState<string | null>(null);

  const selectedProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0] || null;

  const completedTasksCount =
    selectedProject?.tasks.filter((t) => t.completed).length || 0;
  const totalTasks = selectedProject?.tasks.length || 1;
  const progressPercent = selectedProject
    ? Math.round((completedTasksCount / Math.max(1, totalTasks)) * 100)
    : 0;

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || creatingAi) return;
    setCreateError(null);

    let summary = newSummary.trim();
    let tasks: ProjectTask[] = [];

    if (generateWithAi) {
      setCreatingAi(true);
      try {
        const res = await aiPost<{
          summary?: string;
          tasks: Array<{ title: string; description: string; durationEst: string }>;
        }>("/api/ai/projects", {
          action: "create_plan",
          title: newTitle.trim(),
          category: newCategory,
          summary,
        });
        if (res.summary && !summary) summary = res.summary;
        tasks = res.tasks.map((t, idx) => ({
          id: `task-${Date.now()}-${idx}`,
          title: t.title,
          description: t.description,
          durationEst: t.durationEst || "15 min",
          completed: false,
        }));
      } catch (err) {
        setCreateError(
          err instanceof Error
            ? `${err.message} (Décochez la génération IA pour créer le projet manuellement.)`
            : "Erreur génération IA."
        );
        setCreatingAi(false);
        return;
      } finally {
        setCreatingAi(false);
      }
    }

    if (tasks.length === 0) {
      tasks = [
        {
          id: `task-${Date.now()}`,
          title: "Première micro-étape (5 min)",
          description: "Définir la toute première action sans pression.",
          durationEst: "5 min",
          completed: false,
        },
      ];
    }

    onCreateProject({
      title: newTitle.trim(),
      category: newCategory,
      summary: summary || "Projet personnel découpé en étapes simples.",
      budgetEstEur: Math.max(0, Number(newBudget) || 0),
      budgetSpentEur: 0,
      currentStepIndex: 0,
      tasks,
    });

    setNewTitle("");
    setNewSummary("");
    setNewBudget("500");
    setShowNewModal(false);
  };

  const handleAddManualTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !newTaskTitle.trim()) return;
    const task: ProjectTask = {
      id: `task-${Date.now()}`,
      title: newTaskTitle.trim(),
      description: "Étape ajoutée manuellement",
      durationEst: newTaskDuration.trim() || "15 min",
      completed: false,
    };
    onUpdateProject(selectedProject.id, {
      tasks: [...selectedProject.tasks, task],
    });
    setNewTaskTitle("");
  };

  const handleDeleteTask = (taskId: string) => {
    if (!selectedProject) return;
    onUpdateProject(selectedProject.id, {
      tasks: selectedProject.tasks.filter((t) => t.id !== taskId),
    });
  };

  const handleBreakdownTask = async (task: ProjectTask) => {
    if (!selectedProject || breakingTaskId) return;
    setBreakingTaskId(task.id);
    setBreakError(null);
    try {
      const res = await aiPost<{
        tasks: Array<{ title: string; description: string; durationEst: string }>;
      }>("/api/ai/projects", {
        action: "breakdown_task",
        projectTitle: selectedProject.title,
        taskTitle: task.title,
        taskDescription: task.description,
      });

      if (res.tasks.length > 0) {
        const subTasks: ProjectTask[] = res.tasks.map((st, idx) => ({
          id: `sub-${Date.now()}-${idx}`,
          title: `↳ ${st.title}`,
          description: st.description,
          durationEst: st.durationEst || "5 min",
          completed: false,
        }));
        const idx = selectedProject.tasks.findIndex((t) => t.id === task.id);
        const updated = [...selectedProject.tasks];
        updated.splice(idx + 1, 0, ...subTasks);
        onUpdateProject(selectedProject.id, { tasks: updated });
      }
    } catch (err) {
      setBreakError(err instanceof Error ? err.message : "Découpage IA impossible.");
    } finally {
      setBreakingTaskId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FolderGit2 className="h-5 w-5 text-sky-600" />
            <span>Gestion de Projets Personnels (Anti-Overwhelm TDAH)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Bricolage DIY • Voyages • Découpage automatique en micro-jalons par DeepSeek
          </p>
        </div>

        <button
          onClick={() => {
            setCreateError(null);
            setShowNewModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Créer un nouveau projet</span>
        </button>
      </div>

      {/* Project Selector Bar */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {projects.map((proj) => {
          const isSelected = selectedProject?.id === proj.id;
          const Icon =
            proj.category === "diy" ? Wrench : proj.category === "voyage" ? Plane : Compass;
          return (
            <button
              key={proj.id}
              onClick={() => setSelectedProjectId(proj.id)}
              className={`flex items-center gap-3 px-5 py-3.5 rounded-3xl border text-left shrink-0 transition-all ${
                isSelected
                  ? "bg-white border-sky-500 shadow-md ring-2 ring-sky-50"
                  : "bg-white border-slate-200/70 hover:border-slate-300"
              }`}
            >
              <div
                className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 ${
                  proj.category === "diy"
                    ? "bg-amber-100 text-amber-800"
                    : proj.category === "voyage"
                      ? "bg-teal-100 text-teal-800"
                      : "bg-sky-100 text-sky-800"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">{proj.title}</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {proj.tasks.filter((t) => t.completed).length}/{proj.tasks.length} étapes faites
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Project Details */}
      {selectedProject && (
        <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-md bg-slate-100 text-sky-800">
                  {selectedProject.category === "diy"
                    ? "Projet Bricolage DIY"
                    : selectedProject.category === "voyage"
                      ? "Organisation Voyage"
                      : "Projet Personnel"}
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteProject(selectedProject.id)}
                  className="text-[11px] text-slate-400 hover:text-rose-600 flex items-center gap-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Supprimer</span>
                </button>
              </div>
              <h3 className="text-2xl font-extrabold text-slate-900 mt-2">
                {selectedProject.title}
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
                {selectedProject.summary}
              </p>
            </div>

            {/* Editable Budget & Progress */}
            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 shrink-0 text-xs">
              <div className="space-y-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1 font-semibold">
                  <Coins className="h-3.5 w-3.5 text-amber-500" />
                  <span>Budget Engagé / Estimé (€)</span>
                </span>
                <div className="flex items-center gap-1.5 font-mono">
                  <input
                    type="number"
                    min={0}
                    value={selectedProject.budgetSpentEur}
                    onChange={(e) =>
                      onUpdateProject(selectedProject.id, {
                        budgetSpentEur: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-20 px-2 py-1 rounded-lg bg-white border border-slate-200 font-bold text-slate-900"
                  />
                  <span className="text-slate-400">/</span>
                  <input
                    type="number"
                    min={0}
                    value={selectedProject.budgetEstEur}
                    onChange={(e) =>
                      onUpdateProject(selectedProject.id, {
                        budgetEstEur: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-20 px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-600"
                  />
                </div>
              </div>

              <div className="h-8 w-px bg-slate-200" />

              <div className="space-y-0.5">
                <span className="text-[11px] text-slate-400 font-semibold">Progression</span>
                <p className="text-sm font-bold font-mono text-sky-600">{progressPercent}%</p>
              </div>
            </div>
          </div>

          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden p-0.5">
            <div
              className="bg-gradient-to-r from-teal-400 to-sky-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {breakError && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{breakError}</span>
            </div>
          )}

          {/* Micro-steps Checklist */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Micro-jalons d'action ({completedTasksCount}/{selectedProject.tasks.length}) :
              </span>
              <span className="text-xs text-slate-400">
                Une étape te bloque ? Clique sur « Découper (IA) » pour la diviser en 3 mini-pas.
              </span>
            </div>

            <form onSubmit={handleAddManualTask} className="flex flex-col sm:flex-row gap-2 text-xs">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Ajouter une étape manuellement..."
                className="flex-1 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
              />
              <input
                type="text"
                value={newTaskDuration}
                onChange={(e) => setNewTaskDuration(e.target.value)}
                placeholder="Durée (ex: 15 min)"
                className="w-32 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
              />
              <button
                type="submit"
                disabled={!newTaskTitle.trim()}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold disabled:opacity-40"
              >
                + Ajouter étape
              </button>
            </form>

            <div className="space-y-2.5">
              {selectedProject.tasks.map((task, idx) => (
                <div
                  key={task.id}
                  className={`p-4 rounded-2xl border flex items-start gap-3.5 transition-all ${
                    task.completed
                      ? "bg-slate-50 border-slate-200/60 opacity-65"
                      : "bg-white border-slate-200/80 hover:border-sky-300 shadow-sm"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onToggleTask(selectedProject.id, task.id)}
                    className={`h-5 w-5 rounded-lg mt-0.5 flex items-center justify-center shrink-0 border ${
                      task.completed
                        ? "bg-sky-500 border-sky-500 text-white"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    {task.completed && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                  </button>

                  <div className="flex-1 space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        onClick={() => onToggleTask(selectedProject.id, task.id)}
                        className={`text-xs font-bold text-slate-900 cursor-pointer ${
                          task.completed ? "line-through" : ""
                        }`}
                      >
                        Étape {idx + 1} : {task.title}
                      </span>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-mono font-medium">
                          {task.durationEst}
                        </span>
                        {!task.completed && (
                          <button
                            type="button"
                            onClick={() => void handleBreakdownTask(task)}
                            disabled={breakingTaskId !== null}
                            className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 flex items-center gap-1 disabled:opacity-40"
                          >
                            {breakingTaskId === task.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Sparkles className="h-3 w-3" />
                            )}
                            <span>Découper (IA)</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.id)}
                          aria-label="Supprimer cette étape"
                          className="text-slate-300 hover:text-rose-600 p-0.5"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{task.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Nouveau Projet */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleCreateSubmit(e)}
            className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 relative text-xs"
          >
            <button
              type="button"
              onClick={() => setShowNewModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-800"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-base font-extrabold text-slate-900">
              Créer un nouveau projet
            </h3>

            {createError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{createError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Nom du projet *</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Aménager le balcon / Préparer weekend à Rome"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Catégorie</label>
                  <select
                    value={newCategory}
                    onChange={(e) =>
                      setNewCategory(e.target.value as PersonalProject["category"])
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <option value="diy">Bricolage DIY</option>
                    <option value="voyage">Voyage</option>
                    <option value="autre">Autre projet</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Budget estimé (€)</label>
                  <input
                    type="number"
                    min={0}
                    value={newBudget}
                    onChange={(e) => setNewBudget(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  Objectif / contraintes (pour l'IA)
                </label>
                <textarea
                  rows={3}
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  placeholder="Ex: Petit budget, peu de matériel, à faire sur 2 week-ends..."
                  className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-sky-50 border border-sky-200 text-sky-950 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateWithAi}
                  onChange={(e) => setGenerateWithAi(e.target.checked)}
                />
                <Sparkles className="h-4 w-4 text-sky-600 shrink-0" />
                <span>Générer automatiquement les micro-étapes TDAH avec DeepSeek</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 rounded-xl text-slate-500 font-semibold"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={creatingAi}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold flex items-center gap-2 disabled:opacity-40"
              >
                {creatingAi && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{creatingAi ? "Planification DeepSeek..." : "Créer le projet"}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
