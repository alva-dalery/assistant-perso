import React, { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Share2,
  Check,
  Heart,
  Activity,
  Sparkles,
  Send,
  CheckCircle2,
  ArrowRight,
  Calendar as CalendarIcon,
  Smile,
  Shield,
  Clock,
} from "lucide-react";
import {
  UserProfile,
  EmailDraft,
  OutfitSuggestion,
  HealthData,
  RecipeItem,
  DisputeCase,
  PersonalProject,
  ModuleType,
} from "@/types";

interface DashboardModuleProps {
  user: UserProfile;
  emails: EmailDraft[];
  outfit: OutfitSuggestion;
  health: HealthData;
  recipe: RecipeItem;
  dispute: DisputeCase;
  project: PersonalProject;
  onNavigate: (module: ModuleType) => void;
  onApproveEmail: (id: string) => void;
  onQuickJournalSave?: (text: string) => void;
}

export const DashboardModule: React.FC<DashboardModuleProps> = ({
  user,
  emails,
  outfit,
  health,
  recipe,
  dispute,
  project,
  onNavigate,
  onApproveEmail,
}) => {
  const [selectedEmailId, setSelectedEmailId] = useState<string>(emails[0]?.id || "mail-1");

  const selectedEmail = emails.find((e) => e.id === selectedEmailId) || emails[0];

  return (
    <div className="w-full grid grid-cols-1 xl:grid-cols-12 gap-6 p-4">
      {/* ======================================================== */}
      {/* MAIN CENTER DASHBOARD STAGE (Cols 1 to 8/9)              */}
      {/* ======================================================== */}
      <div className="xl:col-span-8 space-y-6">
        {/* Welcome Greeting matching reference image */}
        <div className="flex items-baseline justify-between pt-1 pb-1">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight font-jakarta">
              Bonjour, {user.name} 👋
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              Assistant perso vous souhaite une journée sereine et productive. Vos 2 brouillons d'emails attendent votre relecture et vos biomarqueurs Withings sont optimaux.
            </p>
          </div>
          <button
            onClick={() => onNavigate("emails")}
            className="text-xs text-slate-400 hover:text-slate-800 underline font-medium shrink-0"
          >
            Tout afficher...
          </button>
        </div>

        {/* 4 PASTEL CARDS GRID matching reference image */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: Warm Golden Yellow (#f7da64) - Priorités & Tâches */}
          <div className="bg-[#f7da64] rounded-[2rem] p-5 text-slate-900 relative overflow-hidden flex flex-col justify-between h-56 shadow-sm">
            {/* Geometric Cross Watermark in top right */}
            <div className="absolute -top-3 -right-3 text-white/30 text-8xl font-black select-none pointer-events-none">
              +
            </div>

            <div>
              <span className="text-sm font-extrabold tracking-tight block mb-2">
                Priorités du jour :
              </span>
              <div className="grid grid-cols-3 gap-1 text-[11px] font-bold">
                <div>
                  <span className="text-sm block">3 actions</span>
                  <span className="text-[10px] text-slate-700 uppercase font-semibold">À valider</span>
                </div>
                <div>
                  <span className="text-sm block">2 projets</span>
                  <span className="text-[10px] text-slate-700 uppercase font-semibold">En cours</span>
                </div>
                <div>
                  <span className="text-sm block">1 litige</span>
                  <span className="text-[10px] text-slate-700 uppercase font-semibold">Échéance 4j</span>
                </div>
              </div>
            </div>

            {/* Black Vertical Bar Chart */}
            <div className="flex items-end justify-between gap-3 h-20 px-2 pt-2">
              <div className="w-2.5 bg-slate-900 rounded-full h-[60%]" />
              <div className="w-2.5 bg-slate-900 rounded-full h-[45%]" />
              <div className="w-2.5 bg-slate-900 rounded-full h-[85%]" />
              <div className="w-2.5 bg-slate-900 rounded-full h-[30%]" />
              <div className="w-2.5 bg-slate-900 rounded-full h-[100%]" />
              <div className="w-2.5 bg-slate-900 rounded-full h-[55%]" />
              <div className="w-2.5 bg-slate-900 rounded-full h-[70%]" />
            </div>

            <div className="flex justify-between text-[10px] font-bold text-slate-800 pt-1 border-t border-black/10">
              <span>07:30 AM</span>
              <span>16:30 PM (Mode TDAH)</span>
            </div>
          </div>

          {/* Card 2: Candy Pink (#f7b5d5) - Sommeil & VFC Withings */}
          <div className="bg-[#f7b5d5] rounded-[2rem] p-5 text-slate-900 relative overflow-hidden flex flex-col justify-between h-56 shadow-sm">
            {/* Heart Watermark in top right */}
            <div className="absolute top-2 right-3 text-white/35 text-6xl select-none pointer-events-none">
              ♥
            </div>

            <div>
              <span className="text-sm font-extrabold tracking-tight block mb-2">
                Sommeil & VFC (Withings) :
              </span>
              <div className="grid grid-cols-3 gap-1 text-[11px] font-bold">
                <div>
                  <span className="text-sm block">86/100</span>
                  <span className="text-[10px] text-slate-700 uppercase font-semibold">Score Repos</span>
                </div>
                <div>
                  <span className="text-sm block">7.8 h</span>
                  <span className="text-[10px] text-slate-700 uppercase font-semibold">Durée nuit</span>
                </div>
                <div>
                  <span className="text-sm block">62 ms</span>
                  <span className="text-[10px] text-slate-700 uppercase font-semibold">VFC Sereine</span>
                </div>
              </div>
            </div>

            {/* Smooth SVG Line Graph with pulse marker at 12:00 */}
            <div className="h-20 w-full relative pt-2">
              <svg viewBox="0 0 240 60" className="w-full h-full overflow-visible">
                {/* Dotted milestone line at 12:00 */}
                <line
                  x1="140"
                  y1="5"
                  x2="140"
                  y2="55"
                  stroke="#121316"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                <circle cx="140" cy="18" r="4" fill="#121316" />

                {/* Smooth curve */}
                <path
                  d="M 0 45 C 30 46, 60 48, 90 40 C 120 32, 130 18, 140 18 C 150 18, 170 42, 200 45 C 220 48, 230 42, 240 44"
                  fill="none"
                  stroke="#121316"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            <div className="flex justify-between text-[9px] font-bold text-slate-700 pt-1 border-t border-black/10">
              <span>10:30</span>
              <span>11:00</span>
              <span>11:30</span>
              <span className="text-slate-900">12:00</span>
              <span>12:30</span>
              <span>13:00</span>
              <span>13:30</span>
            </div>
          </div>

          {/* Card 3: Olive / Sage Green (#a8bf6f) - Nutrition Frigo & Yuka */}
          <div className="bg-[#a8bf6f] rounded-[2rem] p-5 text-slate-900 relative overflow-hidden flex flex-col justify-between h-44 shadow-sm">
            {/* Geometric Triangle Watermark */}
            <div className="absolute -bottom-4 right-0 w-24 h-24 bg-white/20 -rotate-12 rounded-2xl pointer-events-none" />

            <div>
              <span className="text-sm font-extrabold tracking-tight block mb-2">
                Alimentation & Frigo (Yuka) :
              </span>
              <div className="grid grid-cols-3 gap-1 text-[11px] font-bold">
                <div>
                  <span className="text-sm block">6 items</span>
                  <span className="text-[10px] text-slate-800 uppercase font-semibold">En stock</span>
                </div>
                <div>
                  <span className="text-sm block">90/100</span>
                  <span className="text-[10px] text-slate-800 uppercase font-semibold">Yuka Excellent</span>
                </div>
                <div>
                  <span className="text-sm block">4.80 €</span>
                  <span className="text-[10px] text-slate-800 uppercase font-semibold">Coût portion</span>
                </div>
              </div>
            </div>

            <p className="text-xs font-semibold text-slate-800 mt-2">
              Menu du jour : <span className="font-bold underline cursor-pointer" onClick={() => onNavigate("courses")}>Bowl Dopamine & Oméga-3</span> (zéro coup de barre).
            </p>
          </div>

          {/* Card 4: Periwinkle / Slate Blue (#99b7e3) - Sport & Mouvement */}
          <div className="bg-[#99b7e3] rounded-[2rem] p-5 text-slate-900 relative overflow-hidden flex flex-col justify-between h-44 shadow-sm">
            {/* Geometric Starburst Watermark */}
            <div className="absolute -top-3 -right-3 text-white/30 text-7xl select-none pointer-events-none">
              ✱
            </div>

            <div>
              <span className="text-sm font-extrabold tracking-tight block mb-2">
                Sport & Énergie :
              </span>
              <div className="grid grid-cols-3 gap-1 text-[11px] font-bold">
                <div>
                  <span className="text-sm block">8 450</span>
                  <span className="text-[10px] text-slate-800 uppercase font-semibold">Pas Apple</span>
                </div>
                <div>
                  <span className="text-sm block">08:00 min</span>
                  <span className="text-[10px] text-slate-800 uppercase font-semibold">Mobilité</span>
                </div>
                <div>
                  <span className="text-sm block">65%</span>
                  <span className="text-[10px] text-slate-800 uppercase font-semibold">Objectif</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-semibold text-slate-800 mt-2">
              <span>Circuit Mobilité Anti-Blocage</span>
              <button
                onClick={() => onNavigate("sport")}
                className="px-2.5 py-1 rounded-full bg-slate-900 text-white text-[10px] font-bold hover:bg-slate-800"
              >
                Démarrer
              </button>
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION: Patient's list & Visit Details -> Emails list & Detail Card */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-2">
          {/* Left: Email queue list */}
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                File des actions & Emails
              </h3>
              <span className="text-[11px] font-bold bg-slate-900 text-white px-2.5 py-0.5 rounded-full">
                Aujourd'hui ⌵
              </span>
            </div>

            <div className="space-y-2">
              {emails.map((email) => {
                const isSelected = email.id === selectedEmailId;
                return (
                  <div
                    key={email.id}
                    onClick={() => setSelectedEmailId(email.id)}
                    className={`p-3 rounded-2xl flex items-center justify-between cursor-pointer transition-all border ${isSelected
                        ? "bg-[#fce4ec] border-[#f7b5d5] shadow-sm"
                        : "bg-white/90 border-slate-200/80 hover:bg-white hover:border-slate-300"
                      }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-[#f7b5d5]/40 text-slate-800 flex items-center justify-center font-bold text-xs shrink-0">
                        ✉
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 truncate max-w-[130px]">
                          {email.sender}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate max-w-[130px]">
                          {email.subject}
                        </p>
                      </div>
                    </div>

                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      09:15 AM
                    </span>
                  </div>
                );
              })}

              {/* Litige item */}
              <div
                onClick={() => onNavigate("litiges")}
                className="p-3 rounded-2xl flex items-center justify-between cursor-pointer transition-all border bg-white/90 border-slate-200/80 hover:bg-white"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-[#f7da64]/40 text-slate-800 flex items-center justify-center font-bold text-xs shrink-0">
                    ⚖
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 truncate max-w-[130px]">
                      Assurance Pacifica
                    </p>
                    <p className="text-[10px] text-slate-500 truncate max-w-[130px]">
                      Recours franchise 450€
                    </p>
                  </div>
                </div>

                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                  Échéance 4j
                </span>
              </div>
            </div>
          </div>

          {/* Right: Action / Draft Details (Soft Pink Card matching reference) */}
          <div className="md:col-span-7 bg-[#fce4ec] rounded-[2rem] p-5 text-slate-900 flex flex-col justify-between shadow-sm border border-[#f7b5d5]/60 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-base font-extrabold text-slate-900 tracking-tight">
                    {selectedEmail?.sender}
                  </h4>
                  <p className="text-[11px] text-slate-600 font-medium">
                    {selectedEmail?.subject}
                  </p>
                </div>
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-white/80 text-slate-700">
                  RÉPONSE-IA
                </span>
              </div>

              {/* Badges row */}
              <div className="flex flex-wrap gap-1.5 pt-1 mb-3">
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-white text-slate-800">
                  Ton Chaleureux
                </span>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-white text-slate-800">
                  Sans style IA
                </span>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-900 text-white">
                  À valider
                </span>
              </div>

              {/* Specs & Draft content */}
              <div className="p-3.5 bg-white/70 rounded-2xl border border-white text-xs space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Brouillon préparé avec vos mots :
                </p>
                <p className="text-xs text-slate-800 leading-relaxed italic whitespace-pre-wrap">
                  « {selectedEmail?.suggestedReply} »
                </p>
              </div>
            </div>

            {/* 1-Click Validation Button */}
            <div className="pt-2 flex items-center justify-between">
              <span className="text-[11px] text-slate-600 font-medium">
                Vérification humaine avant tout envoi.
              </span>
              <button
                onClick={() => onApproveEmail(selectedEmail?.id)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-md active:scale-95"
              >
                <Check className="h-3.5 w-3.5 stroke-[3]" />
                <span>Valider & Envoyer en 1 clic</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* RIGHT SIDE PANEL: Calendar & Timeline (Cols 9 to 12)     */}
      {/* ======================================================== */}
      <div className="xl:col-span-4 bg-white/80 backdrop-blur-md rounded-[2.2rem] p-6 border border-slate-200/80 space-y-6 shadow-sm">
        {/* Month Selector matching reference image */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <button className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 hover:bg-slate-200">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-3.5 py-1 rounded-full bg-[#fce4ec] text-[#121316] font-extrabold text-xs">
              Novembre 2026
            </span>
            <button className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 hover:bg-slate-200">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Mini Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500 mb-2">
            <span>LU</span>
            <span>MA</span>
            <span>ME</span>
            <span>JE</span>
            <span>VE</span>
            <span>SA</span>
            <span>DI</span>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-700">
            <span className="text-slate-300">27</span>
            <span className="text-slate-300">28</span>
            <span className="text-slate-300">29</span>
            <span className="text-slate-300">30</span>
            <span className="text-slate-300">31</span>
            <span>1</span>
            <span>2</span>

            <span>3</span>
            <span>4</span>
            <span>5</span>
            <span>6</span>
            <span>7</span>
            <span>8</span>
            <span>9</span>

            <span>10</span>
            <span>11</span>
            <span>12</span>
            <span>13</span>
            <span>14</span>
            <span>15</span>
            {/* Selected day 16 in pink circle */}
            <span className="h-6 w-6 rounded-full bg-[#f7b5d5] text-slate-900 font-extrabold flex items-center justify-center mx-auto shadow-sm">
              16
            </span>

            <span>17</span>
            <span>18</span>
            <span>19</span>
            <span>20</span>
            <span>21</span>
            <span>22</span>
            <span>23</span>

            <span>24</span>
            <span>25</span>
            <span>26</span>
            <span>27</span>
            <span>28</span>
            <span>29</span>
            <span>30</span>
          </div>
        </div>

        {/* Action button: + Add event matching reference */}
        <div className="flex items-center gap-2">
          <button className="flex-1 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm">
            <Plus className="h-3.5 w-3.5" />
            <span>Ajouter un rappel</span>
          </button>
          <button className="h-9 w-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button className="h-9 w-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100">
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Today's Timeline Section matching reference */}
        <div className="space-y-4 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-extrabold text-slate-900 tracking-tight">
              16 Novembre
            </h4>
            <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full">
              Tout ⌵
            </span>
          </div>

          <div className="space-y-3 relative pl-2">
            {/* Timeline item 1 */}
            <div className="flex items-start gap-3 text-xs">
              <span className="text-[11px] font-mono text-slate-400 w-11 pt-1 shrink-0">
                07:00
              </span>
              <div className="flex-1 p-2.5 rounded-2xl bg-[#fce4ec] flex items-center gap-2.5 border border-[#f7b5d5]/40">
                <div className="h-7 w-7 rounded-full bg-[#f7b5d5] text-slate-900 flex items-center justify-center text-xs shrink-0">
                  🧘
                </div>
                <div>
                  <p className="font-bold text-slate-900">Routine Matin</p>
                  <p className="text-[10px] text-slate-600">Tyrosine & Magnésium</p>
                </div>
              </div>
            </div>

            {/* Timeline item 2 */}
            <div className="flex items-start gap-3 text-xs">
              <span className="text-[11px] font-mono text-slate-400 w-11 pt-1 shrink-0">
                08:30
              </span>
              <div className="flex-1 p-2.5 rounded-2xl bg-[#e3effc] flex items-center gap-2.5 border border-[#99b7e3]/40">
                <div className="h-7 w-7 rounded-full bg-[#99b7e3] text-slate-900 flex items-center justify-center text-xs shrink-0">
                  🛠️
                </div>
                <div>
                  <p className="font-bold text-slate-900">Bain Nordique DIY</p>
                  <p className="text-[10px] text-slate-600">Plans poêle & raccord</p>
                </div>
              </div>
            </div>

            {/* Timeline item 3 */}
            <div className="flex items-start gap-3 text-xs">
              <span className="text-[11px] font-mono text-slate-400 w-11 pt-1 shrink-0">
                11:00
              </span>
              <div className="flex-1 p-2.5 rounded-2xl bg-[#fef7db] flex items-center gap-2.5 border border-[#f7da64]/40">
                <div className="h-7 w-7 rounded-full bg-[#f7da64] text-slate-900 flex items-center justify-center text-xs shrink-0">
                  ✉️
                </div>
                <div>
                  <p className="font-bold text-slate-900">Secrétariat Emails</p>
                  <p className="text-[10px] text-slate-600">2 brouillons prêts</p>
                </div>
              </div>
            </div>

            {/* Timeline item 4 */}
            <div className="flex items-start gap-3 text-xs">
              <span className="text-[11px] font-mono text-slate-400 w-11 pt-1 shrink-0">
                12:30
              </span>
              <div className="flex-1 p-2.5 rounded-2xl bg-[#fce4ec] flex items-center gap-2.5 border border-[#f7b5d5]/40">
                <div className="h-7 w-7 rounded-full bg-[#f7b5d5] text-slate-900 flex items-center justify-center text-xs shrink-0">
                  🥗
                </div>
                <div>
                  <p className="font-bold text-slate-900">Déjeuner Dopamine</p>
                  <p className="text-[10px] text-slate-600">Bowl Avocat & Oeufs</p>
                </div>
              </div>
            </div>

            {/* Timeline item 5 */}
            <div className="flex items-start gap-3 text-xs">
              <span className="text-[11px] font-mono text-slate-400 w-11 pt-1 shrink-0">
                16:30
              </span>
              <div className="flex-1 p-2.5 rounded-2xl bg-[#e3effc] flex items-center gap-2.5 border border-[#99b7e3]/40">
                <div className="h-7 w-7 rounded-full bg-[#99b7e3] text-slate-900 flex items-center justify-center text-xs shrink-0">
                  🏋️
                </div>
                <div>
                  <p className="font-bold text-slate-900">Mobilité douce</p>
                  <p className="text-[10px] text-slate-600">Séance anti-blocage</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Full Width Black Pill Button */}
          <button
            onClick={() => onNavigate("sante")}
            className="w-full py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all text-center shadow-md mt-4"
          >
            Voir tout le planning
          </button>
        </div>
      </div>
    </div>
  );
};
