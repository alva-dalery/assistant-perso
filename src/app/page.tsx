"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { BrainDumpModal } from "@/components/BrainDumpModal";
import { FocusModeView } from "@/components/FocusModeView";

import { DashboardModule } from "@/components/modules/DashboardModule";
import { EmailsModule } from "@/components/modules/EmailsModule";
import { DressingModule } from "@/components/modules/DressingModule";
import { SanteModule } from "@/components/modules/SanteModule";
import { CoursesModule } from "@/components/modules/CoursesModule";
import { SportModule } from "@/components/modules/SportModule";
import { LitigesModule } from "@/components/modules/LitigesModule";
import { ProjetsModule } from "@/components/modules/ProjetsModule";
import { CultureModule } from "@/components/modules/CultureModule";
import { ParametresModule } from "@/components/modules/ParametresModule";

import {
  getSsrInitialAppState,
  loadAppState,
  loadCultureForSearch,
  resetAppState,
  saveAppState,
  todayDateString,
} from "@/lib/storage";
import type {
  AppState,
  BrainDumpConfirmAction,
  ClothingItem,
  DisputeCase,
  EnergyLevel,
  GlobalSearchResult,
  HealthData,
  LiveEmailSummary,
  ModuleType,
  OutfitSuggestion,
  PackingItem,
  PantryItem,
  PersonalProject,
  RecipeItem,
  ReminderItem,
  ShoppingItem,
  WorkoutSession,
} from "@/types";

