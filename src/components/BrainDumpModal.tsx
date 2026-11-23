import React, { useState } from "react";
import { X, Sparkles, Send, CheckCircle2, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { aiPost } from "@/lib/aiClient";
import type {
  BrainDumpConfirmAction,
  DisputeCase,
  ModuleType,
  PersonalProject,
  UserProfile,
} from "@/types";

interface BrainDumpModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: PersonalProject[];
  disputes: DisputeCase[];
  userProfile: UserProfile;
  onConfirmAction: (action: BrainDumpConfirmAction) => void;
}

interface BrainDumpApiResponse extends BrainDumpConfirmAction {
  mode: "deepseek" | "local";
}

const ACTION_OPTIONS: Array<{
  actionType: BrainDumpConfirmAction["actionType"];
  targetModule: ModuleType;
  label: string;
}> = [
  { actionType: "add_reminder", targetModule: "dashboard", label: "Rappel du jour (Dashboard)" },
  { actionType: "add_shopping", targetModule: "courses", label: "Liste de courses (Food)" },
  { actionType: "add_pantry", targetModule: "courses", label: "Inventaire Frigo (Food)" },
  { actionType: "add_project_task", targetModule: "projets", label: "Étape de projet (Projets)" },
  { actionType: "create_project", targetModule: "projets", label: "Nouveau projet (Projets)" },
  { actionType: "add_dispute_note", targetModule: "litiges", label: "Note sur un litige (Litiges)" },
  { actionType: "add_clothing", targetModule: "dressing", label: "Pièce vêtement (Dressing)" },
];

export const BrainDumpModal: React.FC<BrainDumpModalProps> = ({
  isOpen,
  onClose,
  projects,
  disputes,
  userProfile,
  onConfirmAction,
}) => {
  const [input, setInput] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classification, setClassification] = useState<BrainDumpApiResponse | null>(null);

  if (!isOpen) return null;

  const handleAnalyze = async () => {
    if (!input.trim() || analyzing) return;
    setAnalyzing(true);
    setError(null);

    try {
      const result = await aiPost<BrainDumpApiResponse>("/api/ai/brain-dump", {
        text: input.trim(),
        projects: projects.map((p) => ({ id: p.id, title: p.title })),
        disputes: disputes.map((d) => ({ id: d.id, title: d.title, adversary: d.adversary })),
        userProfile: { name: userProfile.name, tdahNotes: userProfile.tdahNotes },
      });
      setClassification(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'analyser cette pensée.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConfirm = () => {
    if (!classification) return;
    onConfirmAction(classification);
    setInput("");
    setClassification(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white border border-slate-200/80 rounded-3xl shadow-2xl overflow-hidden p-6 relative">
        <button
          onClick={() => {
            setError(null);
            onClose();
          }}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-11 w-11 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Vider sa tête (Brain Dump)</h3>
            <p className="text-xs text-slate-500">
              Écrivez tout sans tri manuel : l'assistant crée directement l'action au bon endroit.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-3 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!classification ? (
          <div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  void handleAnalyze();
                }
              }}
              placeholder="Ex: Penser à relancer l'assurance pour les 450€, ou acheter des avocats et des oeufs pour demain..."
              rows={4}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-teal-500 resize-none leading-relaxed shadow-inner"
              autoFocus
            />

            <div className="mt-4 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Cmd/Ctrl + Entrée pour analyser.
              </span>
              <button
                onClick={() => void handleAnalyze()}
                disabled={!input.trim() || analyzing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-all disabled:opacity-40 shadow-sm"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Analyse en cours...</span>
                  </>
                ) : (
                  <>
                    <span>Classer automatiquement</span>
                    <Send className="h-3.5 w-3.5 text-amber-400" />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-teal-900">
                    {classification.moduleLabel}
                  </p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-teal-800 border border-teal-200">
                    {classification.mode === "deepseek" ? "DeepSeek IA" : "Tri local"}
                  </span>
                </div>
                <p className="text-xs text-teal-700">{classification.suggestion}</p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">
                  Action à créer :
                </label>
                <select
                  value={classification.actionType}
                  onChange={(e) => {
                    const nextType = e.target.value as BrainDumpConfirmAction["actionType"];
                    const found = ACTION_OPTIONS.find((opt) => opt.actionType === nextType);
                    setClassification({
                      ...classification,
                      actionType: nextType,
                      targetModule: found?.targetModule || classification.targetModule,
                      moduleLabel: found?.label || classification.moduleLabel,
                    });
                  }}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-semibold"
                >
                  {ACTION_OPTIONS.map((opt) => (
                    <option key={opt.actionType} value={opt.actionType}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">
                  Titre / Libellé enregistré :
                </label>
                <input
                  type="text"
                  value={classification.payload.title || classification.summary}
                  onChange={(e) =>
                    setClassification({
                      ...classification,
                      payload: { ...classification.payload, title: e.target.value },
                    })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-medium"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setClassification(null)}
                className="px-4 py-2 text-xs text-slate-500 hover:text-slate-800 font-semibold"
              >
                Modifier le texte
              </button>
              <button
                onClick={handleConfirm}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-all shadow-md"
              >
                <span>Valider et enregistrer</span>
                <ArrowRight className="h-3.5 w-3.5 text-amber-400" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
