import React from "react";
import { Mail } from "lucide-react";
import { GmailInbox } from "@/components/GmailInbox";

interface EmailsModuleProps {
  /** Signature utilisée pour les brouillons Gmail (ex. « Bien cordialement, Alva DALERY »). */
  signature?: string;
  /** Directives stylistiques issues de Paramètres -> Profil & Plume IA. */
  writingStyle?: string;
}

export const EmailsModule: React.FC<EmailsModuleProps> = ({
  signature = "",
  writingStyle = "",
}) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm">
        <div>
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Mail className="h-5 w-5 text-teal-600" />
            <span>Secrétariat</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Boîte Gmail en direct · rédaction DeepSeek dans votre style · aucune réponse envoyée sans votre validation.
          </p>
        </div>
      </div>

      <GmailInbox signature={signature} writingStyle={writingStyle} />
    </div>
  );
};
