import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Check,
  Truck,
  ExternalLink,
  ChevronDown,
  Trash2,
  Mail,
  Scale,
  FolderGit2,
  ArrowUpRight,
  X,
  Edit3,
  MapPin,
} from "lucide-react";
import type {
  DisputeCase,
  HealthData,
  LiveEmailSummary,
  ModuleType,
  OutfitSuggestion,
  PantryItem,
  PersonalProject,
  RecipeItem,
  ReminderItem,
  UserProfile,
  WorkoutLog,
} from "@/types";
import {
  learnLabelEdit,
  loadParcels,
  removeParcel,
  TRACKING_EVENT,
  updateParcel,
} from "@/lib/trackingMemory";
import type { SavedParcel } from "@/lib/trackingMemory";
import { getLaPosteHeaders } from "@/lib/aiClient";
import { todayDateString } from "@/lib/storage";

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 0,
  fevrier: 1,
  février: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  août: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
  décembre: 11,
};

function compactTimeSlot(rawSlot: string): string {
  const range = rawSlot.match(
    /(?:entre|de|à partir de)?\s*(\d{1,2}(?:[:h]\d{2}|h))\s*(?:et|à|[-–—])\s*(\d{1,2}(?:[:h]\d{2}|h))/i
  );
  if (range?.[1] && range?.[2]) {
    return `${range[1]}-${range[2]}`;
  }
  return rawSlot.trim();
}

function extractTimeSlotFromHistory(history: string[]): string | null {
  for (const line of history) {
    if (!/livr/i.test(line)) continue;
    const match = line.match(
      /(?:entre|de|à partir de)\s+\d{1,2}(?:[:h]\d{2}|h)\s*(?:et|à|[-–—])\s*\d{1,2}(?:[:h]\d{2}|h)/i
    );
    if (match?.[0]) return compactTimeSlot(match[0]);
  }
  return null;
}

