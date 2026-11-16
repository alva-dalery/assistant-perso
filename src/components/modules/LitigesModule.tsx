import React, { useState } from "react";
import {
  Scale,
  Sparkles,
  AlertTriangle,
  Clock,
  FileText,
  Copy,
  Check,
  Plus,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { DisputeCase } from "@/types";

interface LitigesModuleProps {
  disputes: DisputeCase[];
}

export const LitigesModule: React.FC<LitigesModuleProps> = ({ disputes }) => {
  const [selectedCaseId, setSelectedCaseId] = useState<string>(disputes[0]?.id || "");
  const [copied, setCopied] = useState(false);

  const selectedCase =
    disputes.find((d) => d.id === selectedCaseId) || disputes[0];

  const handleCopyLetter = () => {
    if (selectedCase?.draftedLetter) {
      navigator.clipboard.writeText(selectedCase.draftedLetter.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Title */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Scale className="h-5 w-5 text-amber-600" />
            <span>Litiges</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Suivi des dossiers d'assurance, banques, litiges conso • Rédaction de courriers juridiques (LRAR)
          </p>
        </div>

        <button className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all">
          <Plus className="h-3.5 w-3.5" />
          <span>Ouvrir un nouveau dossier</span>
        </button>
      </div>

      {/* Main Layout: Cases list on Left, Case Detail & Formal Letter on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Cases list */}
        <div className="lg:col-span-4 space-y-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
            Mes Dossiers Actifs ({disputes.length})
          </span>

          <div className="space-y-2.5">
            {disputes.map((item) => {
              const isSelected = item.id === selectedCaseId;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedCaseId(item.id)}
                  className={`p-4 rounded-2xl border text-xs cursor-pointer transition-all ${
                    isSelected
                      ? "bg-white border-amber-500 shadow-md ring-2 ring-amber-50"
                      : "bg-white border-slate-200/70 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-slate-900 truncate">
                      {item.adversary}
                    </span>
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                        item.status === "action_requise"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-teal-100 text-teal-900"
                      }`}
                    >
                      {item.status === "action_requise" ? "Action requise" : "En attente"}
                    </span>
                  </div>

                  <p className="font-semibold text-slate-700 line-clamp-2 mb-2">
                    {item.title}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                    <span className="font-mono text-slate-500">{item.referenceNumber}</span>
                    <span className="text-amber-700 font-bold flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {item.nextDeadline}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Dispute Detail & Letter */}
        <div className="lg:col-span-8 space-y-4">
          {selectedCase && (
            <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-5">
              {/* Header */}
              <div className="border-b border-slate-100 pb-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">
                    Réf : {selectedCase.referenceNumber}
                  </span>
                  <span className="text-xs text-amber-800 font-bold flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                    Échéance : {selectedCase.nextDeadline}
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-900 mt-2">
                  {selectedCase.title}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Partie adverse : <span className="text-slate-900 font-bold">{selectedCase.adversary}</span>
                </p>
              </div>

              {/* Action Required Alert */}
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-bold text-amber-900 block">
                    Action recommandée par l'assistant :
                  </span>
                  <p className="text-amber-800 mt-0.5">
                    {selectedCase.actionRequired}
                  </p>
                </div>
              </div>

              {/* Timeline of events */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  Historique du dossier :
                </span>
                <div className="space-y-1.5 pl-2 border-l-2 border-slate-100">
                  {selectedCase.history.map((h, idx) => (
                    <div key={idx} className="relative pl-4 text-xs">
                      <div className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full bg-slate-300" />
                      <span className="text-[11px] text-slate-400 font-mono block">
                        {h.date}
                      </span>
                      <span className="text-slate-700 font-medium">{h.action}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Drafted Formal Letter */}
              {selectedCase.draftedLetter && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-teal-600" />
                        Courrier officiel rédigé par l'IA
                      </span>
                      <span className="text-[11px] text-teal-700 font-medium block mt-0.5">
                        Fondement juridique : {selectedCase.draftedLetter.legalBasis}
                      </span>
                    </div>

                    <button
                      onClick={handleCopyLetter}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold border border-slate-200 transition-all"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-teal-600" />
                          <span className="text-teal-700">Copié !</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 text-slate-500" />
                          <span>Copier le texte</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed max-h-72 overflow-y-auto shadow-inner">
                    {selectedCase.draftedLetter.body}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
