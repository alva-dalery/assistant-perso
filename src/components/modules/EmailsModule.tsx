import React from "react";
import { Mail } from "lucide-react";
import { EmailDraft } from "@/types";
import { GmailInbox } from "@/components/GmailInbox";

interface EmailsModuleProps {
  emails: EmailDraft[];
  onApprove: (id: string) => void;
  onUpdateDraft: (id: string, newReply: string) => void;
  /** Signature utilisée pour les brouillons Gmail (ex. « Bien cordialement, Alva DALERY »). */
  signature?: string;
}

/**
 * Secrétariat : la boîte Gmail réelle est l'unique vue.
 * L'ancienne « file d'attente » de démonstration a été retirée pour éviter
 * la confusion entre faux brouillons et vrais emails en attente.
 * Les props `emails`, `onApprove` et `onUpdateDraft` restent acceptées pour
 * ne pas casser l'appelant, mais ne sont plus affichées.
 */
export const EmailsModule: React.FC<EmailsModuleProps> = ({ signature = "" }) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm">
        <div>
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Mail className="h-5 w-5 text-teal-600" />
            <span>Secrétariat</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Boîte Gmail en direct · tri automatique · aucune réponse envoyée sans votre validation.
          </p>
        </div>
      </div>

      <GmailInbox signature={signature} />
    </div>
  );
};
