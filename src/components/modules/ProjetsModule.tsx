import React, { useState } from "react";
import {
  FolderGit2,
  Sparkles,
  Check,
  Plus,
  Coins,
  Clock,
  Compass,
  Wrench,
  Plane,
} from "lucide-react";
import { PersonalProject } from "@/types";

interface ProjetsModuleProps {
  projects: PersonalProject[];
  onToggleTask: (projectId: string, taskId: string) => void;
}

export const ProjetsModule: React.FC<ProjetsModuleProps> = ({
  projects,
  onToggleTask,
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || "");

  const selectedProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0];

  const completedTasksCount =
    selectedProject?.tasks.filter((t) => t.completed).length || 0;
  const totalTasks = selectedProject?.tasks.length || 1;
  const progressPercent = Math.round((completedTasksCount / totalTasks) * 100);

  return (
    <div className="space-y-6">
      {/* Module Title */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FolderGit2 className="h-5 w-5 text-sky-600" />
            <span>Gestion de Projets Personnels (Anti-Overwhelm TDAH)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Bricolage DIY • Voyages • Découpage en micro-jalons sans stress
          </p>
        </div>

        <button className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all">
          <Plus className="h-3.5 w-3.5" />
          <span>Créer un nouveau projet</span>
        </button>
      </div>

      {/* Project Selector Bar */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {projects.map((proj) => {
          const isSelected = proj.id === selectedProjectId;
          const isDIY = proj.category === "diy";
          const Icon = isDIY ? Wrench : Plane;
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
                  isDIY
                    ? "bg-amber-100 text-amber-800"
                    : "bg-teal-100 text-teal-800"
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

      {/* Selected Project Full Details */}
      {selectedProject && (
        <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-6">
          {/* Header & Budget */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-md bg-slate-100 text-sky-800">
                {selectedProject.category === "diy" ? "Projet Bricolage DIY" : "Organisation Voyage"}
              </span>
              <h3 className="text-2xl font-extrabold text-slate-900 mt-2">
                {selectedProject.title}
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
                {selectedProject.summary}
              </p>
            </div>

            {/* Budget & Progress Widget */}
            <div className="flex items-center gap-5 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 shrink-0">
              <div className="space-y-0.5">
                <span className="text-[11px] text-slate-400 flex items-center gap-1 font-semibold">
                  <Coins className="h-3.5 w-3.5 text-amber-500" />
                  <span>Budget Engagé</span>
                </span>
                <p className="text-sm font-bold font-mono text-slate-900">
                  {selectedProject.budgetSpentEur} €{" "}
                  <span className="text-xs font-normal text-slate-400">
                    / {selectedProject.budgetEstEur} €
                  </span>
                </p>
              </div>

              <div className="h-8 w-px bg-slate-200" />

              <div className="space-y-0.5">
                <span className="text-[11px] text-slate-400 font-semibold">Progression</span>
                <p className="text-sm font-bold font-mono text-sky-600">
                  {progressPercent}%
                </p>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden p-0.5">
            <div
              className="bg-gradient-to-r from-teal-400 to-sky-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Micro-steps Checklist */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Micro-jalons d'action (Cliquer pour valider) :
              </span>
              <span className="text-xs text-slate-400">
                Chaque étape est calibrée pour être réalisable sans stress
              </span>
            </div>

            <div className="space-y-2.5">
              {selectedProject.tasks.map((task, idx) => (
                <div
                  key={task.id}
                  onClick={() => onToggleTask(selectedProject.id, task.id)}
                  className={`p-4 rounded-2xl border flex items-start gap-3.5 cursor-pointer transition-all select-none ${
                    task.completed
                      ? "bg-slate-50 border-slate-200/60 opacity-60 line-through"
                      : "bg-white border-slate-200/80 hover:border-sky-300 shadow-sm"
                  }`}
                >
                  <div
                    className={`h-5 w-5 rounded-lg mt-0.5 flex items-center justify-center shrink-0 border ${
                      task.completed
                        ? "bg-sky-500 border-sky-500 text-white"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    {task.completed && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                  </div>

                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        Étape {idx + 1} : {task.title}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono font-medium no-underline">
                        {task.durationEst}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed no-underline">
                      {task.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