export default function Home() {
  const [currentModule, setCurrentModule] = useState<ModuleType>("dashboard");
  const [appState, setAppState] = useState<AppState>(() => getSsrInitialAppState());
  const [isHydrated, setIsHydrated] = useState(false);
  const hydratedRef = useRef(false);

  const [isBrainDumpOpen, setIsBrainDumpOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Aperçu Gmail en direct (badge + Dashboard)
  const [liveEmails, setLiveEmails] = useState<LiveEmailSummary[]>([]);
  const [gmailConfigured, setGmailConfigured] = useState<boolean | null>(null);
  const [gmailLoading, setGmailLoading] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3200);
  }, []);

  // Hydratation depuis localStorage au montage
  useEffect(() => {
    const loaded = loadAppState();
    setAppState(loaded);
    hydratedRef.current = true;
    setIsHydrated(true);
  }, []);

  // Sauvegarde automatique après chaque changement d'état hydraté
  useEffect(() => {
    if (!hydratedRef.current) return;
    const ok = saveAppState(appState);
    if (!ok) {
      showToast("Stockage local plein : exportez une sauvegarde dans Paramètres.");
    }
  }, [appState, showToast]);

  const refreshLiveGmail = useCallback(async () => {
    setGmailLoading(true);
    try {
      const statusRes = await fetch("/api/gmail/status", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!statusRes.ok) {
        setGmailConfigured(false);
        return;
      }
      const statusData = (await statusRes.json()) as { configured?: boolean };
      if (!statusData.configured) {
        setGmailConfigured(false);
        setLiveEmails([]);
        return;
      }
      setGmailConfigured(true);

      const msgRes = await fetch("/api/gmail/messages?limit=8", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (msgRes.ok) {
        const msgData = (await msgRes.json()) as { messages?: LiveEmailSummary[] };
        setLiveEmails(Array.isArray(msgData.messages) ? msgData.messages : []);
      }
    } catch {
      // Silence réseau au chargement initial
    } finally {
      setGmailLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLiveGmail();
  }, [refreshLiveGmail]);

  // Index de recherche globale dynamique
  const searchItems: GlobalSearchResult[] = useMemo(() => {
    const items: GlobalSearchResult[] = [];

    for (const r of appState.reminders) {
      items.push({
        id: `rem-${r.id}`,
        title: r.title,
        subtitle: `${r.date} à ${r.time}${r.note ? ` · ${r.note}` : ""}`,
        module: r.module || "dashboard",
        moduleLabel: "Rappels",
      });
    }
    for (const p of appState.projects) {
      items.push({
        id: `proj-${p.id}`,
        title: p.title,
        subtitle: `${p.tasks.filter((t) => t.completed).length}/${p.tasks.length} étapes · ${p.summary}`,
        module: "projets",
        moduleLabel: "Projets",
      });
      for (const t of p.tasks) {
        items.push({
          id: `task-${p.id}-${t.id}`,
          title: t.title,
          subtitle: `Projet : ${p.title}`,
          module: "projets",
          moduleLabel: "Projets",
        });
      }
    }
    for (const d of appState.disputes) {
      items.push({
        id: `disp-${d.id}`,
        title: d.title,
        subtitle: `${d.adversary} · ${d.referenceNumber}`,
        module: "litiges",
        moduleLabel: "Litiges",
      });
    }
    for (const item of appState.pantry) {
      items.push({
        id: `pan-${item.id}`,
        title: item.name,
        subtitle: `Frigo (${item.quantity})`,
        module: "courses",
        moduleLabel: "Food",
      });
    }
    for (const shop of appState.shoppingList) {
      items.push({
        id: `shop-${shop.id}`,
        title: shop.name,
        subtitle: `Liste de courses · ${shop.category}`,
        module: "courses",
        moduleLabel: "Food",
      });
    }
    for (const rec of appState.recipes) {
      items.push({
        id: `rec-${rec.id}`,
        title: rec.title,
        subtitle: `Recette (${rec.timeMinutes} min)`,
        module: "courses",
        moduleLabel: "Food",
      });
    }
    for (const c of appState.clothes) {
      items.push({
        id: `cloth-${c.id}`,
        title: c.name,
        subtitle: `${c.category} · ${c.color}`,
        module: "dressing",
        moduleLabel: "Dressing",
      });
    }
    for (const s of appState.health.supplements) {
      items.push({
        id: `sup-${s.id}`,
        title: s.name,
        subtitle: `Complément (${s.timing})`,
        module: "sante",
        moduleLabel: "Santé",
      });
    }
    for (const w of appState.workouts) {
      items.push({
        id: `work-${w.id}`,
        title: w.title,
        subtitle: `${w.durationMinutes} min · ${w.focus}`,
        module: "sport",
        moduleLabel: "Sport",
      });
    }
    for (const m of liveEmails) {
      items.push({
        id: `mail-${m.uid}`,
        title: m.subject || "(Sans objet)",
        subtitle: `${m.fromName || m.fromEmail}`,
        module: "emails",
        moduleLabel: "Secrétariat",
      });
    }

    if (isHydrated) {
      const culture = loadCultureForSearch();
      for (const b of culture.books) {
        items.push({
          id: `book-${b.id}`,
          title: b.title,
          subtitle: b.author ? `Livre · ${b.author}` : "Livre",
          module: "culture",
          moduleLabel: "Culture",
        });
      }
      for (const m of culture.movies) {
        items.push({
          id: `movie-${m.id}`,
          title: m.title,
          subtitle: m.director ? `Film · ${m.director}` : "Film",
          module: "culture",
          moduleLabel: "Culture",
        });
      }
      for (const e of culture.expos) {
        items.push({
          id: `expo-${e.id}`,
          title: e.title,
          subtitle: `Expo · ${e.venue || ""} ${e.city || ""}`.trim(),
          module: "culture",
          moduleLabel: "Culture",
        });
      }
    }

    return items;
  }, [appState, liveEmails, isHydrated]);

  // Handlers transverses
  const handleSetEnergy = (energy: EnergyLevel) => {
    setAppState((prev) => ({
      ...prev,
      user: { ...prev.user, energyToday: energy },
      health: { ...prev.health, energyLevel: energy },
    }));
    showToast(
      `Énergie : ${energy === "low" ? "Basse" : energy === "medium" ? "Modérée" : "Haute"}`
    );
  };

  const handleToggleFocusMode = () => {
    setAppState((prev) => ({
      ...prev,
      user: { ...prev.user, focusMode: !prev.user.focusMode },
    }));
  };

  // Handlers Rappels
  const handleAddReminder = (reminder: Omit<ReminderItem, "id" | "completed">) => {
    const created: ReminderItem = {
      id: `rem-${Date.now()}`,
      ...reminder,
      completed: false,
    };
    setAppState((prev) => ({
      ...prev,
      reminders: [...prev.reminders, created],
    }));
    showToast(`Rappel « ${created.title} » ajouté`);
  };

  const handleToggleReminder = (id: string) => {
    setAppState((prev) => ({
      ...prev,
      reminders: prev.reminders.map((r) =>
        r.id === id ? { ...r, completed: !r.completed } : r
      ),
    }));
  };

  const handleDeleteReminder = (id: string) => {
    setAppState((prev) => ({
      ...prev,
      reminders: prev.reminders.filter((r) => r.id !== id),
    }));
    showToast("Rappel supprimé");
  };

  // Handlers Santé
  const handleToggleSupplement = (id: string) => {
    setAppState((prev) => ({
      ...prev,
      health: {
        ...prev.health,
        supplements: prev.health.supplements.map((s) =>
          s.id === id ? { ...s, taken: !s.taken } : s
        ),
      },
    }));
  };

  const handleUpdateBiomarkers = (patch: Partial<HealthData>) => {
    setAppState((prev) => ({
      ...prev,
      health: { ...prev.health, ...patch },
    }));
    showToast("Biomarqueurs mis à jour");
  };

  const handleAddSupplement = (sup: {
    name: string;
    timing: "matin" | "midi" | "soir";
    benefit: string;
  }) => {
    setAppState((prev) => ({
      ...prev,
      health: {
        ...prev.health,
        supplements: [
          ...prev.health.supplements,
          { id: `sup-${Date.now()}`, ...sup, taken: false },
        ],
      },
    }));
    showToast(`Complément « ${sup.name} » ajouté`);
  };

  const handleDeleteSupplement = (id: string) => {
    setAppState((prev) => ({
      ...prev,
      health: {
        ...prev.health,
        supplements: prev.health.supplements.filter((s) => s.id !== id),
      },
    }));
  };

  // Handlers Projets
  const handleCreateProject = (project: Omit<PersonalProject, "id">) => {
    const created: PersonalProject = {
      id: `proj-${Date.now()}`,
      ...project,
    };
    setAppState((prev) => ({
      ...prev,
      projects: [created, ...prev.projects],
    }));
    showToast(`Projet « ${created.title} » créé`);
  };

  const handleUpdateProject = (id: string, patch: Partial<PersonalProject>) => {
    setAppState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  };

  const handleDeleteProject = (id: string) => {
    setAppState((prev) => ({
      ...prev,
      projects: prev.projects.filter((p) => p.id !== id),
    }));
    showToast("Projet supprimé");
  };

  const handleToggleProjectTask = (projectId: string, taskId: string) => {
    setAppState((prev) => ({
      ...prev,
      projects: prev.projects.map((proj) => {
        if (proj.id !== projectId) return proj;
        return {
          ...proj,
          tasks: proj.tasks.map((task) =>
            task.id === taskId ? { ...task, completed: !task.completed } : task
          ),
        };
      }),
    }));
    showToast("Étape du projet mise à jour !");
  };

  // Handlers Litiges
  const handleCreateDispute = (dispute: Omit<DisputeCase, "id">) => {
    const created: DisputeCase = {
      id: `disp-${Date.now()}`,
      ...dispute,
    };
    setAppState((prev) => ({
      ...prev,
      disputes: [created, ...prev.disputes],
    }));
    showToast(`Dossier « ${created.title} » ouvert`);
  };

  const handleUpdateDispute = (id: string, patch: Partial<DisputeCase>) => {
    setAppState((prev) => ({
      ...prev,
      disputes: prev.disputes.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));
  };

  const handleDeleteDispute = (id: string) => {
    setAppState((prev) => ({
      ...prev,
      disputes: prev.disputes.filter((d) => d.id !== id),
    }));
    showToast("Dossier supprimé");
  };

  // Handlers Food & Courses
  const handleAddPantryItem = (item: Omit<PantryItem, "id">) => {
    const newItem: PantryItem = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...item,
    };
    setAppState((prev) => ({ ...prev, pantry: [newItem, ...prev.pantry] }));
    showToast(`« ${newItem.name} » ajouté au frigo`);
  };

  const handleAddMultiplePantryItems = (items: Array<Omit<PantryItem, "id">>) => {
    if (items.length === 0) return;
    const stamped: PantryItem[] = items.map((item, idx) => ({
      id: `p-${Date.now()}-${idx}`,
      ...item,
    }));
    setAppState((prev) => ({ ...prev, pantry: [...stamped, ...prev.pantry] }));
    showToast(`${stamped.length} aliment(s) ajouté(s) au frigo`);
  };

  const handleUpdatePantryStatus = (id: string, status: PantryItem["status"]) => {
    setAppState((prev) => ({
      ...prev,
      pantry: prev.pantry.map((p) => (p.id === id ? { ...p, status } : p)),
    }));
  };

  const handleDeletePantryItem = (id: string) => {
    setAppState((prev) => ({
      ...prev,
      pantry: prev.pantry.filter((p) => p.id !== id),
    }));
  };

  const handleSetRecipes = (recipes: RecipeItem[]) => {
    setAppState((prev) => ({ ...prev, recipes }));
  };

  const handleAddShoppingItem = (item: Omit<ShoppingItem, "id" | "checked">) => {
    const created: ShoppingItem = {
      id: `shop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...item,
      checked: false,
    };
    setAppState((prev) => ({
      ...prev,
      shoppingList: [created, ...prev.shoppingList],
    }));
    showToast(`« ${created.name} » ajouté aux courses`);
  };

  const handleToggleShoppingItem = (id: string) => {
    setAppState((prev) => ({
      ...prev,
      shoppingList: prev.shoppingList.map((s) =>
        s.id === id ? { ...s, checked: !s.checked } : s
      ),
    }));
  };

  const handleDeleteShoppingItem = (id: string) => {
    setAppState((prev) => ({
      ...prev,
      shoppingList: prev.shoppingList.filter((s) => s.id !== id),
    }));
  };

  const handleClearCheckedShopping = () => {
    setAppState((prev) => ({
      ...prev,
      shoppingList: prev.shoppingList.filter((s) => !s.checked),
    }));
    showToast("Articles cochés retirés de la liste");
  };

  // Handlers Dressing & Valise
  const handleAddClothing = (item: Omit<ClothingItem, "id">) => {
    const created: ClothingItem = {
      id: `c-${Date.now()}`,
      ...item,
    };
    setAppState((prev) => ({ ...prev, clothes: [created, ...prev.clothes] }));
    showToast(`« ${created.name} » ajouté au dressing`);
  };

  const handleDeleteClothing = (id: string) => {
    setAppState((prev) => ({
      ...prev,
      clothes: prev.clothes.filter((c) => c.id !== id),
    }));
    showToast("Vêtement retiré du dressing");
  };

  const handleSaveOutfit = (outfit: OutfitSuggestion) => {
    setAppState((prev) => ({
      ...prev,
      outfits: [outfit, ...prev.outfits.filter((o) => o.id !== outfit.id)].slice(0, 6),
    }));
    showToast("Nouvelle tenue du jour enregistrée !");
  };

  const handleUpdateTrip = (destination: string, days: number) => {
    setAppState((prev) => ({
      ...prev,
      tripDestination: destination,
      tripDays: days,
    }));
  };

  const handleSetPackingList = (items: PackingItem[]) => {
    setAppState((prev) => ({ ...prev, packingList: items }));
  };

  const handleTogglePackingItem = (id: string) => {
    setAppState((prev) => ({
      ...prev,
      packingList: prev.packingList.map((p) =>
        p.id === id ? { ...p, checked: !p.checked } : p
      ),
    }));
  };

  const handleAddPackingItem = (item: Omit<PackingItem, "id" | "checked">) => {
    const created: PackingItem = {
      id: `pack-${Date.now()}`,
      ...item,
      checked: false,
    };
    setAppState((prev) => ({
      ...prev,
      packingList: [...prev.packingList, created],
    }));
  };

  const handleDeletePackingItem = (id: string) => {
    setAppState((prev) => ({
      ...prev,
      packingList: prev.packingList.filter((p) => p.id !== id),
    }));
  };

  // Handlers Sport
  const handleAddWorkout = (workout: WorkoutSession) => {
    setAppState((prev) => ({
      ...prev,
      workouts: [workout, ...prev.workouts],
    }));
    showToast(`Séance « ${workout.title} » ajoutée !`);
  };

  const handleWorkoutCompleted = (workout: WorkoutSession) => {
    setAppState((prev) => ({
      ...prev,
      workoutLogs: [
        {
          id: `wlog-${Date.now()}`,
          workoutId: workout.id,
          title: workout.title,
          durationMinutes: workout.durationMinutes,
          completedAt: new Date().toISOString(),
        },
        ...prev.workoutLogs,
      ].slice(0, 50),
    }));
    showToast(`🎉 Séance « ${workout.title} » terminée (+${workout.durationMinutes} min) !`);
  };

  // Handler réel du Brain Dump
  const handleBrainDumpAction = (action: BrainDumpConfirmAction) => {
    const title = (action.payload.title || action.summary || "Action").trim();
    const today = todayDateString();

    switch (action.actionType) {
      case "add_shopping": {
        handleAddShoppingItem({
          name: title,
          category: action.payload.category || "Courses",
          priceEst: Number(action.payload.priceEst) || 3.5,
        });
        break;
      }
      case "add_pantry": {
        const cat = action.payload.category;
        const validCat =
          cat === "epicerie" || cat === "boissons" || cat === "surgeles" ? cat : "frais";
        handleAddPantryItem({
          name: title,
          category: validCat,
          quantity: action.payload.quantity || "1",
          status: "disponible",
          yukaScore: 80,
          yukaVerdict: "Bon",
        });
        break;
      }
      case "add_project_task": {
        setAppState((prev) => {
          const target =
            prev.projects.find((p) => p.id === action.payload.projectId) || prev.projects[0];
          if (!target) {
            return {
              ...prev,
              reminders: [
                ...prev.reminders,
                {
                  id: `rem-${Date.now()}`,
                  date: today,
                  time: "14:00",
                  title,
                  note: action.payload.note || "Brain Dump",
                  module: "projets",
                  completed: false,
                },
              ],
            };
          }
          return {
            ...prev,
            projects: prev.projects.map((p) =>
              p.id === target.id
                ? {
                    ...p,
                    tasks: [
                      ...p.tasks,
                      {
                        id: `task-${Date.now()}`,
                        title,
                        description: action.payload.note || "Ajouté depuis Brain Dump",
                        durationEst: "15 min",
                        completed: false,
                      },
                    ],
                  }
                : p
            ),
          };
        });
        showToast(`Étape ajoutée dans Projets : « ${title} »`);
        break;
      }
      case "create_project": {
        const cat = action.payload.category;
        const validCat = cat === "diy" || cat === "voyage" ? cat : "autre";
        handleCreateProject({
          title,
          category: validCat,
          summary: action.payload.note || "Créé depuis Brain Dump",
          budgetEstEur: 0,
          budgetSpentEur: 0,
          currentStepIndex: 0,
          tasks: [
            {
              id: `task-${Date.now()}`,
              title: "Définir la toute première micro-action (5 min)",
              description: "Ouvrir le projet et découper avec l'IA si besoin.",
              durationEst: "5 min",
              completed: false,
            },
          ],
        });
        break;
      }
      case "add_dispute_note": {
        setAppState((prev) => {
          const target =
            prev.disputes.find((d) => d.id === action.payload.disputeId) || prev.disputes[0];
          if (!target) return prev;
          const dateLabel = new Date().toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          });
          return {
            ...prev,
            disputes: prev.disputes.map((d) =>
              d.id === target.id
                ? {
                    ...d,
                    actionRequired: title,
                    status: "action_requise",
                    history: [...d.history, { date: dateLabel, action: title }],
                  }
                : d
            ),
          };
        });
        showToast(`Dossier litige mis à jour : « ${title} »`);
        break;
      }
      case "add_clothing": {
        const cat = action.payload.category;
        const validCat =
          cat === "bas" || cat === "chaussures" || cat === "veste" || cat === "accessoire"
            ? cat
            : "haut";
        handleAddClothing({
          name: title,
          category: validCat,
          color: action.payload.color || "À préciser",
          tags: ["brain-dump"],
          season: "toutes",
          morphoMatch: true,
          colorimetryMatch: true,
        });
        break;
      }
      case "add_reminder":
      default: {
        handleAddReminder({
          title,
          date: action.payload.date || today,
          time: action.payload.time || "14:00",
          note: action.payload.note || "Classé par Brain Dump",
          module: action.targetModule,
        });
        break;
      }
    }
  };

  const pendingEmailsCount = liveEmails.filter((e) => e.needsReply && !e.answered).length;
  const urgentDisputesCount = appState.disputes.filter(
    (d) => d.status === "action_requise"
  ).length;

  return (
    <div className="min-h-screen w-full bg-[#FAF8F2] flex flex-col md:flex-row font-sans selection:bg-[#f7b5d5] selection:text-slate-900 overflow-x-hidden">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#121316] text-white font-bold px-4 py-2.5 rounded-full shadow-2xl text-xs flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <span className="text-[#f7da64]">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Charcoal Sidebar */}
      <Sidebar
        currentModule={currentModule}
        onSelectModule={setCurrentModule}
        pendingEmailsCount={pendingEmailsCount}
        urgentDisputesCount={urgentDisputesCount}
        energy={appState.user.energyToday}
        onSetEnergy={handleSetEnergy}
        focusMode={appState.user.focusMode}
        onToggleFocusMode={handleToggleFocusMode}
        onOpenBrainDump={() => setIsBrainDumpOpen(true)}
      />

      {/* Main Full-Width Stage */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden w-full">
        {/* Top Bar Header */}
        <Header
          onSelectModule={setCurrentModule}
          pendingEmailsCount={pendingEmailsCount}
          searchItems={searchItems}
        />

        {/* Module Canvas */}
        <main className="flex-1 overflow-y-auto px-4 md:px-8 pb-10 w-full">
          {appState.user.focusMode ? (
            <FocusModeView
              onExit={() =>
                setAppState((prev) => ({
                  ...prev,
                  user: { ...prev.user, focusMode: false },
                }))
              }
              health={appState.health}
              projects={appState.projects}
              disputes={appState.disputes}
              reminders={appState.reminders}
              pendingEmailsCount={pendingEmailsCount}
              onToggleSupplement={handleToggleSupplement}
              onToggleProjectTask={handleToggleProjectTask}
              onToggleReminder={handleToggleReminder}
              onNavigate={(mod) => {
                setAppState((prev) => ({
                  ...prev,
                  user: { ...prev.user, focusMode: false },
                }));
                setCurrentModule(mod);
              }}
            />
          ) : (
            <div className="w-full">
              {currentModule === "dashboard" && (
                <DashboardModule
                  user={appState.user}
                  liveEmails={liveEmails}
                  gmailConfigured={gmailConfigured}
                  gmailLoading={gmailLoading}
                  onRefreshLivePreview={refreshLiveGmail}
                  outfit={appState.outfits[0]}
                  health={appState.health}
                  recipes={appState.recipes}
                  pantry={appState.pantry}
                  disputes={appState.disputes}
                  projects={appState.projects}
                  reminders={appState.reminders}
                  workoutLogs={appState.workoutLogs}
                  onAddReminder={handleAddReminder}
                  onToggleReminder={handleToggleReminder}
                  onDeleteReminder={handleDeleteReminder}
                  onNavigate={setCurrentModule}
                />
              )}

              {currentModule === "emails" && (
                <div className="w-full pt-2">
                  <EmailsModule
                    signature={
                      appState.user.name ? `Bien cordialement,\n${appState.user.name} DALERY` : ""
                    }
                    writingStyle={appState.user.emailWritingStyle}
                  />
                </div>
              )}

              {currentModule === "dressing" && (
                <div className="w-full pt-2">
                  <DressingModule
                    user={appState.user}
                    clothes={appState.clothes}
                    outfits={appState.outfits}
                    tripDestination={appState.tripDestination}
                    tripDays={appState.tripDays}
                    packingList={appState.packingList}
                    onAddClothing={handleAddClothing}
                    onDeleteClothing={handleDeleteClothing}
                    onSaveOutfit={handleSaveOutfit}
                    onUpdateTrip={handleUpdateTrip}
                    onSetPackingList={handleSetPackingList}
                    onTogglePackingItem={handleTogglePackingItem}
                    onAddPackingItem={handleAddPackingItem}
                    onDeletePackingItem={handleDeletePackingItem}
                  />
                </div>
              )}

              {currentModule === "sante" && (
                <div className="w-full pt-2">
                  <SanteModule
                    user={appState.user}
                    health={appState.health}
                    onToggleSupplement={handleToggleSupplement}
                    onUpdateBiomarkers={handleUpdateBiomarkers}
                    onAddSupplement={handleAddSupplement}
                    onDeleteSupplement={handleDeleteSupplement}
                  />
                </div>
              )}

              {currentModule === "courses" && (
                <div className="w-full pt-2">
                  <CoursesModule
                    energyLevel={appState.user.energyToday}
                    pantry={appState.pantry}
                    recipes={appState.recipes}
                    shoppingList={appState.shoppingList}
                    onAddPantryItem={handleAddPantryItem}
                    onAddMultiplePantryItems={handleAddMultiplePantryItems}
                    onUpdatePantryStatus={handleUpdatePantryStatus}
                    onDeletePantryItem={handleDeletePantryItem}
                    onSetRecipes={handleSetRecipes}
                    onAddShoppingItem={handleAddShoppingItem}
                    onToggleShoppingItem={handleToggleShoppingItem}
                    onDeleteShoppingItem={handleDeleteShoppingItem}
                    onClearCheckedShopping={handleClearCheckedShopping}
                  />
                </div>
              )}

              {currentModule === "sport" && (
                <div className="w-full pt-2">
                  <SportModule
                    workouts={appState.workouts}
                    workoutLogs={appState.workoutLogs}
                    currentEnergy={appState.user.energyToday}
                    onSetEnergy={handleSetEnergy}
                    onAddWorkout={handleAddWorkout}
                    onWorkoutCompleted={handleWorkoutCompleted}
                  />
                </div>
              )}

              {currentModule === "culture" && (
                <div className="w-full pt-2">
                  <CultureModule />
                </div>
              )}

              {currentModule === "litiges" && (
                <div className="w-full pt-2">
                  <LitigesModule
                    userName={appState.user.name}
                    disputes={appState.disputes}
                    onCreateDispute={handleCreateDispute}
                    onUpdateDispute={handleUpdateDispute}
                    onDeleteDispute={handleDeleteDispute}
                  />
                </div>
              )}

              {currentModule === "projets" && (
                <div className="w-full pt-2">
                  <ProjetsModule
                    projects={appState.projects}
                    onCreateProject={handleCreateProject}
                    onUpdateProject={handleUpdateProject}
                    onDeleteProject={handleDeleteProject}
                    onToggleTask={handleToggleProjectTask}
                  />
                </div>
              )}

              {currentModule === "parametres" && (
                <div className="w-full pt-2">
                  <ParametresModule
                    user={appState.user}
                    onUpdateProfile={(updated) => {
                      setAppState((prev) => ({
                        ...prev,
                        user: { ...prev.user, ...updated },
                      }));
                      showToast("Profil mis à jour !");
                    }}
                    onRestoreState={(restored) => {
                      setAppState(restored);
                      showToast("Sauvegarde restaurée !");
                    }}
                    onResetState={() => {
                      setAppState(resetAppState());
                      showToast("Données réinitialisées aux valeurs d'origine.");
                    }}
                    onNotify={showToast}
                  />
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Brain Dump Modal */}
      <BrainDumpModal
        isOpen={isBrainDumpOpen}
        onClose={() => setIsBrainDumpOpen(false)}
        projects={appState.projects}
        disputes={appState.disputes}
        userProfile={appState.user}
        onConfirmAction={handleBrainDumpAction}
      />
    </div>
  );
}
