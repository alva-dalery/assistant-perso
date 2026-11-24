import {
  initialClothes,
  initialDisputes,
  initialHealthData,
  initialOutfits,
  initialPantry,
  initialProjects,
  initialRecipes,
  initialUserProfile,
  initialWorkouts,
} from "@/lib/initialData";
import { loadParcels, saveParcels } from "@/lib/trackingMemory";
import type { SavedParcel } from "@/lib/trackingMemory";
import { loadSamples } from "@/lib/styleMemory";
import type { ReplySample } from "@/lib/styleMemory";
import type { AppState, PackingItem, ReminderItem, ShoppingItem } from "@/types";

export const APP_STATE_KEY = "assistantPerso.state.v1";
const CULTURE_KEY = "assistantPerso.culture.v1";
const STYLE_KEY = "assistantPerso.replyStyle.v1";
const LITIGES_SEEDED_KEY = "assistantPerso.litigesSeeded.v2";

export function todayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const initialShoppingList: ShoppingItem[] = [
  {
    id: "s-1",
    name: "Jeunes pousses d'épinards Bio",
    category: "Frais & Légumes",
    priceEst: 2.2,
    checked: false,
  },
  {
    id: "s-2",
    name: "Graines de courge Bio (vrac)",
    category: "Épicerie",
    priceEst: 3.5,
    checked: false,
  },
  {
    id: "s-3",
    name: "Chocolat noir 85% sans lécithine",
    category: "Épicerie plaisir",
    priceEst: 2.8,
    checked: true,
  },
  {
    id: "s-4",
    name: "Lait d'avoine sans sucres ajoutés",
    category: "Boissons végétales",
    priceEst: 1.95,
    checked: false,
  },
];

export const initialPackingList: PackingItem[] = [
  { id: "pack-1", label: "3x T-shirts écru coton respirant", note: "Déjà dans votre dressing", category: "Vêtements", checked: false },
  { id: "pack-2", label: "1x Pantalon Chino léger kaki (temples)", note: "Indispensable temples bouddhistes", category: "Vêtements", checked: true },
  { id: "pack-3", label: "2x Chemisettes lin / coton sable", note: "Matière aérée anti-chaleur", category: "Vêtements", checked: false },
  { id: "pack-4", label: "1x Surchemise terracotta (clim avion & train)", note: "Indispensable climatisations", category: "Vêtements", checked: false },
  { id: "pack-5", label: "2x Maillots de bain séchage rapide", note: "Îles & plages", category: "Vêtements", checked: false },
  { id: "pack-6", label: "Crème solaire minérale 50 + Répulsif DEET", note: "Pharmacie voyage", category: "Trousse & Santé", checked: false },
  { id: "pack-7", label: "Adaptateur prise universel + Powerbank", note: "Bagage cabine", category: "Tech & Papiers", checked: true },
];

export function getDefaultReminders(): ReminderItem[] {
  const today = todayDateString();
  return [
    {
      id: "rem-1",
      date: today,
      time: "08:30",
      title: "Routine Matin · Tyrosine & Magnésium",
      note: "Démarrage doux de la journée",
      module: "sante",
      completed: false,
    },
    {
      id: "rem-2",
      date: today,
      time: "11:00",
      title: "Trier les emails urgents",
      note: "Secrétariat Gmail",
      module: "emails",
      completed: false,
    },
    {
      id: "rem-3",
      date: today,
      time: "16:30",
      title: "Mobilité douce anti-blocage",
      note: "Séance 8 min",
      module: "sport",
      completed: false,
    },
  ];
}

export function getDefaultAppState(): AppState {
  return {
    version: 1,
    user: {
      ...initialUserProfile,
      city: "Lyon",
    },
    clothes: initialClothes,
    outfits: initialOutfits,
    health: initialHealthData,
    pantry: initialPantry,
    recipes: initialRecipes,
    shoppingList: initialShoppingList,
    workouts: initialWorkouts,
    workoutLogs: [],
    disputes: initialDisputes,
    projects: initialProjects,
    reminders: getDefaultReminders(),
    tripDestination: "Bangkok & Chiang Mai (Thaïlande)",
    tripDays: 14,
    packingList: initialPackingList,
  };
}

/**
 * État initial déterministe pour le rendu serveur (SSR / Vercel UTC) :
 * évite toute divergence de date entre le fuseau horaire du serveur et le navigateur.
 */
