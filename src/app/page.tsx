"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
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
import { HistoriqueModule } from "@/components/modules/HistoriqueModule";
import { ParametresModule } from "@/components/modules/ParametresModule";

import {
  applyCommandUndo,
  loadCommandHistory,
  MAX_HISTORY_ENTRIES,
  MODULE_LABELS,
  saveCommandHistory,
} from "@/lib/history";
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
  CommandHistoryEntry,
  CommandUndoPayload,
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
  const [toastUndoId, setToastUndoId] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [commandHistory, setCommandHistory] = useState<CommandHistoryEntry[]>([]);
  const appStateRef = useRef<AppState>(appState);
  appStateRef.current = appState;

  // Aperçu Gmail en direct (badge + Dashboard)
  const [liveEmails, setLiveEmails] = useState<LiveEmailSummary[]>([]);
  const [gmailConfigured, setGmailConfigured] = useState<boolean | null>(null);
  const [gmailLoading, setGmailLoading] = useState(false);

  const showToast = useCallback((msg: string, undoId?: string) => {
    setToastMessage(msg);
    setToastUndoId(undoId ?? null);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      setToastUndoId(null);
    }, 3800);
  }, []);

  const recordCommand = useCallback(
    (entry: {
      label: string;
      detail?: string;
      module: ModuleType;
      source?: "Manuel" | "Brain Dump" | "Système";
      undoPayload: CommandUndoPayload;
    }): string => {
      const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newEntry: CommandHistoryEntry = {
        id,
        timestamp: new Date().toISOString(),
        label: entry.label,
        detail: entry.detail,
        module: entry.module,
        moduleLabel: MODULE_LABELS[entry.module],
        source: entry.source ?? "Manuel",
        undoPayload: entry.undoPayload,
      };
      setCommandHistory((prev) => [newEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
      return id;
    },
    []
  );

  const handleUndoCommand = useCallback(
    (entryId: string) => {
      const target = commandHistory.find((e) => e.id === entryId);
      if (!target || target.undoneAt) return;

      setAppState((prev) => applyCommandUndo(prev, target.undoPayload));
      const undoneAt = new Date().toISOString();
      setCommandHistory((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, undoneAt } : e))
      );
      showToast(`Annulé : ${target.label}`);
    },
    [commandHistory, showToast]
  );

  const handleClearHistory = useCallback(() => {
    setCommandHistory([]);
    showToast("Historique des commandes vidé");
  }, [showToast]);

  // Hydratation depuis localStorage au montage
  useEffect(() => {
    const loaded = loadAppState();
    setAppState(loaded);
    setCommandHistory(loadCommandHistory());
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

  // Sauvegarde automatique de l'historique des commandes
  useEffect(() => {
    if (!hydratedRef.current) return;
    saveCommandHistory(commandHistory);
  }, [commandHistory]);

  const refreshLiveGmail = useCallback(async () => {
    setGmailLoading(true);
    try {
      const msgRes = await fetch("/api/gmail/messages?limit=8", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (msgRes.status === 400) {
        setGmailConfigured(false);
        setLiveEmails([]);
        return;
      }
      if (msgRes.ok) {
        setGmailConfigured(true);
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
    const prevEnergy = appStateRef.current.user.energyToday;
    if (prevEnergy === energy) return;
    const labelMap: Record<EnergyLevel, string> = {
      low: "Basse",
      medium: "Modérée",
      high: "Haute",
    };
    const cmdId = recordCommand({
      label: `Énergie TDAH passée à « ${labelMap[energy]} »`,
      detail: `Précédent : ${labelMap[prevEnergy]}`,
      module: currentModule,
      undoPayload: { kind: "set_energy", prevEnergy },
    });
    setAppState((prev) => ({
      ...prev,
      user: { ...prev.user, energyToday: energy },
      health: { ...prev.health, energyLevel: energy },
    }));
    showToast(`Énergie : ${labelMap[energy]}`, cmdId);
  };

  const handleToggleFocusMode = () => {
    const prevFocusMode = appStateRef.current.user.focusMode;
    recordCommand({
      label: prevFocusMode ? "Mode Focus désactivé" : "Mode Focus activé",
      module: currentModule,
      undoPayload: { kind: "set_focus_mode", prevFocusMode },
    });
    setAppState((prev) => ({
      ...prev,
      user: { ...prev.user, focusMode: !prev.user.focusMode },
    }));
  };

  // Handlers Rappels
  const handleAddReminder = (
    reminder: Omit<ReminderItem, "id" | "completed">,
    source: "Manuel" | "Brain Dump" = "Manuel"
  ) => {
    const created: ReminderItem = {
      id: `rem-${Date.now()}`,
      ...reminder,
      completed: false,
    };
    const cmdId = recordCommand({
      label: `Rappel ajouté : « ${created.title} »`,
      detail: `${created.date} à ${created.time}`,
      module: created.module || "dashboard",
      source,
      undoPayload: { kind: "remove_reminder", id: created.id },
    });
    setAppState((prev) => ({
      ...prev,
      reminders: [...prev.reminders, created],
    }));
    showToast(`Rappel « ${created.title} » ajouté`, cmdId);
  };

  const handleToggleReminder = (id: string) => {
    const target = appStateRef.current.reminders.find((r) => r.id === id);
    if (target) {
      recordCommand({
        label: target.completed
          ? `Rappel réouvert : « ${target.title} »`
          : `Rappel terminé : « ${target.title} »`,
        module: target.module || "dashboard",
        undoPayload: {
          kind: "set_reminder_completed",
          id,
          prevCompleted: target.completed,
        },
      });
    }
    setAppState((prev) => ({
      ...prev,
      reminders: prev.reminders.map((r) =>
        r.id === id ? { ...r, completed: !r.completed } : r
      ),
    }));
  };

  const handleDeleteReminder = (id: string) => {
    const idx = appStateRef.current.reminders.findIndex((r) => r.id === id);
    const target = idx >= 0 ? appStateRef.current.reminders[idx] : undefined;
    let cmdId: string | undefined;
    if (target) {
      cmdId = recordCommand({
        label: `Rappel supprimé : « ${target.title} »`,
        module: target.module || "dashboard",
        undoPayload: { kind: "restore_reminder", item: target, index: idx },
      });
    }
    setAppState((prev) => ({
      ...prev,
      reminders: prev.reminders.filter((r) => r.id !== id),
    }));
    showToast("Rappel supprimé", cmdId);
  };

  // Handlers Santé
  const handleToggleSupplement = (id: string) => {
    const target = appStateRef.current.health.supplements.find((s) => s.id === id);
    if (target) {
      recordCommand({
        label: target.taken
          ? `Complément décoché : « ${target.name} »`
          : `Complément pris : « ${target.name} »`,
        module: "sante",
        undoPayload: {
          kind: "set_supplement_taken",
          id,
          prevTaken: target.taken,
        },
      });
    }
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
    const prevHealth = appStateRef.current.health;
    const cmdId = recordCommand({
      label: "Biomarqueurs santé mis à jour",
      module: "sante",
      undoPayload: { kind: "restore_health", prevHealth },
    });
    setAppState((prev) => ({
      ...prev,
      health: { ...prev.health, ...patch },
    }));
    showToast("Biomarqueurs mis à jour", cmdId);
  };

  const handleAddSupplement = (sup: {
    name: string;
    timing: "matin" | "midi" | "soir";
    benefit: string;
  }) => {
    const newId = `sup-${Date.now()}`;
    const cmdId = recordCommand({
      label: `Complément ajouté : « ${sup.name} »`,
      detail: `${sup.timing} · ${sup.benefit}`,
      module: "sante",
      undoPayload: { kind: "remove_supplement", id: newId },
    });
    setAppState((prev) => ({
      ...prev,
      health: {
        ...prev.health,
        supplements: [
          ...prev.health.supplements,
          { id: newId, ...sup, taken: false },
        ],
      },
    }));
    showToast(`Complément « ${sup.name} » ajouté`, cmdId);
  };

  const handleDeleteSupplement = (id: string) => {
    const idx = appStateRef.current.health.supplements.findIndex((s) => s.id === id);
    const target = idx >= 0 ? appStateRef.current.health.supplements[idx] : undefined;
    let cmdId: string | undefined;
    if (target) {
      cmdId = recordCommand({
        label: `Complément supprimé : « ${target.name} »`,
        module: "sante",
        undoPayload: { kind: "restore_supplement", item: target, index: idx },
      });
    }
    setAppState((prev) => ({
      ...prev,
      health: {
        ...prev.health,
        supplements: prev.health.supplements.filter((s) => s.id !== id),
      },
    }));
    showToast("Complément supprimé", cmdId);
  };

  // Handlers Projets
  const handleCreateProject = (
    project: Omit<PersonalProject, "id">,
    source: "Manuel" | "Brain Dump" = "Manuel"
  ) => {
    const created: PersonalProject = {
      id: `proj-${Date.now()}`,
      ...project,
    };
    const cmdId = recordCommand({
      label: `Projet créé : « ${created.title} »`,
      module: "projets",
      source,
      undoPayload: { kind: "remove_project", id: created.id },
    });
    setAppState((prev) => ({
      ...prev,
      projects: [created, ...prev.projects],
    }));
    showToast(`Projet « ${created.title} » créé`, cmdId);
  };

  const handleUpdateProject = (id: string, patch: Partial<PersonalProject>) => {
    const idx = appStateRef.current.projects.findIndex((p) => p.id === id);
    const target = idx >= 0 ? appStateRef.current.projects[idx] : undefined;
    if (target) {
      recordCommand({
        label: `Projet modifié : « ${patch.title || target.title} »`,
        module: "projets",
        undoPayload: { kind: "restore_project", item: target, index: idx },
      });
    }
    setAppState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  };

  const handleDeleteProject = (id: string) => {
    const idx = appStateRef.current.projects.findIndex((p) => p.id === id);
    const target = idx >= 0 ? appStateRef.current.projects[idx] : undefined;
    let cmdId: string | undefined;
    if (target) {
      cmdId = recordCommand({
        label: `Projet supprimé : « ${target.title} »`,
        module: "projets",
        undoPayload: { kind: "restore_project", item: target, index: idx },
      });
    }
    setAppState((prev) => ({
      ...prev,
      projects: prev.projects.filter((p) => p.id !== id),
    }));
    showToast("Projet supprimé", cmdId);
  };

  const handleToggleProjectTask = (projectId: string, taskId: string) => {
    const proj = appStateRef.current.projects.find((p) => p.id === projectId);
    const task = proj?.tasks.find((t) => t.id === taskId);
    let cmdId: string | undefined;
    if (proj && task) {
      cmdId = recordCommand({
        label: task.completed
          ? `Étape réouverte : « ${task.title} »`
          : `Étape terminée : « ${task.title} »`,
        detail: `Projet : ${proj.title}`,
        module: "projets",
        undoPayload: {
          kind: "set_project_task_completed",
          projectId,
          taskId,
          prevCompleted: task.completed,
        },
      });
    }
    setAppState((prev) => ({
      ...prev,
      projects: prev.projects.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          tasks: p.tasks.map((t) =>
            t.id === taskId ? { ...t, completed: !t.completed } : t
          ),
        };
      }),
    }));
    showToast("Étape du projet mise à jour !", cmdId);
  };

  // Handlers Litiges
  const handleCreateDispute = (dispute: Omit<DisputeCase, "id">) => {
    const created: DisputeCase = {
      id: `disp-${Date.now()}`,
      ...dispute,
    };
    const cmdId = recordCommand({
      label: `Litige ouvert : « ${created.title} »`,
      detail: created.adversary,
      module: "litiges",
      undoPayload: { kind: "remove_dispute", id: created.id },
    });
    setAppState((prev) => ({
      ...prev,
      disputes: [created, ...prev.disputes],
    }));
    showToast(`Dossier « ${created.title} » ouvert`, cmdId);
  };

  const handleUpdateDispute = (id: string, patch: Partial<DisputeCase>) => {
    const idx = appStateRef.current.disputes.findIndex((d) => d.id === id);
    const target = idx >= 0 ? appStateRef.current.disputes[idx] : undefined;
    if (target) {
      recordCommand({
        label: `Litige mis à jour : « ${patch.title || target.title} »`,
        module: "litiges",
        undoPayload: { kind: "restore_dispute", item: target, index: idx },
      });
    }
    setAppState((prev) => ({
      ...prev,
      disputes: prev.disputes.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));
  };

  const handleDeleteDispute = (id: string) => {
    const idx = appStateRef.current.disputes.findIndex((d) => d.id === id);
    const target = idx >= 0 ? appStateRef.current.disputes[idx] : undefined;
    let cmdId: string | undefined;
    if (target) {
      cmdId = recordCommand({
        label: `Litige supprimé : « ${target.title} »`,
        module: "litiges",
        undoPayload: { kind: "restore_dispute", item: target, index: idx },
      });
    }
    setAppState((prev) => ({
      ...prev,
      disputes: prev.disputes.filter((d) => d.id !== id),
    }));
    showToast("Dossier supprimé", cmdId);
  };

  // Handlers Food & Courses
  const handleAddPantryItem = (
    item: Omit<PantryItem, "id">,
    source: "Manuel" | "Brain Dump" = "Manuel"
  ) => {
    const newItem: PantryItem = {
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...item,
    };
    const cmdId = recordCommand({
      label: `Ajouté au frigo : « ${newItem.name} »`,
      detail: `${newItem.quantity} · ${newItem.category}`,
      module: "courses",
      source,
      undoPayload: { kind: "remove_pantry_items", ids: [newItem.id] },
    });
    setAppState((prev) => ({ ...prev, pantry: [newItem, ...prev.pantry] }));
    showToast(`« ${newItem.name} » ajouté au frigo`, cmdId);
  };

  const handleAddMultiplePantryItems = (items: Array<Omit<PantryItem, "id">>) => {
    if (items.length === 0) return;
    const stamped: PantryItem[] = items.map((item, idx) => ({
      id: `p-${Date.now()}-${idx}`,
      ...item,
    }));
    const cmdId = recordCommand({
      label: `${stamped.length} aliment(s) ajouté(s) au frigo`,
      detail: stamped.map((s) => s.name).slice(0, 4).join(", "),
      module: "courses",
      undoPayload: { kind: "remove_pantry_items", ids: stamped.map((s) => s.id) },
    });
    setAppState((prev) => ({ ...prev, pantry: [...stamped, ...prev.pantry] }));
    showToast(`${stamped.length} aliment(s) ajouté(s) au frigo`, cmdId);
  };

  const handleUpdatePantryStatus = (id: string, status: PantryItem["status"]) => {
    const target = appStateRef.current.pantry.find((p) => p.id === id);
    if (target && target.status !== status) {
      recordCommand({
        label: `Statut frigo modifié : « ${target.name} » → ${status}`,
        module: "courses",
        undoPayload: { kind: "set_pantry_status", id, prevStatus: target.status },
      });
    }
    setAppState((prev) => ({
      ...prev,
      pantry: prev.pantry.map((p) => (p.id === id ? { ...p, status } : p)),
    }));
  };

  const handleDeletePantryItem = (id: string) => {
    const idx = appStateRef.current.pantry.findIndex((p) => p.id === id);
    const target = idx >= 0 ? appStateRef.current.pantry[idx] : undefined;
    let cmdId: string | undefined;
    if (target) {
      cmdId = recordCommand({
        label: `Aliment retiré du frigo : « ${target.name} »`,
        module: "courses",
        undoPayload: { kind: "restore_pantry_item", item: target, index: idx },
      });
    }
    setAppState((prev) => ({
      ...prev,
      pantry: prev.pantry.filter((p) => p.id !== id),
    }));
    if (cmdId) showToast("Aliment retiré du frigo", cmdId);
  };

  const handleSetRecipes = (recipes: RecipeItem[]) => {
    const prevRecipes = appStateRef.current.recipes;
    recordCommand({
      label: `Recettes mises à jour (${recipes.length})`,
      module: "courses",
      undoPayload: { kind: "restore_recipes", prevRecipes },
    });
    setAppState((prev) => ({ ...prev, recipes }));
  };

  const handleAddShoppingItem = (
    item: Omit<ShoppingItem, "id" | "checked">,
    source: "Manuel" | "Brain Dump" = "Manuel"
  ) => {
    const created: ShoppingItem = {
      id: `shop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ...item,
      checked: false,
    };
    const cmdId = recordCommand({
      label: `Ajouté aux courses : « ${created.name} »`,
      detail: created.category,
      module: "courses",
      source,
      undoPayload: { kind: "remove_shopping_item", id: created.id },
    });
    setAppState((prev) => ({
      ...prev,
      shoppingList: [created, ...prev.shoppingList],
    }));
    showToast(`« ${created.name} » ajouté aux courses`, cmdId);
  };

  const handleToggleShoppingItem = (id: string) => {
    const target = appStateRef.current.shoppingList.find((s) => s.id === id);
    if (target) {
      recordCommand({
        label: target.checked
          ? `Course décochée : « ${target.name} »`
          : `Course cochée : « ${target.name} »`,
        module: "courses",
        undoPayload: {
          kind: "set_shopping_checked",
          id,
          prevChecked: target.checked,
        },
      });
    }
    setAppState((prev) => ({
      ...prev,
      shoppingList: prev.shoppingList.map((s) =>
        s.id === id ? { ...s, checked: !s.checked } : s
      ),
    }));
  };

  const handleDeleteShoppingItem = (id: string) => {
    const target = appStateRef.current.shoppingList.find((s) => s.id === id);
    let cmdId: string | undefined;
    if (target) {
      cmdId = recordCommand({
        label: `Article retiré des courses : « ${target.name} »`,
        module: "courses",
        undoPayload: { kind: "restore_shopping_items", items: [target] },
      });
    }
    setAppState((prev) => ({
      ...prev,
      shoppingList: prev.shoppingList.filter((s) => s.id !== id),
    }));
    if (cmdId) showToast("Article retiré", cmdId);
  };

  const handleClearCheckedShopping = () => {
    const checkedItems = appStateRef.current.shoppingList.filter((s) => s.checked);
    let cmdId: string | undefined;
    if (checkedItems.length > 0) {
      cmdId = recordCommand({
        label: `${checkedItems.length} article(s) coché(s) retiré(s) des courses`,
        module: "courses",
        undoPayload: { kind: "restore_shopping_items", items: checkedItems },
      });
    }
    setAppState((prev) => ({
      ...prev,
      shoppingList: prev.shoppingList.filter((s) => !s.checked),
    }));
    showToast("Articles cochés retirés de la liste", cmdId);
  };

  // Handlers Dressing & Valise
  const handleAddClothing = (
    item: Omit<ClothingItem, "id">,
    source: "Manuel" | "Brain Dump" = "Manuel"
  ) => {
    const created: ClothingItem = {
      id: `c-${Date.now()}`,
      ...item,
    };
    const cmdId = recordCommand({
      label: `Vêtement ajouté : « ${created.name} »`,
      detail: `${created.category} · ${created.color}`,
      module: "dressing",
      source,
      undoPayload: { kind: "remove_clothing", id: created.id },
    });
    setAppState((prev) => ({ ...prev, clothes: [created, ...prev.clothes] }));
    showToast(`« ${created.name} » ajouté au dressing`, cmdId);
  };

  const handleDeleteClothing = (id: string) => {
    const idx = appStateRef.current.clothes.findIndex((c) => c.id === id);
    const target = idx >= 0 ? appStateRef.current.clothes[idx] : undefined;
    let cmdId: string | undefined;
    if (target) {
      cmdId = recordCommand({
        label: `Vêtement retiré du dressing : « ${target.name} »`,
        module: "dressing",
        undoPayload: { kind: "restore_clothing", item: target, index: idx },
      });
    }
    setAppState((prev) => ({
      ...prev,
      clothes: prev.clothes.filter((c) => c.id !== id),
    }));
    showToast("Vêtement retiré du dressing", cmdId);
  };

  const handleSaveOutfit = (outfit: OutfitSuggestion) => {
    const prevOutfits = appStateRef.current.outfits;
    const cmdId = recordCommand({
      label: `Tenue du jour enregistrée : « ${outfit.title} »`,
      module: "dressing",
      undoPayload: { kind: "restore_outfits", prevOutfits },
    });
    setAppState((prev) => ({
      ...prev,
      outfits: [outfit, ...prev.outfits.filter((o) => o.id !== outfit.id)].slice(0, 6),
    }));
    showToast("Nouvelle tenue du jour enregistrée !", cmdId);
  };

  const handleUpdateTrip = (destination: string, days: number) => {
    const prevDestination = appStateRef.current.tripDestination;
    const prevDays = appStateRef.current.tripDays;
    recordCommand({
      label: `Voyage mis à jour : ${destination} (${days} j)`,
      module: "dressing",
      undoPayload: { kind: "restore_trip", prevDestination, prevDays },
    });
    setAppState((prev) => ({
      ...prev,
      tripDestination: destination,
      tripDays: days,
    }));
  };

  const handleSetPackingList = (items: PackingItem[]) => {
    const prevPackingList = appStateRef.current.packingList;
    recordCommand({
      label: `Valise mise à jour (${items.length} éléments)`,
      module: "dressing",
      undoPayload: { kind: "restore_packing_list", prevPackingList },
    });
    setAppState((prev) => ({ ...prev, packingList: items }));
  };

  const handleTogglePackingItem = (id: string) => {
    const target = appStateRef.current.packingList.find((p) => p.id === id);
    if (target) {
      recordCommand({
        label: target.checked
          ? `Valise décochée : « ${target.label} »`
          : `Mis dans la valise : « ${target.label} »`,
        module: "dressing",
        undoPayload: { kind: "set_packing_checked", id, prevChecked: target.checked },
      });
    }
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
    recordCommand({
      label: `Ajouté à la valise : « ${created.label} »`,
      module: "dressing",
      undoPayload: { kind: "remove_packing_item", id: created.id },
    });
    setAppState((prev) => ({
      ...prev,
      packingList: [...prev.packingList, created],
    }));
  };

  const handleDeletePackingItem = (id: string) => {
    const idx = appStateRef.current.packingList.findIndex((p) => p.id === id);
    const target = idx >= 0 ? appStateRef.current.packingList[idx] : undefined;
    if (target) {
      recordCommand({
        label: `Retiré de la valise : « ${target.label} »`,
        module: "dressing",
        undoPayload: { kind: "restore_packing_item", item: target, index: idx },
      });
    }
    setAppState((prev) => ({
      ...prev,
      packingList: prev.packingList.filter((p) => p.id !== id),
    }));
  };

  // Handlers Sport
  const handleAddWorkout = (workout: WorkoutSession) => {
    const cmdId = recordCommand({
      label: `Séance ajoutée : « ${workout.title} »`,
      detail: `${workout.durationMinutes} min`,
      module: "sport",
      undoPayload: { kind: "remove_workout", id: workout.id },
    });
    setAppState((prev) => ({
      ...prev,
      workouts: [workout, ...prev.workouts],
    }));
    showToast(`Séance « ${workout.title} » ajoutée !`, cmdId);
  };

  const handleWorkoutCompleted = (workout: WorkoutSession) => {
    const logId = `wlog-${Date.now()}`;
    const cmdId = recordCommand({
      label: `Séance terminée : « ${workout.title} »`,
      detail: `+${workout.durationMinutes} min`,
      module: "sport",
      undoPayload: { kind: "remove_workout_log", id: logId },
    });
    setAppState((prev) => ({
      ...prev,
      workoutLogs: [
        {
          id: logId,
          workoutId: workout.id,
          title: workout.title,
          durationMinutes: workout.durationMinutes,
          completedAt: new Date().toISOString(),
        },
        ...prev.workoutLogs,
      ].slice(0, 50),
    }));
    showToast(`🎉 Séance « ${workout.title} » terminée (+${workout.durationMinutes} min) !`, cmdId);
  };

  // Handler réel du Brain Dump
  const handleBrainDumpAction = (action: BrainDumpConfirmAction) => {
    const title = (action.payload.title || action.summary || "Action").trim();
    const today = todayDateString();

    switch (action.actionType) {
      case "add_shopping": {
        handleAddShoppingItem(
          {
            name: title,
            category: action.payload.category || "Courses",
            priceEst: Number(action.payload.priceEst) || 3.5,
          },
          "Brain Dump"
        );
        break;
      }
      case "add_pantry": {
        const cat = action.payload.category;
        const validCat =
          cat === "epicerie" || cat === "boissons" || cat === "surgeles" ? cat : "frais";
        handleAddPantryItem(
          {
            name: title,
            category: validCat,
            quantity: action.payload.quantity || "1",
            status: "disponible",
            yukaScore: 80,
            yukaVerdict: "Bon",
          },
          "Brain Dump"
        );
        break;
      }
      case "add_project_task": {
        const projects = appStateRef.current.projects;
        const targetIndex = projects.findIndex((p) => p.id === action.payload.projectId);
        const target = targetIndex >= 0 ? projects[targetIndex] : projects[0];
        if (!target) {
          handleAddReminder(
            {
              date: today,
              time: "14:00",
              title,
              note: action.payload.note || "Brain Dump",
              module: "projets",
            },
            "Brain Dump"
          );
          break;
        }
        const effectiveIndex = targetIndex >= 0 ? targetIndex : 0;
        const cmdId = recordCommand({
          label: `Étape ajoutée au projet : « ${title} »`,
          detail: `Projet : ${target.title}`,
          module: "projets",
          source: "Brain Dump",
          undoPayload: { kind: "restore_project", item: target, index: effectiveIndex },
        });
        setAppState((prev) => ({
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
        }));
        showToast(`Étape ajoutée dans Projets : « ${title} »`, cmdId);
        break;
      }
      case "create_project": {
        const cat = action.payload.category;
        const validCat = cat === "diy" || cat === "voyage" ? cat : "autre";
        handleCreateProject(
          {
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
          },
          "Brain Dump"
        );
        break;
      }
      case "add_dispute_note": {
        const disputes = appStateRef.current.disputes;
        const targetIndex = disputes.findIndex((d) => d.id === action.payload.disputeId);
        const target = targetIndex >= 0 ? disputes[targetIndex] : disputes[0];
        if (!target) break;
        const effectiveIndex = targetIndex >= 0 ? targetIndex : 0;
        const cmdId = recordCommand({
          label: `Note ajoutée au litige : « ${title} »`,
          detail: target.title,
          module: "litiges",
          source: "Brain Dump",
          undoPayload: { kind: "restore_dispute", item: target, index: effectiveIndex },
        });
        const dateLabel = new Date().toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
        setAppState((prev) => ({
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
        }));
        showToast(`Dossier litige mis à jour : « ${title} »`, cmdId);
        break;
      }
      case "add_clothing": {
        const cat = action.payload.category;
        const validCat =
          cat === "bas" || cat === "chaussures" || cat === "veste" || cat === "accessoire"
            ? cat
            : "haut";
        handleAddClothing(
          {
            name: title,
            category: validCat,
            color: action.payload.color || "À préciser",
            tags: ["brain-dump"],
            season: "toutes",
            morphoMatch: true,
            colorimetryMatch: true,
          },
          "Brain Dump"
        );
        break;
      }
      case "add_reminder":
      default: {
        handleAddReminder(
          {
            title,
            date: action.payload.date || today,
            time: action.payload.time || "14:00",
            note: action.payload.note || "Classé par Brain Dump",
            module: action.targetModule,
          },
          "Brain Dump"
        );
        break;
      }
    }
  };

  const pendingEmailsCount = liveEmails.filter((e) => e.needsReply && !e.answered).length;
  const urgentDisputesCount = appState.disputes.filter(
    (d) => d.status === "action_requise"
  ).length;
  const undoableHistoryCount = useMemo(
    () => commandHistory.filter((e) => !e.undoneAt).length,
    [commandHistory]
  );

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden w-full bg-[#FAF8F2] flex flex-col md:flex-row font-sans selection:bg-[#f7b5d5] selection:text-slate-900 overflow-x-hidden">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#121316] text-white font-bold px-4 py-2.5 rounded-full shadow-2xl text-xs flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <span className="text-[#f7da64]">✓</span>
          <span>{toastMessage}</span>
          {toastUndoId && (
            <button
              type="button"
              onClick={() => handleUndoCommand(toastUndoId)}
              className="ml-1 px-2.5 py-0.5 rounded-full bg-[#f7b5d5] text-[#121316] hover:bg-white transition-colors font-bold"
            >
              Annuler
            </button>
          )}
        </div>
      )}

      {/* Charcoal Sidebar */}
      <Sidebar
        currentModule={currentModule}
        onSelectModule={setCurrentModule}
        pendingEmailsCount={pendingEmailsCount}
        urgentDisputesCount={urgentDisputesCount}
        undoableHistoryCount={undoableHistoryCount}
        searchItems={searchItems}
        energy={appState.user.energyToday}
        onSetEnergy={handleSetEnergy}
        focusMode={appState.user.focusMode}
        onToggleFocusMode={handleToggleFocusMode}
        onOpenBrainDump={() => setIsBrainDumpOpen(true)}
      />

      {/* Main Full-Width Stage */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 md:h-full overflow-hidden w-full">
        {/* Module Canvas */}
        <main className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 pt-4 md:pt-6 pb-10 w-full">
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

              {currentModule === "historique" && (
                <div className="w-full pt-2">
                  <HistoriqueModule
                    entries={commandHistory}
                    onUndoEntry={handleUndoCommand}
                    onClearHistory={handleClearHistory}
                    onNavigate={setCurrentModule}
                  />
                </div>
              )}

              {currentModule === "parametres" && (
                <div className="w-full pt-2">
                  <ParametresModule
                    user={appState.user}
                    onUpdateProfile={(updated) => {
                      const prevUser = appStateRef.current.user;
                      const cmdId = recordCommand({
                        label: "Profil utilisateur mis à jour",
                        module: "parametres",
                        undoPayload: { kind: "restore_user", prevUser },
                      });
                      setAppState((prev) => ({
                        ...prev,
                        user: { ...prev.user, ...updated },
                      }));
                      showToast("Profil mis à jour !", cmdId);
                    }}
                    onRestoreState={(restored) => {
                      const prevState = appStateRef.current;
                      const cmdId = recordCommand({
                        label: "Sauvegarde restaurée",
                        module: "parametres",
                        source: "Système",
                        undoPayload: { kind: "restore_full_state", prevState },
                      });
                      setAppState(restored);
                      showToast("Sauvegarde restaurée !", cmdId);
                    }}
                    onResetState={() => {
                      const prevState = appStateRef.current;
                      const cmdId = recordCommand({
                        label: "Données réinitialisées aux valeurs d'origine",
                        module: "parametres",
                        source: "Système",
                        undoPayload: { kind: "restore_full_state", prevState },
                      });
                      setAppState(resetAppState());
                      showToast("Données réinitialisées aux valeurs d'origine.", cmdId);
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
