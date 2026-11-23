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
  Trash2,
  Download,
  Loader2,
  X,
  AlertCircle,
} from "lucide-react";
import { aiPost } from "@/lib/aiClient";
import type { DisputeCase } from "@/types";

interface LitigesModuleProps {
  userName: string;
  disputes: DisputeCase[];
  onCreateDispute: (dispute: Omit<DisputeCase, "id">) => void;
  onUpdateDispute: (id: string, patch: Partial<DisputeCase>) => void;
  onDeleteDispute: (id: string) => void;
}

const STATUS_META: Record<
  DisputeCase["status"],
  { label: string; badge: string }
> = {
  action_requise: { label: "Action requise", badge: "bg-amber-100 text-amber-900" },
  en_cours: { label: "En cours", badge: "bg-sky-100 text-sky-900" },
  attente_reponse: { label: "En attente", badge: "bg-teal-100 text-teal-900" },
  resolu: { label: "Résolu", badge: "bg-emerald-100 text-emerald-900" },
};

export const LitigesModule: React.FC<LitigesModuleProps> = ({
  userName,
  disputes,
  onCreateDispute,
  onUpdateDispute,
  onDeleteDispute,
}) => {
  const [selectedCaseId, setSelectedCaseId] = useState<string>(disputes[0]?.id || "");
  const [copied, setCopied] = useState(false);

  // Modal nouveau dossier
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAdversary, setNewAdversary] = useState("");
  const [newRef, setNewRef] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newAction, setNewAction] = useState("");
  const [newFacts, setNewFacts] = useState("");

  // Ajout historique
  const [newEventText, setNewEventText] = useState("");

  // Génération courrier IA
  const [tone, setTone] = useState<"amiable" | "mise_en_demeure" | "mediateur">(
    "mise_en_demeure"
  );
  const [aiGoal, setAiGoal] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const selectedCase =
    disputes.find((d) => d.id === selectedCaseId) || disputes[0] || null;

  const handleCopyLetter = () => {
    if (selectedCase?.draftedLetter?.body) {
      void navigator.clipboard.writeText(selectedCase.draftedLetter.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadLetter = () => {
    if (!selectedCase?.draftedLetter?.body) return;
    const content = `Objet : ${selectedCase.draftedLetter.subject}\nRéférence : ${selectedCase.referenceNumber}\n\n${selectedCase.draftedLetter.body}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `courrier-${selectedCase.referenceNumber || selectedCase.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newAdversary.trim()) return;
    const todayLabel = new Date().toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    onCreateDispute({
      title: newTitle.trim(),
      adversary: newAdversary.trim(),
      referenceNumber: newRef.trim() || `DOS-${Date.now().toString().slice(-6)}`,
      status: "action_requise",
      nextDeadline: newDeadline.trim() || "À définir",
      actionRequired: newAction.trim() || "Rédiger le premier courrier officiel",
      history: [
        {
          date: todayLabel,
          action: newFacts.trim() || "Ouverture du dossier dans Assistant perso.",
        },
      ],
    });
    setNewTitle("");
    setNewAdversary("");
    setNewRef("");
    setNewDeadline("");
    setNewAction("");
    setNewFacts("");
    setShowNewModal(false);
  };

  const handleAddHistory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !newEventText.trim()) return;
    const dateLabel = new Date().toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    onUpdateDispute(selectedCase.id, {
      history: [...selectedCase.history, { date: dateLabel, action: newEventText.trim() }],
    });
    setNewEventText("");
  };

  const handleGenerateLetterAi = async () => {
    if (!selectedCase || draftLoading) return;
    setDraftLoading(true);
    setDraftError(null);
    try {
      const res = await aiPost<{
        subject: string;
        body: string;
        legalBasis: string;
        nextRecommendedAction: string;
      }>("/api/ai/disputes", {
        title: selectedCase.title,
        adversary: selectedCase.adversary,
        referenceNumber: selectedCase.referenceNumber,
        facts: selectedCase.actionRequired,
        goal: aiGoal.trim() || undefined,
        history: selectedCase.history,
        userName: `${userName} DALERY`.trim(),
        tone,
      });

      onUpdateDispute(selectedCase.id, {
        actionRequired: res.nextRecommendedAction || selectedCase.actionRequired,
        draftedLetter: {
          subject: res.subject,
          body: res.body,
          legalBasis: res.legalBasis,
        },
      });
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Erreur rédaction DeepSeek.");
    } finally {
      setDraftLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Scale className="h-5 w-5 text-amber-600" />
            <span>Litiges</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Suivi des dossiers d'assurance, banques, litiges conso • Rédaction juridique DeepSeek (LRAR)
          </p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Ouvrir un nouveau dossier</span>
        </button>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Cases list */}
        <div className="lg:col-span-4 space-y-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
            Mes Dossiers ({disputes.length})
          </span>

          {disputes.length === 0 ? (
            <div className="p-6 rounded-3xl bg-white border border-slate-200/70 text-xs text-slate-500 text-center">
              Aucun dossier actif. Cliquez sur « Ouvrir un nouveau dossier ».
            </div>
          ) : (
            <div className="space-y-2.5">
              {disputes.map((item) => {
                const isSelected = selectedCase?.id === item.id;
                const meta = STATUS_META[item.status] || STATUS_META.en_cours;
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
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <span className="font-bold text-slate-900 truncate">{item.adversary}</span>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold shrink-0 ${meta.badge}`}>
                        {meta.label}
                      </span>
                    </div>

                    <p className="font-semibold text-slate-700 line-clamp-2 mb-2">{item.title}</p>

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
          )}
        </div>

        {/* Selected Dispute Detail */}
        <div className="lg:col-span-8 space-y-4">
          {selectedCase && (
            <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-5">
              <div className="border-b border-slate-100 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-mono text-slate-400">
                    Réf : {selectedCase.referenceNumber}
                  </span>

                  <div className="flex items-center gap-2">
                    <select
                      value={selectedCase.status}
                      onChange={(e) =>
                        onUpdateDispute(selectedCase.id, {
                          status: e.target.value as DisputeCase["status"],
                        })
                      }
                      className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-800"
                    >
                      <option value="action_requise">Action requise</option>
                      <option value="en_cours">En cours</option>
                      <option value="attente_reponse">En attente de réponse</option>
                      <option value="resolu">Résolu</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => onDeleteDispute(selectedCase.id)}
                      title="Supprimer ce dossier"
                      className="p-1.5 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <h4 className="text-base font-bold text-slate-900 mt-2">{selectedCase.title}</h4>
                <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
                  <p className="text-xs text-slate-500">
                    Partie adverse :{" "}
                    <span className="text-slate-900 font-bold">{selectedCase.adversary}</span>
                  </p>
                  <span className="text-xs text-amber-800 font-bold flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                    Échéance : {selectedCase.nextDeadline}
                  </span>
                </div>
              </div>

              {/* Action Required Alert */}
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs flex-1">
                  <span className="font-bold text-amber-900 block">Action à mener :</span>
                  <p className="text-amber-800 mt-0.5">{selectedCase.actionRequired}</p>
                </div>
              </div>

              {/* Timeline + add entry */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  Historique du dossier :
                </span>
                <div className="space-y-1.5 pl-2 border-l-2 border-slate-100">
                  {selectedCase.history.map((h, idx) => (
                    <div key={idx} className="relative pl-4 text-xs">
                      <div className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full bg-slate-300" />
                      <span className="text-[11px] text-slate-400 font-mono block">{h.date}</span>
                      <span className="text-slate-700 font-medium">{h.action}</span>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddHistory} className="flex gap-2 pt-1 text-xs">
                  <input
                    type="text"
                    value={newEventText}
                    onChange={(e) => setNewEventText(e.target.value)}
                    placeholder="Ajouter un événement (ex: Relance envoyée par LRAR)..."
                    className="flex-1 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
                  />
                  <button
                    type="submit"
                    disabled={!newEventText.trim()}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold disabled:opacity-40"
                  >
                    Ajouter
                  </button>
                </form>
              </div>

              {/* AI Legal Letter Generator */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3 text-xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    Rédiger / Régénérer le courrier (DeepSeek)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={tone}
                    onChange={(e) =>
                      setTone(e.target.value as "amiable" | "mise_en_demeure" | "mediateur")
                    }
                    className="px-3 py-2 rounded-xl bg-white border border-slate-200 font-semibold"
                  >
                    <option value="amiable">Relance amiable ferme</option>
                    <option value="mise_en_demeure">Mise en demeure (LRAR 8j)</option>
                    <option value="mediateur">Saisine du Médiateur</option>
                  </select>
                  <input
                    type="text"
                    value={aiGoal}
                    onChange={(e) => setAiGoal(e.target.value)}
                    placeholder="Précision (ex: montant exact, immatriculation, délai)..."
                    className="sm:col-span-2 px-3 py-2 rounded-xl bg-white border border-slate-200"
                  />
                </div>

                {draftError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{draftError}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void handleGenerateLetterAi()}
                  disabled={draftLoading}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center gap-2 disabled:opacity-40"
                >
                  {draftLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  <span>
                    {selectedCase.draftedLetter
                      ? "Régénérer le courrier par DeepSeek"
                      : "Rédiger le courrier juridique par DeepSeek"}
                  </span>
                </button>
              </div>

              {/* Editable Drafted Formal Letter */}
              {selectedCase.draftedLetter && (
                <div className="space-y-3 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-teal-600" />
                        {selectedCase.draftedLetter.subject}
                      </span>
                      <span className="text-[11px] text-teal-700 font-medium block mt-0.5">
                        Fondement : {selectedCase.draftedLetter.legalBasis}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyLetter}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold border border-slate-200"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-teal-600" />
                            <span className="text-teal-700">Copié !</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 text-slate-500" />
                            <span>Copier</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadLetter}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-semibold border border-slate-200"
                      >
                        <Download className="h-3.5 w-3.5 text-slate-500" />
                        <span>.txt</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={11}
                    value={selectedCase.draftedLetter.body}
                    onChange={(e) =>
                      onUpdateDispute(selectedCase.id, {
                        draftedLetter: {
                          ...selectedCase.draftedLetter!,
                          body: e.target.value,
                        },
                      })
                    }
                    className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-sans leading-relaxed focus:outline-none focus:bg-white focus:border-teal-500 shadow-inner"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal Nouveau Dossier */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateSubmit}
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
              Ouvrir un nouveau dossier de litige
            </h3>

            <div className="space-y-3">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Titre du litige *</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Remboursement billet annulé / Dépôt de garantie"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Partie adverse *</label>
                  <input
                    type="text"
                    value={newAdversary}
                    onChange={(e) => setNewAdversary(e.target.value)}
                    placeholder="Ex: SNCF, Agence Immo, Free..."
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">N° de dossier / contrat</label>
                  <input
                    type="text"
                    value={newRef}
                    onChange={(e) => setNewRef(e.target.value)}
                    placeholder="DOS-2026-..."
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">Prochaine échéance</label>
                <input
                  type="text"
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                  placeholder="Ex: 15 décembre 2026"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">Action immédiate requise</label>
                <input
                  type="text"
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  placeholder="Ex: Envoyer une mise en demeure de remboursement (180€)"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">Faits initiaux</label>
                <textarea
                  rows={3}
                  value={newFacts}
                  onChange={(e) => setNewFacts(e.target.value)}
                  placeholder="Résumé chronologique des faits..."
                  className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>
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
                className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold"
              >
                Créer le dossier
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