export function getSsrInitialAppState(): AppState {
  return {
    ...getDefaultAppState(),
    reminders: [],
  };
}

export function loadAppState(): AppState {
  const defaults = getDefaultAppState();
  if (typeof window === "undefined") return defaults;

  try {
    const raw = window.localStorage.getItem(APP_STATE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (!parsed || typeof parsed !== "object") return defaults;

    const existingDisputes = Array.isArray(parsed.disputes)
      ? parsed.disputes.filter(
          (d) =>
            !(
              (d.id === "disp-1" &&
                d.title.startsWith("Sinistre Auto — Recours")) ||
              (d.id === "disp-2" &&
                d.title.startsWith("Contestation Option Payante Bancaire"))
            )
        )
      : defaults.disputes;

    let finalDisputes = existingDisputes;
    if (!window.localStorage.getItem(LITIGES_SEEDED_KEY)) {
      const existingIds = new Set(existingDisputes.map((d) => d.id));
      const missingDefaults = defaults.disputes.filter((d) => !existingIds.has(d.id));
      finalDisputes = [...missingDefaults, ...existingDisputes];
      window.localStorage.setItem(LITIGES_SEEDED_KEY, "1");
    }

    return {
      version: 1,
      user: { ...defaults.user, ...(parsed.user ?? {}) },
      clothes: Array.isArray(parsed.clothes) ? parsed.clothes : defaults.clothes,
      outfits: Array.isArray(parsed.outfits) && parsed.outfits.length > 0 ? parsed.outfits : defaults.outfits,
      health: {
        ...defaults.health,
        ...(parsed.health ?? {}),
        supplements: Array.isArray(parsed.health?.supplements)
          ? parsed.health.supplements
          : defaults.health.supplements,
      },
      pantry: Array.isArray(parsed.pantry) ? parsed.pantry : defaults.pantry,
      recipes: Array.isArray(parsed.recipes) && parsed.recipes.length > 0 ? parsed.recipes : defaults.recipes,
      shoppingList: Array.isArray(parsed.shoppingList) ? parsed.shoppingList : defaults.shoppingList,
      workouts: Array.isArray(parsed.workouts) && parsed.workouts.length > 0 ? parsed.workouts : defaults.workouts,
      workoutLogs: Array.isArray(parsed.workoutLogs) ? parsed.workoutLogs : [],
      disputes: finalDisputes,
      projects: Array.isArray(parsed.projects) ? parsed.projects : defaults.projects,
      reminders: Array.isArray(parsed.reminders) ? parsed.reminders : defaults.reminders,
      tripDestination:
        typeof parsed.tripDestination === "string" && parsed.tripDestination.trim()
          ? parsed.tripDestination
          : defaults.tripDestination,
      tripDays:
        typeof parsed.tripDays === "number" && parsed.tripDays > 0
          ? parsed.tripDays
          : defaults.tripDays,
      packingList: Array.isArray(parsed.packingList) ? parsed.packingList : defaults.packingList,
    };
  } catch {
    return defaults;
  }
}

export function saveAppState(state: AppState): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function resetAppState(): AppState {
  const defaults = getDefaultAppState();
  saveAppState(defaults);
  return defaults;
}

interface BackupBundle {
  exportedAt: string;
  appVersion: number;
  state: AppState;
  culture?: unknown;
  parcels?: SavedParcel[];
  styleSamples?: ReplySample[];
}

/**
 * Exporte toutes les données personnelles (sans jamais exporter les clés API).
 */
export function exportBackupJson(): string {
  const state = loadAppState();
  let culture: unknown = undefined;
  if (typeof window !== "undefined") {
    try {
      const rawCulture = window.localStorage.getItem(CULTURE_KEY);
      if (rawCulture) culture = JSON.parse(rawCulture);
    } catch {
      culture = undefined;
    }
  }

  const bundle: BackupBundle = {
    exportedAt: new Date().toISOString(),
    appVersion: 1,
    state,
    culture,
    parcels: loadParcels(),
    styleSamples: loadSamples(),
  };

  return JSON.stringify(bundle, null, 2);
}

export function importBackupJson(raw: string): {
  ok: boolean;
  state?: AppState;
  error?: string;
} {
  if (typeof window === "undefined") {
    return { ok: false, error: "Import impossible côté serveur." };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<BackupBundle> & Partial<AppState>;
    const candidateState =
      parsed && typeof parsed === "object" && "state" in parsed && parsed.state
        ? (parsed.state as Partial<AppState>)
        : (parsed as Partial<AppState>);

    if (!candidateState || !candidateState.user || typeof candidateState.user.name !== "string") {
      return {
        ok: false,
        error: "Fichier JSON invalide : structure Assistant perso introuvable.",
      };
    }

    const defaults = getDefaultAppState();
    const merged: AppState = {
      version: 1,
      user: { ...defaults.user, ...candidateState.user },
      clothes: Array.isArray(candidateState.clothes) ? candidateState.clothes : defaults.clothes,
      outfits:
        Array.isArray(candidateState.outfits) && candidateState.outfits.length > 0
          ? candidateState.outfits
          : defaults.outfits,
      health: {
        ...defaults.health,
        ...(candidateState.health ?? {}),
        supplements: Array.isArray(candidateState.health?.supplements)
          ? candidateState.health.supplements
          : defaults.health.supplements,
      },
      pantry: Array.isArray(candidateState.pantry) ? candidateState.pantry : defaults.pantry,
      recipes:
        Array.isArray(candidateState.recipes) && candidateState.recipes.length > 0
          ? candidateState.recipes
          : defaults.recipes,
      shoppingList: Array.isArray(candidateState.shoppingList)
        ? candidateState.shoppingList
        : defaults.shoppingList,
      workouts:
        Array.isArray(candidateState.workouts) && candidateState.workouts.length > 0
          ? candidateState.workouts
          : defaults.workouts,
      workoutLogs: Array.isArray(candidateState.workoutLogs) ? candidateState.workoutLogs : [],
      disputes: Array.isArray(candidateState.disputes)
        ? candidateState.disputes
        : defaults.disputes,
      projects: Array.isArray(candidateState.projects)
        ? candidateState.projects
        : defaults.projects,
      reminders: Array.isArray(candidateState.reminders)
        ? candidateState.reminders
        : defaults.reminders,
      tripDestination:
        typeof candidateState.tripDestination === "string"
          ? candidateState.tripDestination
          : defaults.tripDestination,
      tripDays:
        typeof candidateState.tripDays === "number"
          ? candidateState.tripDays
          : defaults.tripDays,
      packingList: Array.isArray(candidateState.packingList)
        ? candidateState.packingList
        : defaults.packingList,
    };

    const saved = saveAppState(merged);
    if (!saved) {
      return { ok: false, error: "Impossible d'écrire dans localStorage (quota dépassé)." };
    }

    if (parsed.culture && typeof parsed.culture === "object") {
      try {
        window.localStorage.setItem(CULTURE_KEY, JSON.stringify(parsed.culture));
      } catch {
        // ignore culture restore error
      }
    }
    if (Array.isArray(parsed.parcels)) {
      saveParcels(parsed.parcels);
    }
    if (Array.isArray(parsed.styleSamples)) {
      try {
        window.localStorage.setItem(STYLE_KEY, JSON.stringify(parsed.styleSamples.slice(-30)));
      } catch {
        // ignore style restore error
      }
    }

    return { ok: true, state: merged };
  } catch {
    return { ok: false, error: "Le fichier sélectionné n'est pas un JSON valide." };
  }
}

export function loadCultureForSearch(): {
  books: Array<{ id: string; title: string; author?: string }>;
  movies: Array<{ id: string; title: string; director?: string }>;
  expos: Array<{ id: string; title: string; venue?: string; city?: string }>;
} {
  if (typeof window === "undefined") return { books: [], movies: [], expos: [] };
  try {
    const raw = window.localStorage.getItem(CULTURE_KEY);
    if (!raw) return { books: [], movies: [], expos: [] };
    const parsed = JSON.parse(raw) as {
      books?: Array<{ id: string; title: string; author?: string }>;
      movies?: Array<{ id: string; title: string; director?: string }>;
      expos?: Array<{ id: string; title: string; venue?: string; city?: string }>;
    };
    return {
      books: Array.isArray(parsed.books) ? parsed.books : [],
      movies: Array.isArray(parsed.movies) ? parsed.movies : [],
      expos: Array.isArray(parsed.expos) ? parsed.expos : [],
    };
  } catch {
    return { books: [], movies: [], expos: [] };
  }
}