function formatDeliveryDisplay(
  raw: string,
  history: string[] = []
): { headline: string; detail: string | null } {
  const timeMatch = raw.match(/\(([^)]+)\)\s*$/);
  const inlineTimeMatch = !timeMatch
    ? raw.match(
        /\b((?:entre|de|à partir de)\s+\d{1,2}(?:[:h]\d{2}|h)\s*(?:et|à|[-–—])\s*\d{1,2}(?:[:h]\d{2}|h))\s*$/i
      )
    : null;
  const rawSlot = timeMatch?.[1] ?? inlineTimeMatch?.[1] ?? null;
  const timeSlot = rawSlot ? compactTimeSlot(rawSlot) : extractTimeSlotFromHistory(history);
  const dateOnly = timeMatch
    ? raw.slice(0, timeMatch.index).trim()
    : inlineTimeMatch
      ? raw.slice(0, inlineTimeMatch.index).trim()
      : raw.trim();

  // Fourchette de dates : on l'affiche telle quelle.
  if (/\s[–-]\s/.test(dateOnly)) {
    return {
      headline: timeSlot ? `${dateOnly} ${timeSlot}` : dateOnly,
      detail: null,
    };
  }

  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let targetDate: Date | null = null;

  if (/^aujourd['’]?hui$/i.test(dateOnly)) {
    targetDate = todayMidnight;
  } else if (/^demain$/i.test(dateOnly)) {
    targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  } else {
    const numMatch = dateOnly.match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/);
    if (numMatch) {
      const day = Number(numMatch[1]);
      const month = Number(numMatch[2]) - 1;
      const rawYear = numMatch[3] ? Number(numMatch[3]) : now.getFullYear();
      const year = rawYear < 100 ? 2000 + rawYear : rawYear;
      targetDate = new Date(year, month, day);
    } else {
      const textMatch = dateOnly.match(
        /(\d{1,2})\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)(?:\s+(20\d{2}))?/i
      );
      if (textMatch) {
        const day = Number(textMatch[1]);
        const month = FRENCH_MONTHS[textMatch[2].toLowerCase()];
        const year = textMatch[3] ? Number(textMatch[3]) : now.getFullYear();
        if (month !== undefined) {
          targetDate = new Date(year, month, day);
          if (!textMatch[3] && targetDate.getTime() - todayMidnight.getTime() < -180 * 86_400_000) {
            targetDate = new Date(year + 1, month, day);
          }
        }
      }
    }
  }

  const withTime = (label: string) => (timeSlot ? `${label} ${timeSlot}` : label);

  if (targetDate && !Number.isNaN(targetDate.getTime())) {
    const diffDays = Math.round(
      (targetDate.getTime() - todayMidnight.getTime()) / 86_400_000
    );
    if (diffDays === 0) return { headline: withTime("Aujourd'hui"), detail: null };
    if (diffDays === 1) return { headline: withTime("Demain"), detail: null };
    if (diffDays === 2) return { headline: withTime("Après-demain"), detail: null };
    if (diffDays === 3) return { headline: withTime("Dans 3 jours"), detail: null };
  }

  return { headline: withTime(dateOnly), detail: null };
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function toIsoDate(year: number, monthZeroIndexed: number, day: number): string {
  return `${year}-${String(monthZeroIndexed + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

interface DashboardModuleProps {
  user: UserProfile;
  liveEmails: LiveEmailSummary[];
  gmailConfigured: boolean | null;
  gmailLoading: boolean;
  onRefreshLivePreview: () => void;
  outfit: OutfitSuggestion;
  health: HealthData;
  recipes: RecipeItem[];
  pantry: PantryItem[];
  disputes: DisputeCase[];
  projects: PersonalProject[];
  reminders: ReminderItem[];
  workoutLogs: WorkoutLog[];
  onAddReminder: (reminder: Omit<ReminderItem, "id" | "completed">) => void;
  onToggleReminder: (id: string) => void;
  onDeleteReminder: (id: string) => void;
  onNavigate: (module: ModuleType) => void;
}

export const DashboardModule: React.FC<DashboardModuleProps> = ({
  user,
  liveEmails,
  gmailConfigured,
  gmailLoading,
  onRefreshLivePreview,
  health,
  recipes,
  pantry,
  disputes,
  projects,
  reminders,
  workoutLogs,
  onAddReminder,
  onToggleReminder,
  onDeleteReminder,
  onNavigate,
}) => {
  const [selectedEmailUid, setSelectedEmailUid] = useState<number | null>(null);
  const [parcels, setParcels] = useState<SavedParcel[]>([]);
  const [openParcel, setOpenParcel] = useState<number | null>(null);
  const [editingParcelUid, setEditingParcelUid] = useState<number | null>(null);
  const [editParcelNumber, setEditParcelNumber] = useState("");
  const [editParcelCarrier, setEditParcelCarrier] = useState("");
  const [editParcelTitle, setEditParcelTitle] = useState("");
  const [editParcelCity, setEditParcelCity] = useState("");
  const [editParcelStore, setEditParcelStore] = useState("");
  const [refreshingParcelUid, setRefreshingParcelUid] = useState<number | null>(null);
  const [parcelErrors, setParcelErrors] = useState<Record<number, string>>({});

  // Calendrier réel dynamique (hydraté côté client pour éviter toute divergence UTC SSR / navigateur)
  const [todayStr, setTodayStr] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [viewMonth, setViewMonth] = useState<Date | null>(null);

  useEffect(() => {
    const now = new Date();
    const today = todayDateString();
    setTodayStr(today);
    setSelectedDate((prev) => prev || today);
    setViewMonth((prev) => prev || new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

  // Formulaire rapide "+ Ajouter un rappel"
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [newRemTitle, setNewRemTitle] = useState("");
  const [newRemTime, setNewRemTime] = useState("10:00");
  const [newRemNote, setNewRemNote] = useState("");

  const refreshParcels = useCallback(() => setParcels(loadParcels()), []);

  const handleRefreshParcelHistory = async (parcel: SavedParcel) => {
    const trackingNumber = parcel.numbers[0];
    if (!trackingNumber || refreshingParcelUid !== null) return;
    setRefreshingParcelUid(parcel.uid);
    setParcelErrors((prev) => {
      const next = { ...prev };
      delete next[parcel.uid];
      return next;
    });
    try {
      const res = await fetch("/api/gmail/tracking-history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getLaPosteHeaders(),
        },
        credentials: "same-origin",
        body: JSON.stringify({ trackingNumber }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        status?: string | null;
        history?: string[];
        note?: string;
        error?: string;
      };
      if (!res.ok) {
        setParcelErrors((prev) => ({
          ...prev,
          [parcel.uid]: data.error || "Impossible de charger l'historique.",
        }));
        setOpenParcel(parcel.uid);
        return;
      }
      const nextHistory =
        Array.isArray(data.history) && data.history.length > 0
          ? data.history
          : parcel.history;
      const updated = updateParcel(parcel.uid, {
        status: data.status || parcel.status,
        history: nextHistory,
      });
      setParcels(updated);
      setOpenParcel(parcel.uid);
      if (data.note && nextHistory.length === 0) {
        setParcelErrors((prev) => ({ ...prev, [parcel.uid]: data.note! }));
      }
    } catch {
      setParcelErrors((prev) => ({
        ...prev,
        [parcel.uid]: "Erreur réseau lors de la récupération Ship24.",
      }));
      setOpenParcel(parcel.uid);
    } finally {
      setRefreshingParcelUid(null);
    }
  };

  useEffect(() => {
    refreshParcels();
    window.addEventListener(TRACKING_EVENT, refreshParcels);
    window.addEventListener("storage", refreshParcels);
    return () => {
      window.removeEventListener(TRACKING_EVENT, refreshParcels);
      window.removeEventListener("storage", refreshParcels);
    };
  }, [refreshParcels]);

  useEffect(() => {
    if (liveEmails.length > 0 && selectedEmailUid === null) {
      setSelectedEmailUid(liveEmails[0].uid);
    }
  }, [liveEmails, selectedEmailUid]);

  const selectedEmail =
    liveEmails.find((e) => e.uid === selectedEmailUid) || liveEmails[0] || null;

  // Métriques réelles pour les 4 cartes pastel
  const openRemindersToday = todayStr
    ? reminders.filter((r) => !r.completed && r.date === todayStr).length
    : 0;
  const activeProjectsCount = projects.filter((p) => p.tasks.some((t) => !t.completed)).length;
  const urgentDisputesCount = disputes.filter((d) => d.status === "action_requise").length;
  const pendingEmailsCount = liveEmails.filter((e) => e.needsReply && !e.answered).length;

  const avgYuka = useMemo(() => {
    const scored = pantry.filter((p) => typeof p.yukaScore === "number");
    if (scored.length === 0) return 0;
    return Math.round(scored.reduce((s, p) => s + (p.yukaScore ?? 0), 0) / scored.length);
  }, [pantry]);

  const weeklyWorkoutMinutes = useMemo(() => {
    if (!todayStr) return 0;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return workoutLogs
      .filter((l) => new Date(l.completedAt).getTime() >= weekAgo)
      .reduce((acc, l) => acc + l.durationMinutes, 0);
  }, [workoutLogs, todayStr]);

  // Grille du mois calendrier
  const calendarCells = useMemo(() => {
    if (!viewMonth) return [];
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDayWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Lundi=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells: Array<{ day: number; iso: string; currentMonth: boolean }> = [];
    for (let i = firstDayWeekday - 1; i >= 0; i--) {
      const prevDay = daysInPrevMonth - i;
      const prevDate = new Date(year, month - 1, prevDay);
      cells.push({
        day: prevDay,
        iso: toIsoDate(prevDate.getFullYear(), prevDate.getMonth(), prevDay),
        currentMonth: false,
      });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d,
        iso: toIsoDate(year, month, d),
        currentMonth: true,
      });
    }
    const trailing = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= trailing; d++) {
      const nextDate = new Date(year, month + 1, d);
      cells.push({
        day: d,
        iso: toIsoDate(nextDate.getFullYear(), nextDate.getMonth(), d),
        currentMonth: false,
      });
    }
    return cells;
  }, [viewMonth]);

  const reminderDatesSet = useMemo(
    () => new Set(reminders.filter((r) => !r.completed).map((r) => r.date)),
    [reminders]
  );

  const dayReminders = useMemo(
    () =>
      selectedDate
        ? reminders
            .filter((r) => r.date === selectedDate)
            .sort((a, b) => a.time.localeCompare(b.time))
        : [],
    [reminders, selectedDate]
  );

  const monthLabel = viewMonth
    ? viewMonth.toLocaleDateString("fr-FR", {
        month: "long",
        year: "numeric",
      })
    : "Calendrier";

  const selectedDayLabel = useMemo(() => {
    if (!selectedDate) return "Aujourd'hui";
    const d = new Date(`${selectedDate}T12:00:00`);
    if (Number.isNaN(d.getTime())) return selectedDate;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  }, [selectedDate]);

  const handleCreateReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRemTitle.trim()) return;
    onAddReminder({
      title: newRemTitle.trim(),
      date: selectedDate,
      time: newRemTime || "10:00",
      note: newRemNote.trim() || undefined,
      module: "dashboard",
    });
    setNewRemTitle("");
    setNewRemNote("");
    setShowReminderForm(false);
  };

  const mainRecipe = recipes[0];
  const urgentDispute = disputes.find((d) => d.status === "action_requise") || disputes[0];
  const nextProject = projects.find((p) => p.tasks.some((t) => !t.completed)) || projects[0];
  const nextProjectTask = nextProject?.tasks.find((t) => !t.completed);

  return (
    <div className="w-full grid grid-cols-1 xl:grid-cols-12 gap-6 p-4">
      {/* MAIN CENTER DASHBOARD STAGE */}
      <div className="xl:col-span-8 space-y-6">
        <div className="flex items-baseline justify-between pt-1 pb-1">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight font-jakarta">
              Bonjour, {user.name} 👋
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-xl">
              {gmailConfigured
                ? `${pendingEmailsCount} email(s) en attente de réponse · ${openRemindersToday} rappel(s) aujourd'hui · ${urgentDisputesCount} litige(s) à traiter.`
                : `${openRemindersToday} rappel(s) aujourd'hui · ${activeProjectsCount} projet(s) actif(s) · ${urgentDisputesCount} litige(s) prioritaire(s).`}
            </p>
          </div>
          <button
            onClick={() => onNavigate("emails")}
            className="text-xs text-slate-400 hover:text-slate-800 underline font-medium shrink-0"
          >
            Ouvrir le Secrétariat...
          </button>
        </div>

        {/* 4 PASTEL CARDS GRID (100% données réelles) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: Priorités & Tâches */}
          <div
            onClick={() => onNavigate("projets")}
            className="bg-[#f7da64] rounded-[2rem] p-5 text-slate-900 relative overflow-hidden flex flex-col justify-between h-52 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="absolute -top-3 -right-3 text-white/30 text-8xl font-black select-none pointer-events-none">
              +
            </div>

            <div>
              <span className="text-sm font-extrabold tracking-tight block mb-2">
                Priorités du jour :
              </span>
              <div className="grid grid-cols-3 gap-1 text-[11px] font-bold">
                <div>
                  <span className="text-sm block">{openRemindersToday} rappel(s)</span>
                  <span className="text-[10px] text-slate-700 uppercase font-semibold">
                    Aujourd'hui
                  </span>
                </div>
                <div>
                  <span className="text-sm block">{activeProjectsCount} projet(s)</span>
                  <span className="text-[10px] text-slate-700 uppercase font-semibold">
                    Actifs
                  </span>
                </div>
                <div>
                  <span className="text-sm block">{urgentDisputesCount} litige(s)</span>
                  <span className="text-[10px] text-slate-700 uppercase font-semibold">
                    Action requise
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white/45 rounded-2xl p-3 text-xs">
              <span className="text-[10px] font-bold uppercase text-slate-700 block">
                Prochaine micro-étape projet
              </span>
              <p className="font-bold text-slate-900 truncate mt-0.5">
                {nextProjectTask ? `${nextProject?.title} · ${nextProjectTask.title}` : "Tout est à jour"}
              </p>
            </div>
          </div>

          {/* Card 2: Biomarqueurs Santé */}
          <div
            onClick={() => onNavigate("sante")}
            className="bg-[#f7b5d5] rounded-[2rem] p-5 text-slate-900 relative overflow-hidden flex flex-col justify-between h-52 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="absolute top-2 right-3 text-white/35 text-6xl select-none pointer-events-none">
              ♥
            </div>

            <div>
              <span className="text-sm font-extrabold tracking-tight block mb-2">
                Santé & Énergie :
              </span>
              <div className="grid grid-cols-3 gap-1 text-[11px] font-bold">
                <div>
                  <span className="text-sm block">{health.sleepScore}/100</span>
                  <span className="text-[10px] text-slate-700 uppercase font-semibold">
                    Sommeil
                  </span>
                </div>
                <div>
                  <span className="text-sm block">{health.sleepHours} h</span>
                  <span className="text-[10px] text-slate-700 uppercase font-semibold">
                    Durée nuit
                  </span>
                </div>
                <div>
                  <span className="text-sm block">{health.hrv} ms</span>
                  <span className="text-[10px] text-slate-700 uppercase font-semibold">
                    VFC
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white/45 rounded-2xl p-3 text-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-700 block">
                  Compléments pris aujourd'hui
                </span>
                <p className="font-bold text-slate-900">
                  {health.supplements.filter((s) => s.taken).length}/{health.supplements.length} validés
                </p>
              </div>
              <span className="text-[11px] font-mono font-bold bg-slate-900 text-white px-2.5 py-1 rounded-full">
                {health.restingHr} bpm
              </span>
            </div>
          </div>

          {/* Card 3: Nutrition Frigo */}
          <div className="bg-[#a8bf6f] rounded-[2rem] p-5 text-slate-900 relative overflow-hidden flex flex-col justify-between h-44 shadow-sm">
            <div className="absolute -bottom-4 right-0 w-24 h-24 bg-white/20 -rotate-12 rounded-2xl pointer-events-none" />

            <div>
              <span className="text-sm font-extrabold tracking-tight block mb-2">
                Alimentation & Frigo :
              </span>
              <div className="grid grid-cols-3 gap-1 text-[11px] font-bold">
                <div>
                  <span className="text-sm block">{pantry.length} items</span>
                  <span className="text-[10px] text-slate-800 uppercase font-semibold">
                    En stock
                  </span>
                </div>
                <div>
                  <span className="text-sm block">{avgYuka}/100</span>
                  <span className="text-[10px] text-slate-800 uppercase font-semibold">
                    Score moyen
                  </span>
                </div>
                <div>
                  <span className="text-sm block">
                    {mainRecipe ? `${mainRecipe.costEstimatedEur.toFixed(2)} €` : "—"}
                  </span>
                  <span className="text-[10px] text-slate-800 uppercase font-semibold">
                    Coût portion
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs font-semibold text-slate-800 mt-2 truncate">
              Idée menu :{" "}
              <span
                className="font-bold underline cursor-pointer"
                onClick={() => onNavigate("courses")}
              >
                {mainRecipe ? mainRecipe.title : "Ouvrir le module Food"}
              </span>
            </p>
          </div>

          {/* Card 4: Sport & Activité */}
          <div className="bg-[#99b7e3] rounded-[2rem] p-5 text-slate-900 relative overflow-hidden flex flex-col justify-between h-44 shadow-sm">
            <div className="absolute -top-3 -right-3 text-white/30 text-7xl select-none pointer-events-none">
              ✱
            </div>

            <div>
              <span className="text-sm font-extrabold tracking-tight block mb-2">
                Sport & Mouvement :
              </span>
              <div className="grid grid-cols-3 gap-1 text-[11px] font-bold">
                <div>
                  <span className="text-sm block">{health.steps.toLocaleString("fr-FR")}</span>
                  <span className="text-[10px] text-slate-800 uppercase font-semibold">
                    Pas du jour
                  </span>
                </div>
                <div>
                  <span className="text-sm block">{weeklyWorkoutMinutes} min</span>
                  <span className="text-[10px] text-slate-800 uppercase font-semibold">
                    7 derniers j.
                  </span>
                </div>
                <div>
                  <span className="text-sm block">
                    {user.energyToday === "low"
                      ? "Douce"
                      : user.energyToday === "medium"
                        ? "Modérée"
                        : "Haute"}
                  </span>
                  <span className="text-[10px] text-slate-800 uppercase font-semibold">
                    Énergie
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-semibold text-slate-800 mt-2">
              <span>{workoutLogs.length} séance(s) enregistrée(s)</span>
              <button
                onClick={() => onNavigate("sport")}
                className="px-2.5 py-1 rounded-full bg-slate-900 text-white text-[10px] font-bold hover:bg-slate-800"
              >
                Démarrer
              </button>
            </div>
          </div>
        </div>

        {/* COLIS EN COURS */}
        {parcels.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <Truck className="h-4 w-4 text-violet-600" />
                Colis en cours
              </h3>
              <span className="text-[11px] font-bold bg-violet-600 text-white px-2.5 py-0.5 rounded-full">
                {parcels.length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {parcels.map((parcel) => {
                const open = openParcel === parcel.uid;
                const number = parcel.numbers[0] ?? "";
                const delivered = Boolean(
                  parcel.status &&
                    /livr/i.test(parcel.status) &&
                    !/en cours|retard|[ée]chec|sera\s+livr|pr[ée]vue|attente/i.test(parcel.status)
                );
                const deliveryValue = delivered
                  ? formatDay(parcel.shippedAt)
                  : parcel.estimatedDelivery || null;
                return (
                  <div
                    key={parcel.uid}
                    className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-2.5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3 min-w-0">
                        {parcel.images && parcel.images.length > 0 && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {parcel.images.slice(0, 2).map((imgUrl, idx) => (
                              <img
                                key={`${parcel.uid}-thumb-${idx}`}
                                src={imgUrl}
                                alt={parcel.store}
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                                className="h-12 w-12 rounded-xl object-cover border border-slate-200/80 bg-slate-50"
                              />
                            ))}
                            {parcel.images.length > 2 && (
                              <span className="h-12 w-7 rounded-xl bg-slate-100 border border-slate-200/80 text-[10px] font-bold text-slate-600 flex items-center justify-center">
                                +{parcel.images.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold text-slate-900 truncate">
                            {parcel.store}
                          </p>
                          {parcel.productTitle && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingParcelUid(parcel.uid);
                                setEditParcelNumber(parcel.numbers[0] ?? "");
                                setEditParcelCarrier(parcel.carrier ?? "");
                                setEditParcelTitle(parcel.productTitle ?? "");
                                setEditParcelCity(parcel.deliveryCity ?? "");
                                setEditParcelStore(parcel.store ?? "");
                              }}
                              title="Modifier l'intitulé du produit"
                              className="text-left text-[11px] font-semibold text-slate-700 hover:text-violet-700 truncate block max-w-full"
                            >
                              {parcel.productTitle}
                            </button>
                          )}
                          {(parcel.deliveryCity || parcel.carrier) && (
                            <p className="text-[10px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                              {parcel.deliveryCity && (
                                <span className="inline-flex items-center gap-0.5 text-slate-600 font-semibold">
                                  <MapPin className="h-2.5 w-2.5 text-violet-600 shrink-0" />
                                  <span>{parcel.deliveryCity}</span>
                                </span>
                              )}
                              {parcel.carrier && <span>({parcel.carrier})</span>}
                            </p>
                          )}
                        </div>
                      </div>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                          delivered
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-violet-50 text-violet-700 border-violet-200"
                        }`}
                      >
                        {parcel.status ?? "En cours"}
                      </span>
                    </div>

                    <div
                      className={`grid gap-2 text-[11px] ${
                        deliveryValue ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">
                          N° de suivi
                        </p>
                        <p className="font-mono text-slate-800 break-all select-all">
                          {number || "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">
                          Commandé le
                        </p>
                        <p className="font-semibold text-slate-800">
                          {formatDay(parcel.orderedAt ?? parcel.shippedAt)}
                        </p>
                      </div>
                      {deliveryValue && (() => {
                        const formatted = delivered
                          ? { headline: deliveryValue, detail: null }
                          : formatDeliveryDisplay(deliveryValue, parcel.history);
                        return (
                          <div>
                            <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">
                              {delivered ? "Livré le" : "Livraison prévue"}
                            </p>
                            <p className="font-semibold text-violet-700 leading-tight">
                              {formatted.headline}
                            </p>
                            {formatted.detail && (
                              <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                                {formatted.detail}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {parcel.url && (
                        <a
                          href={parcel.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 text-white text-[11px] font-bold hover:bg-violet-700 transition-all"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Suivre</span>
                        </a>
                      )}
                      <button
                        onClick={() => setOpenParcel(open ? null : parcel.uid)}
                        aria-expanded={open}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] font-bold hover:bg-slate-50 transition-all"
                      >
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                        />
                        <span>Historique</span>
                      </button>
                      {number && (
                        <button
                          onClick={() => void handleRefreshParcelHistory(parcel)}
                          disabled={refreshingParcelUid === parcel.uid}
                          title="Actualiser l'historique en direct (Ship24)"
                          className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-violet-700 hover:bg-violet-50 disabled:opacity-40 transition-all"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${
                              refreshingParcelUid === parcel.uid ? "animate-spin" : ""
                            }`}
                          />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (editingParcelUid === parcel.uid) {
                            setEditingParcelUid(null);
                          } else {
                            setEditingParcelUid(parcel.uid);
                            setEditParcelNumber(parcel.numbers[0] ?? "");
                            setEditParcelCarrier(parcel.carrier ?? "");
                            setEditParcelTitle(parcel.productTitle ?? "");
                            setEditParcelCity(parcel.deliveryCity ?? "");
                            setEditParcelStore(parcel.store ?? "");
                          }
                        }}
                        title="Modifier le colis"
                        className="h-8 w-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-violet-700 hover:bg-violet-50 transition-all"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setParcels(removeParcel(parcel.uid))}
                        aria-label="Retirer ce colis"
                        className="ml-auto h-8 w-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {editingParcelUid === parcel.uid && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const num = editParcelNumber.trim().toUpperCase();
                          const car = editParcelCarrier.trim();
                          const title = editParcelTitle.trim();
                          const city = editParcelCity.trim();
                          const store = editParcelStore.trim();
                          const isColissimo =
                            /colissimo|la poste/i.test(car) ||
                            /^[689][A-Z][0-9A-Z]{11,13}$/.test(num) ||
                            /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(num);
                          const nextUrl =
                            num && isColissimo
                              ? `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(num)}`
                              : parcel.url;
                          if (title && parcel.productTitle) {
                            learnLabelEdit({
                              field: "productTitle",
                              autoValue: parcel.productTitle,
                              userValue: title,
                            });
                          }
                          if (city && parcel.deliveryCity) {
                            learnLabelEdit({
                              field: "deliveryCity",
                              autoValue: parcel.deliveryCity,
                              userValue: city,
                            });
                          }
                          const next = updateParcel(parcel.uid, {
                            store: store || parcel.store,
                            numbers: num ? [num] : parcel.numbers,
                            carrier: car || (isColissimo ? "Colissimo" : parcel.carrier),
                            productTitle: title || null,
                            deliveryCity: city || null,
                            url: nextUrl,
                          });
                          setParcels(next);
                          setEditingParcelUid(null);
                        }}
                        className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]"
                      >
                        <input
                          type="text"
                          value={editParcelStore}
                          onChange={(e) => setEditParcelStore(e.target.value)}
                          placeholder="Expéditeur (ex: Kapten & Son)"
                          className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-semibold"
                        />
                        <input
                          type="text"
                          value={editParcelTitle}
                          onChange={(e) => setEditParcelTitle(e.target.value)}
                          placeholder="Intitulé du produit"
                          className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-semibold"
                        />
                        <input
                          type="text"
                          value={editParcelCity}
                          onChange={(e) => setEditParcelCity(e.target.value)}
                          placeholder="Ville (ex: Francheville)"
                          className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-semibold"
                        />
                        <input
                          type="text"
                          value={editParcelNumber}
                          onChange={(e) => setEditParcelNumber(e.target.value)}
                          placeholder="N° Colissimo (ex: 6A...)"
                          className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-mono"
                        />
                        <input
                          type="text"
                          value={editParcelCarrier}
                          onChange={(e) => setEditParcelCarrier(e.target.value)}
                          placeholder="Transporteur"
                          className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200"
                        />
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded-lg bg-violet-600 text-white font-bold hover:bg-violet-700"
                        >
                          Enregistrer
                        </button>
                      </form>
                    )}

                    {open && (
                      <div className="pt-2 border-t border-slate-100 space-y-2">
                        {parcelErrors[parcel.uid] && (
                          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-2.5 py-1.5">
                            {parcelErrors[parcel.uid]}
                          </p>
                        )}
                        {parcel.history.length > 0 ? (
                          <ol className="space-y-1.5 text-[11px] text-slate-600">
                            {parcel.history.map((event, index) => (
                              <li key={`${parcel.uid}-${index}`} className="flex gap-2">
                                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-400 shrink-0" />
                                <span>{event}</span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="text-[11px] text-slate-500">
                            Aucun détail de suivi dans l'email : ouvrez le lien du transporteur pour
                            l'historique complet.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* BOTTOM SECTION: Vrais Emails Gmail + Focus Dossier */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-2">
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                Boîte Gmail en direct
              </h3>
              <button
                onClick={onRefreshLivePreview}
                disabled={gmailLoading}
                className="text-[11px] font-bold bg-slate-900 text-white px-2.5 py-0.5 rounded-full flex items-center gap-1"
              >
                <RefreshCw className={`h-3 w-3 ${gmailLoading ? "animate-spin" : ""}`} />
                <span>Actualiser</span>
              </button>
            </div>

            <div className="space-y-2">
              {liveEmails.length > 0 ? (
                liveEmails.slice(0, 4).map((email) => {
                  const isSelected = selectedEmail?.uid === email.uid;
                  return (
                    <div
                      key={email.uid}
                      onClick={() => setSelectedEmailUid(email.uid)}
                      className={`p-3 rounded-2xl flex items-center justify-between cursor-pointer transition-all border ${
                        isSelected
                          ? "bg-[#fce4ec] border-[#f7b5d5] shadow-sm"
                          : "bg-white/90 border-slate-200/80 hover:bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-[#f7b5d5]/40 text-slate-800 flex items-center justify-center font-bold text-xs shrink-0">
                          <Mail className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {email.fromName || email.fromEmail}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {email.subject || "(Sans objet)"}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          email.needsReply
                            ? "bg-amber-100 text-amber-900"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {email.needsReply ? "À répondre" : email.category}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 text-xs text-slate-500 space-y-2">
                  <p>
                    {gmailConfigured === false
                      ? "Gmail n'est pas encore configuré sur ce serveur."
                      : gmailLoading
                        ? "Chargement des derniers messages..."
                        : "Aucun message récent chargé."}
                  </p>
                  <button
                    onClick={() => onNavigate("emails")}
                    className="text-xs font-bold text-slate-900 underline"
                  >
                    Ouvrir Secrétariat →
                  </button>
                </div>
              )}

              {urgentDispute && (
                <div
                  onClick={() => onNavigate("litiges")}
                  className="p-3 rounded-2xl flex items-center justify-between cursor-pointer transition-all border bg-white/90 border-slate-200/80 hover:bg-white"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-[#f7da64]/50 text-slate-800 flex items-center justify-center font-bold text-xs shrink-0">
                      <Scale className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {urgentDispute.adversary}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {urgentDispute.title}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 shrink-0">
                    Litige
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Selected Gmail preview or Next Project */}
          <div className="md:col-span-7 bg-[#fce4ec] rounded-[2rem] p-5 text-slate-900 flex flex-col justify-between shadow-sm border border-[#f7b5d5]/60 space-y-4">
            {selectedEmail ? (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="min-w-0">
                      <h4 className="text-base font-extrabold text-slate-900 tracking-tight truncate">
                        {selectedEmail.fromName || selectedEmail.fromEmail}
                      </h4>
                      <p className="text-[11px] text-slate-600 font-medium truncate">
                        {selectedEmail.subject}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-white/80 text-slate-700 shrink-0">
                      {formatDay(selectedEmail.date)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1 mb-3">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-white text-slate-800">
                      {selectedEmail.category}
                    </span>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-900 text-white">
                      {selectedEmail.needsReply ? "Réponse suggérée" : "Informatif"}
                    </span>
                  </div>

                  <div className="p-3.5 bg-white/75 rounded-2xl border border-white text-xs space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Analyse automatique :
                    </p>
                    <p className="text-xs text-slate-800 leading-relaxed">
                      {selectedEmail.reason}
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <span className="text-[11px] text-slate-600 font-medium">
                    Rédaction DeepSeek dans votre style disponible dans Secrétariat.
                  </span>
                  <button
                    onClick={() => onNavigate("emails")}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-md"
                  >
                    <span>Ouvrir & Répondre</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-base font-extrabold text-slate-900 tracking-tight">
                        {nextProject ? nextProject.title : "Vos projets & priorités"}
                      </h4>
                      <p className="text-[11px] text-slate-600 font-medium">
                        {nextProject
                          ? nextProject.summary
                          : "Créez ou découpez un projet en micro-étapes."}
                      </p>
                    </div>
                    <FolderGit2 className="h-5 w-5 text-slate-700 shrink-0" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => onNavigate("projets")}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-md"
                  >
                    <span>Ouvrir Projets</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT SIDE PANEL: Calendrier réel & Rappels */}
      <div className="xl:col-span-4 bg-white/85 backdrop-blur-md rounded-[2.2rem] p-6 border border-slate-200/80 space-y-5 shadow-sm">
        <div>
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() =>
                setViewMonth((d) =>
                  d ? new Date(d.getFullYear(), d.getMonth() - 1, 1) : null
                )
              }
              aria-label="Mois précédent"
              className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 hover:bg-slate-200"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                setSelectedDate(todayDateString());
              }}
              className="px-3.5 py-1 rounded-full bg-[#fce4ec] text-[#121316] font-extrabold text-xs capitalize hover:opacity-90"
              title="Revenir à aujourd'hui"
            >
              {monthLabel}
            </button>
            <button
              type="button"
              onClick={() =>
                setViewMonth((d) =>
                  d ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : null
                )
              }
              aria-label="Mois suivant"
              className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 hover:bg-slate-200"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500 mb-2">
            <span>LU</span>
            <span>MA</span>
            <span>ME</span>
            <span>JE</span>
            <span>VE</span>
            <span>SA</span>
            <span>DI</span>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-700">
            {calendarCells.map((cell) => {
              const isSelected = cell.iso === selectedDate;
              const isToday = cell.iso === todayStr;
              const hasReminders = reminderDatesSet.has(cell.iso);
              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => setSelectedDate(cell.iso)}
                  className={`relative h-7 w-7 rounded-full flex items-center justify-center mx-auto transition-all ${
                    isSelected
                      ? "bg-[#f7b5d5] text-slate-900 font-extrabold shadow-sm"
                      : isToday
                        ? "bg-slate-900 text-white font-bold"
                        : cell.currentMonth
                          ? "hover:bg-slate-100 text-slate-700"
                          : "text-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span>{cell.day}</span>
                  {hasReminders && (
                    <span
                      className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
                        isToday && !isSelected ? "bg-[#f7da64]" : "bg-teal-600"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowReminderForm((v) => !v)}
            className="flex-1 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
          >
            {showReminderForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            <span>{showReminderForm ? "Fermer" : "Ajouter un rappel"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              refreshParcels();
              onRefreshLivePreview();
            }}
            title="Rafraîchir colis et emails"
            className="h-9 w-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${gmailLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {showReminderForm && (
          <form
            onSubmit={handleCreateReminder}
            className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs"
          >
            <div className="flex gap-2">
              <input
                type="time"
                value={newRemTime}
                onChange={(e) => setNewRemTime(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-mono"
              />
              <input
                type="text"
                value={newRemTitle}
                onChange={(e) => setNewRemTitle(e.target.value)}
                placeholder="Titre du rappel..."
                className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs"
                autoFocus
              />
            </div>
            <input
              type="text"
              value={newRemNote}
              onChange={(e) => setNewRemNote(e.target.value)}
              placeholder="Note optionnelle..."
              className="w-full px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs"
            />
            <button
              type="submit"
              disabled={!newRemTitle.trim()}
              className="w-full py-2 rounded-xl bg-slate-900 text-white font-bold text-xs disabled:opacity-40"
            >
              Enregistrer pour le {selectedDayLabel}
            </button>
          </form>
        )}

        {/* Day Timeline */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-extrabold text-slate-900 tracking-tight capitalize">
              {selectedDayLabel}
            </h4>
            <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full">
              {dayReminders.length} rappel(s)
            </span>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {dayReminders.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                Aucun rappel pour cette journée.
              </p>
            ) : (
              dayReminders.map((rem) => (
                <div key={rem.id} className="flex items-start gap-2.5 text-xs">
                  <span className="text-[11px] font-mono text-slate-400 w-10 pt-2 shrink-0">
                    {rem.time}
                  </span>
                  <div
                    className={`flex-1 p-2.5 rounded-2xl border flex items-center justify-between gap-2 transition-all ${
                      rem.completed
                        ? "bg-slate-50 border-slate-200/60 opacity-60"
                        : "bg-[#fef7db]/70 border-[#f7da64]/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleReminder(rem.id)}
                      className="flex items-center gap-2 text-left min-w-0 flex-1"
                    >
                      <span
                        className={`h-4 w-4 rounded-md flex items-center justify-center shrink-0 border ${
                          rem.completed
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "bg-white border-slate-300"
                        }`}
                      >
                        {rem.completed && <Check className="h-3 w-3 stroke-[3]" />}
                      </span>
                      <div className="min-w-0">
                        <p
                          className={`font-bold text-slate-900 truncate ${
                            rem.completed ? "line-through" : ""
                          }`}
                        >
                          {rem.title}
                        </p>
                        {rem.note && (
                          <p className="text-[10px] text-slate-600 truncate">{rem.note}</p>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteReminder(rem.id)}
                      aria-label="Supprimer ce rappel"
                      className="text-slate-400 hover:text-rose-600 p-1 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
