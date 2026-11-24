import type { AppState, CommandHistoryEntry, CommandUndoPayload, ModuleType } from "@/types";

export const COMMAND_HISTORY_KEY = "assistantPerso.commandHistory.v1";
export const MAX_HISTORY_ENTRIES = 40;

export const MODULE_LABELS: Record<ModuleType, string> = {
  dashboard: "Dashboard",
  emails: "Secrétariat",
  dressing: "Dressing",
  sante: "Santé",
  courses: "Food",
  sport: "Sport",
  culture: "Culture",
  litiges: "Litiges",
  projets: "Projets",
  historique: "Historique",
  parametres: "Paramètres",
};

export function loadCommandHistory(): CommandHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(COMMAND_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_HISTORY_ENTRIES) as CommandHistoryEntry[];
  } catch {
    return [];
  }
}

export function saveCommandHistory(entries: CommandHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = entries.slice(0, MAX_HISTORY_ENTRIES);
    window.localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // Si localStorage est plein, réduire à 15 entrées sans les gros snapshots complets
    try {
      const compact = entries
        .filter((e) => e.undoPayload.kind !== "restore_full_state")
        .slice(0, 15);
      window.localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(compact));
    } catch {
      // Ignore si toujours plein
    }
  }
}

function insertAtIndex<T>(arr: T[], item: T, index: number): T[] {
  const clamped = Math.max(0, Math.min(index, arr.length));
  return [...arr.slice(0, clamped), item, ...arr.slice(clamped)];
}

export function applyCommandUndo(state: AppState, payload: CommandUndoPayload): AppState {
  switch (payload.kind) {
    case "set_energy":
      return {
        ...state,
        user: { ...state.user, energyToday: payload.prevEnergy },
        health: { ...state.health, energyLevel: payload.prevEnergy },
      };

    case "set_focus_mode":
      return {
        ...state,
        user: { ...state.user, focusMode: payload.prevFocusMode },
      };

    case "remove_reminder":
      return {
        ...state,
        reminders: state.reminders.filter((r) => r.id !== payload.id),
      };

    case "restore_reminder":
      if (state.reminders.some((r) => r.id === payload.item.id)) return state;
      return {
        ...state,
        reminders: insertAtIndex(state.reminders, payload.item, payload.index),
      };

    case "set_reminder_completed":
      return {
        ...state,
        reminders: state.reminders.map((r) =>
          r.id === payload.id ? { ...r, completed: payload.prevCompleted } : r
        ),
      };

    case "set_supplement_taken":
      return {
        ...state,
        health: {
          ...state.health,
          supplements: state.health.supplements.map((s) =>
            s.id === payload.id ? { ...s, taken: payload.prevTaken } : s
          ),
        },
      };

    case "restore_health":
      return {
        ...state,
        health: payload.prevHealth,
      };

    case "remove_supplement":
      return {
        ...state,
        health: {
          ...state.health,
          supplements: state.health.supplements.filter((s) => s.id !== payload.id),
        },
      };

    case "restore_supplement":
      if (state.health.supplements.some((s) => s.id === payload.item.id)) return state;
      return {
        ...state,
        health: {
          ...state.health,
          supplements: insertAtIndex(state.health.supplements, payload.item, payload.index),
        },
      };

    case "remove_project":
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== payload.id),
      };

    case "restore_project": {
      const exists = state.projects.some((p) => p.id === payload.item.id);
      return {
        ...state,
        projects: exists
          ? state.projects.map((p) => (p.id === payload.item.id ? payload.item : p))
          : insertAtIndex(state.projects, payload.item, payload.index),
      };
    }

    case "set_project_task_completed":
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === payload.projectId
            ? {
                ...p,
                tasks: p.tasks.map((t) =>
                  t.id === payload.taskId ? { ...t, completed: payload.prevCompleted } : t
                ),
              }
            : p
        ),
      };

    case "remove_dispute":
      return {
        ...state,
        disputes: state.disputes.filter((d) => d.id !== payload.id),
      };

    case "restore_dispute": {
      const exists = state.disputes.some((d) => d.id === payload.item.id);
      return {
        ...state,
        disputes: exists
          ? state.disputes.map((d) => (d.id === payload.item.id ? payload.item : d))
          : insertAtIndex(state.disputes, payload.item, payload.index),
      };
    }

    case "remove_pantry_items": {
      const idSet = new Set(payload.ids);
      return {
        ...state,
        pantry: state.pantry.filter((p) => !idSet.has(p.id)),
      };
    }

    case "restore_pantry_item":
      if (state.pantry.some((p) => p.id === payload.item.id)) return state;
      return {
        ...state,
        pantry: insertAtIndex(state.pantry, payload.item, payload.index),
      };

    case "set_pantry_status":
      return {
        ...state,
        pantry: state.pantry.map((p) =>
          p.id === payload.id ? { ...p, status: payload.prevStatus } : p
        ),
      };

    case "restore_recipes":
      return {
        ...state,
        recipes: payload.prevRecipes,
      };

    case "remove_shopping_item":
      return {
        ...state,
        shoppingList: state.shoppingList.filter((s) => s.id !== payload.id),
      };

    case "restore_shopping_items": {
      const existingIds = new Set(state.shoppingList.map((s) => s.id));
      const toRestore = payload.items.filter((item) => !existingIds.has(item.id));
      return {
        ...state,
        shoppingList: [...toRestore, ...state.shoppingList],
      };
    }

    case "set_shopping_checked":
      return {
        ...state,
        shoppingList: state.shoppingList.map((s) =>
          s.id === payload.id ? { ...s, checked: payload.prevChecked } : s
        ),
      };

    case "remove_clothing":
      return {
        ...state,
        clothes: state.clothes.filter((c) => c.id !== payload.id),
      };

    case "restore_clothing":
      if (state.clothes.some((c) => c.id === payload.item.id)) return state;
      return {
        ...state,
        clothes: insertAtIndex(state.clothes, payload.item, payload.index),
      };

    case "restore_outfits":
      return {
        ...state,
        outfits: payload.prevOutfits,
      };

    case "restore_trip":
      return {
        ...state,
        tripDestination: payload.prevDestination,
        tripDays: payload.prevDays,
      };

    case "restore_packing_list":
      return {
        ...state,
        packingList: payload.prevPackingList,
      };

    case "set_packing_checked":
      return {
        ...state,
        packingList: state.packingList.map((p) =>
          p.id === payload.id ? { ...p, checked: payload.prevChecked } : p
        ),
      };

    case "remove_packing_item":
      return {
        ...state,
        packingList: state.packingList.filter((p) => p.id !== payload.id),
      };

    case "restore_packing_item":
      if (state.packingList.some((p) => p.id === payload.item.id)) return state;
      return {
        ...state,
        packingList: insertAtIndex(state.packingList, payload.item, payload.index),
      };

    case "remove_workout":
      return {
        ...state,
        workouts: state.workouts.filter((w) => w.id !== payload.id),
      };

    case "remove_workout_log":
      return {
        ...state,
        workoutLogs: state.workoutLogs.filter((l) => l.id !== payload.id),
      };

    case "restore_user":
      return {
        ...state,
        user: payload.prevUser,
      };

    case "restore_full_state":
      return payload.prevState;
  }
}
