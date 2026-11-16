import React, { useState } from "react";
import { X, Sparkles, Send, CheckCircle2, ArrowRight } from "lucide-react";

interface BrainDumpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddThought: (thought: string, category: string) => void;
}

export const BrainDumpModal: React.FC<BrainDumpModalProps> = ({
  isOpen,
  onClose,
  onAddThought,
}) => {
  const [input, setInput] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [classification, setClassification] = useState<{
    module: string;
    suggestion: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleAnalyze = () => {
    if (!input.trim()) return;
    setAnalyzing(true);

    // Simulation d'analyse instantanée de l'IA
    setTimeout(() => {
      const lower = input.toLowerCase();
      let module = "Tableau de bord (Rappel)";
      let suggestion = "Classé comme action rapide pour aujourd'hui.";

      if (lower.includes("mail") || lower.includes("répondre") || lower.includes("écrire")) {
        module = "Emails & Correspondance";
        suggestion = "Ajouté à la file des brouillons à préparer avec ton style d'écriture.";
      } else if (lower.includes("assurance") || lower.includes("banque") || lower.includes("litige") || lower.includes("remboursement") || lower.includes("constat")) {
        module = "Litiges & Démarches";
        suggestion = "Ajouté au dossier juridique correspondant avec rappel d'échéance.";
      } else if (lower.includes("bain") || lower.includes("nordique") || lower.includes("voyage") || lower.includes("thaïlande") || lower.includes("billet")) {
        module = "Projets Personnels";
        suggestion = "Intégré comme micro-étape découpée dans ton projet.";
      } else if (lower.includes("courses") || lower.includes("manger") || lower.includes("acheter") || lower.includes("frigo") || lower.includes("avocat") || lower.includes("oeuf")) {
        module = "Frigo & Courses";
        suggestion = "Ajouté à ta liste de courses prévisionnelle avec score Yuka.";
      } else if (lower.includes("tenue") || lower.includes("vêtement") || lower.includes("valise") || lower.includes("habit")) {
        module = "Dressing & Valise";
        suggestion = "Enregistré pour l'association vestimentaire ou la checklist de voyage.";
      } else if (lower.includes("sport") || lower.includes("séance") || lower.includes("courir") || lower.includes("étirement")) {
        module = "Sport & Énergie";
        suggestion = "Planifié dans ta routine selon ton niveau d'énergie du jour.";
      }

      setClassification({ module, suggestion });
      setAnalyzing(false);
    }, 600);
  };

  const handleConfirm = () => {
    if (classification) {
      onAddThought(input, classification.module);
      setInput("");
      setClassification(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white border border-slate-200/80 rounded-3xl shadow-2xl overflow-hidden p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-11 w-11 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Vider sa tête (Brain Dump)
            </h3>
            <p className="text-xs text-slate-500">
              Écrivez tout sans tri manuel, l'IA range chaque idée au bon endroit.
            </p>
          </div>
        </div>

        {!classification ? (
          <div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ex: Penser à relancer l'assurance pour les 450€, ou acheter des avocats et des oeufs pour demain..."
              rows={4}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-teal-500 resize-none leading-relaxed shadow-inner"
              autoFocus
            />

            <div className="mt-4 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Zéro stress cognitif garanti.
              </span>
              <button
                onClick={handleAnalyze}
                disabled={!input.trim() || analyzing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-all disabled:opacity-40 shadow-sm"
              >
                {analyzing ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Analyse IA en cours...</span>
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
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <p className="text-[11px] text-slate-400 mb-1 font-semibold">Votre pensée :</p>
              <p className="text-xs text-slate-800 italic">« {input} »</p>
            </div>

            <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-teal-900">
                  Destination suggérée : {classification.module}
                </p>
                <p className="text-xs text-teal-700 mt-1">
                  {classification.suggestion}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setClassification(null)}
                className="px-4 py-2 text-xs text-slate-500 hover:text-slate-800 font-semibold"
              >
                Corriger
              </button>
              <button
                onClick={handleConfirm}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-all shadow-md"
              >
                <span>Valider et classer</span>
                <ArrowRight className="h-3.5 w-3.5 text-amber-400" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
