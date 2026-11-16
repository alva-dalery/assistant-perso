import React, { useState } from "react";
import { Mail, CheckCircle2, Edit3, Send, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { EmailDraft } from "@/types";
import { GmailInbox } from "@/components/GmailInbox";

interface EmailsModuleProps {
  emails: EmailDraft[];
  onApprove: (id: string) => void;
  onUpdateDraft: (id: string, newReply: string) => void;
  /** Signature utilisée pour les brouillons Gmail (ex. « Bien cordialement, Alex »). */
  signature?: string;
}

export const EmailsModule: React.FC<EmailsModuleProps> = ({
  emails,
  onApprove,
  onUpdateDraft,
  signature = "",
}) => {
  const [view, setView] = useState<"queue" | "gmail">("queue");
  const [selectedEmailId, setSelectedEmailId] = useState<string>(emails[0]?.id || "");
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [showStyleConfig, setShowStyleConfig] = useState(false);
  const [personalTone, setPersonalTone] = useState(
    "Direct, chaleureux, bienveillant mais concis. Jamais de phrases toutes faites type 'J'espère que vous allez bien'. Signe par 'Alex' ou 'Bien cordialement, Alex' selon le degré de proximité."
  );

  const selectedEmail = emails.find((e) => e.id === selectedEmailId) || emails[0];

  const handleStartEdit = () => {
    if (selectedEmail) {
      setEditedText(selectedEmail.suggestedReply);
      setIsEditing(true);
    }
  };

  const handleSaveEdit = () => {
    if (selectedEmail) {
      onUpdateDraft(selectedEmail.id, editedText);
      setIsEditing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Header with Personal Style Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm">
        <div>
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Mail className="h-5 w-5 text-teal-600" />
            <span>Secrétariat</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Validation obligatoire avant envoi • Style 100% calqué sur votre plume naturelle.
          </p>
        </div>

        <button
          onClick={() => setShowStyleConfig(!showStyleConfig)}
          className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 transition-all"
        >
          <Sparkles className="h-3.5 w-3.5 text-teal-600" />
          <span>{showStyleConfig ? "Masquer réglages style" : "Ajuster ma plume & ton"}</span>
        </button>
      </div>

      {/* Style Configuration Drawer */}
      {showStyleConfig && (
        <div className="p-6 rounded-3xl bg-teal-50/60 border border-teal-200/60 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-teal-600" />
              Directives de style personnel de l'IA
            </span>
            <span className="text-[11px] text-teal-700 font-medium">
              Anti-style IA (zéro formulation robotique)
            </span>
          </div>
          <textarea
            value={personalTone}
            onChange={(e) => setPersonalTone(e.target.value)}
            rows={2}
            className="w-full bg-white border border-teal-200 rounded-2xl p-3.5 text-xs text-slate-800 focus:outline-none focus:border-teal-500 resize-none font-sans shadow-sm"
          />
          <p className="text-[11px] text-slate-500">
            Astuce : L'IA utilise cette empreinte stylistique pour générer des réponses indiscernables de vos propres écrits.
          </p>
        </div>
      )}

      {/* Bascule file d'attente de démonstration / vraie boîte Gmail */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-100/80 border border-slate-200/60 w-fit">
        <button
          onClick={() => setView("queue")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === "queue"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-500 hover:text-slate-800"
            }`}
        >
          File d'attente ({emails.length})
        </button>
        <button
          onClick={() => setView("gmail")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === "gmail"
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-500 hover:text-slate-800"
            }`}
        >
          Boîte Gmail réelle
        </button>
      </div>

      {view === "gmail" ? (
        <GmailInbox signature={signature} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[520px]">
          {/* Email list */}
          <div className="lg:col-span-4 xl:col-span-4 space-y-2.5">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
              File d'attente ({emails.length})
            </span>

            <div className="space-y-2.5">
              {emails.map((email) => {
                const isSelected = email.id === selectedEmailId;
                return (
                  <div
                    key={email.id}
                    onClick={() => {
                      setSelectedEmailId(email.id);
                      setIsEditing(false);
                    }}
                    className={`p-4 rounded-2xl border text-xs cursor-pointer transition-all ${isSelected
                      ? "bg-white border-teal-500 shadow-md ring-2 ring-teal-50"
                      : "bg-white/80 border-slate-200/70 hover:bg-white hover:border-slate-300"
                      }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-slate-800 truncate max-w-[180px]">
                        {email.sender}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {email.receivedDate}
                      </span>
                    </div>

                    <p className="font-medium text-slate-700 truncate mb-1">
                      {email.subject}
                    </p>

                    <p className="text-slate-500 text-[11px] line-clamp-2">
                      {email.summary}
                    </p>

                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100">
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${email.status === "approved"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                          }`}
                      >
                        {email.status === "approved" ? "✓ Envoyé avec succès" : "À valider"}
                      </span>

                      {email.status === "pending_review" && (
                        <span className="text-[10px] text-teal-600 font-semibold">
                          Brouillon prêt →
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Email & Suggested Reply */}
          <div className="lg:col-span-8 xl:col-span-8 bg-white border border-slate-200/70 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
            {selectedEmail ? (
              <div className="space-y-4">
                {/* Header Info */}
                <div className="border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-slate-900">
                      {selectedEmail.subject}
                    </h4>
                    <span className="text-xs text-slate-400 font-mono">
                      {selectedEmail.receivedDate}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    De : <span className="text-slate-800 font-semibold">{selectedEmail.sender}</span> ({selectedEmail.senderEmail})
                  </p>
                  <div className="mt-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-200/60 text-xs text-slate-600">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                      Résumé de la demande :
                    </span>
                    {selectedEmail.summary}
                  </div>
                </div>

                {/* Draft Box */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-teal-800 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                      Réponse rédigée avec votre style
                    </span>

                    {!isEditing && selectedEmail.status === "pending_review" && (
                      <button
                        onClick={handleStartEdit}
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 font-medium"
                      >
                        <Edit3 className="h-3 w-3" />
                        <span>Modifier le texte</span>
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editedText}
                        onChange={(e) => setEditedText(e.target.value)}
                        rows={8}
                        className="w-full bg-slate-50 border border-teal-400 rounded-2xl p-4 text-xs text-slate-800 font-mono focus:outline-none focus:bg-white"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setIsEditing(false)}
                          className="px-3.5 py-1.5 rounded-xl text-xs text-slate-500 hover:text-slate-700"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          className="px-4 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                        >
                          Enregistrer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200/60 text-xs text-slate-800 font-sans whitespace-pre-wrap leading-relaxed shadow-inner">
                      {selectedEmail.suggestedReply}
                    </div>
                  )}
                </div>

                {/* Validation Footer */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <AlertCircle className="h-3.5 w-3.5 text-teal-600" />
                    <span>Validation obligatoire avant envoi.</span>
                  </div>

                  {selectedEmail.status === "pending_review" ? (
                    <button
                      onClick={() => onApprove(selectedEmail.id)}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-md transition-all active:scale-95"
                    >
                      <Send className="h-3.5 w-3.5 text-amber-400" />
                      <span>Valider & Envoyer maintenant</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Email validé et envoyé</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-center text-xs text-slate-400 my-auto">
                Sélectionnez un email dans la colonne de gauche.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
