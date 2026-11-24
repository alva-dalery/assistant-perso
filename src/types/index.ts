export type ModuleType =
  | "dashboard"
  | "emails"
  | "dressing"
  | "sante"
  | "courses"
  | "sport"
  | "litiges"
  | "projets"
  | "culture"
  | "historique"
  | "parametres";

export type EnergyLevel = "low" | "medium" | "high";

export interface UserProfile {
  name: string;
  city?: string;
  energyToday: EnergyLevel;
  focusMode: boolean;
  morphology: string; // ex: "Trapèze / H"
  colorimetrySeason: string; // ex: "Automne Chaud"
  tdahNotes: string;
  emailWritingStyle: string;
}

export interface EmailDraft {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  receivedDate: string;
  summary: string;
  suggestedReply: string;
  status: "pending_review" | "approved" | "sent" | "rejected";
  urgency: "haute" | "normale" | "basse";
  aiPowered?: boolean;
}

export interface LiveEmailSummary {
  uid: number;
  subject: string;
  fromName: string;
  fromEmail: string;
  date: string;
  seen: boolean;
  answered: boolean;
  category: string;
  needsReply: boolean;
  reason: string;
}

export interface ClothingItem {
  id: string;
  name: string;
  category: "haut" | "bas" | "chaussures" | "veste" | "accessoire";
  color: string;
  photoUrl?: string;
  tags: string[];
  season: "ete" | "hiver" | "mi-saison" | "toutes";
  morphoMatch: boolean;
  colorimetryMatch: boolean;
}

export interface OutfitSuggestion {
  id: string;
  title: string;
  occasion: string;
  temperatureRange: string;
  items: ClothingItem[];
  whyItWorks: string;
}

export interface HealthData {
  sleepScore: number; // 0 - 100 (Withings)
  sleepHours: number;
  restingHr: number; // bpm (Withings / Apple Health)
  hrv: number; // ms
  steps: number;
  mindfulnessMinutes: number;
  energyLevel: EnergyLevel;
  supplements: {
    id: string;
    name: string;
    timing: "matin" | "midi" | "soir";
    benefit: string;
    taken: boolean;
  }[];
}

export interface RecipeItem {
  id: string;
  title: string;
  timeMinutes: number;
  brainBenefit: string; // e.g., "Riche en Tyrosine & Oméga-3"
  costEstimatedEur: number;
  ingredients: { name: string; inStock: boolean; yukaScore?: number }[];
  instructions: string[];
}

export interface PantryItem {
  id: string;
  name: string;
  category: "frais" | "epicerie" | "boissons" | "surgeles";
  quantity: string;
  status: "disponible" | "a_racheter" | "bientot_fini";
  yukaScore?: number; // 0 - 100
  yukaVerdict?: "Excellent" | "Bon" | "Médiocre" | "Mauvais";
}

export interface WorkoutSession {
  id: string;
  title: string;
  durationMinutes: number;
  energyLevelRequired: EnergyLevel;
  focus: string;
  exercises: { name: string; durationOrReps: string; tip: string }[];
}

export interface DisputeCase {
  id: string;
  title: string;
  adversary: string; // "Assurance AXA", "Banque BNP", etc.
  referenceNumber: string;
  status: "en_cours" | "attente_reponse" | "resolu" | "action_requise";
  nextDeadline: string;
  actionRequired: string;
  history: { date: string; action: string }[];
  draftedLetter?: {
    subject: string;
    body: string;
    legalBasis: string;
  };
}

export interface ProjectTask {
  id: string;
  title: string;
  description: string;
  durationEst: string;
  completed: boolean;
}

export interface PersonalProject {
  id: string;
  title: string;
  category: "diy" | "voyage" | "autre";
  summary: string;
  budgetEstEur: number;
  budgetSpentEur: number;
  currentStepIndex: number;
  tasks: ProjectTask[];
}


export type CultureStatus = "wishlist" | "reading" | "owned";

export interface BookItem {
  id: string;
  title: string;
  author: string;
  isbn?: string;
  coverUrl?: string;
  status: CultureStatus;
  notes?: string;
}

export interface MovieItem {
  id: string;
  title: string;
  director?: string;
  year?: string;
  coverUrl?: string;
  status: CultureStatus;
  notes?: string;
}

export interface ExpoItem {
  id: string;
  title: string;
  venue: string;
  city: string;
  startDate: string;
  endDate: string;
  link?: string;
  imageUrl?: string;
  notes?: string;
}

export interface ReminderItem {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  title: string;
  note?: string;
  module?: ModuleType;
  completed: boolean;
}

export interface ShoppingItem {
  id: string;
  name: string;
  category: string;
  priceEst: number;
  checked: boolean;
}

export interface WorkoutLog {
  id: string;
  workoutId: string;
  title: string;
  durationMinutes: number;
  completedAt: string; // ISO
}

export interface PackingItem {
  id: string;
  label: string;
  note: string;
  category?: string;
  checked: boolean;
}

export interface AppState {
  version: number;
  user: UserProfile;
  clothes: ClothingItem[];
  outfits: OutfitSuggestion[];
  health: HealthData;
  pantry: PantryItem[];
  recipes: RecipeItem[];
  shoppingList: ShoppingItem[];
  workouts: WorkoutSession[];
  workoutLogs: WorkoutLog[];
  disputes: DisputeCase[];
  projects: PersonalProject[];
  reminders: ReminderItem[];
  tripDestination: string;
  tripDays: number;
  packingList: PackingItem[];
}

export interface BrainDumpConfirmAction {
  actionType:
    | "add_reminder"
    | "add_shopping"
    | "add_pantry"
    | "add_project_task"
    | "create_project"
    | "add_dispute_note"
    | "add_clothing"
    | "none";
  targetModule: ModuleType;
  moduleLabel: string;
  summary: string;
  suggestion: string;
  payload: {
    title?: string;
    note?: string;
    time?: string;
    date?: string;
    category?: string;
    priceEst?: number;
    quantity?: string;
    projectId?: string;
    disputeId?: string;
    color?: string;
  };
}

export interface GlobalSearchResult {
  id: string;
  title: string;
  subtitle: string;
  module: ModuleType;
  moduleLabel: string;
}

export type CommandUndoPayload =
  | { kind: "set_energy"; prevEnergy: EnergyLevel }
  | { kind: "set_focus_mode"; prevFocusMode: boolean }
  | { kind: "remove_reminder"; id: string }
  | { kind: "restore_reminder"; item: ReminderItem; index: number }
  | { kind: "set_reminder_completed"; id: string; prevCompleted: boolean }
  | { kind: "set_supplement_taken"; id: string; prevTaken: boolean }
  | { kind: "restore_health"; prevHealth: HealthData }
  | { kind: "remove_supplement"; id: string }
  | { kind: "restore_supplement"; item: HealthData["supplements"][number]; index: number }
  | { kind: "remove_project"; id: string }
  | { kind: "restore_project"; item: PersonalProject; index: number }
  | { kind: "set_project_task_completed"; projectId: string; taskId: string; prevCompleted: boolean }
  | { kind: "remove_dispute"; id: string }
  | { kind: "restore_dispute"; item: DisputeCase; index: number }
  | { kind: "remove_pantry_items"; ids: string[] }
  | { kind: "restore_pantry_item"; item: PantryItem; index: number }
  | { kind: "set_pantry_status"; id: string; prevStatus: PantryItem["status"] }
  | { kind: "restore_recipes"; prevRecipes: RecipeItem[] }
  | { kind: "remove_shopping_item"; id: string }
  | { kind: "restore_shopping_items"; items: ShoppingItem[] }
  | { kind: "set_shopping_checked"; id: string; prevChecked: boolean }
  | { kind: "remove_clothing"; id: string }
  | { kind: "restore_clothing"; item: ClothingItem; index: number }
  | { kind: "restore_outfits"; prevOutfits: OutfitSuggestion[] }
  | { kind: "restore_trip"; prevDestination: string; prevDays: number }
  | { kind: "restore_packing_list"; prevPackingList: PackingItem[] }
  | { kind: "set_packing_checked"; id: string; prevChecked: boolean }
  | { kind: "remove_packing_item"; id: string }
  | { kind: "restore_packing_item"; item: PackingItem; index: number }
  | { kind: "remove_workout"; id: string }
  | { kind: "remove_workout_log"; id: string }
  | { kind: "restore_user"; prevUser: UserProfile }
  | { kind: "restore_full_state"; prevState: AppState };

export interface CommandHistoryEntry {
  id: string;
  timestamp: string; // ISO
  label: string;
  detail?: string;
  module: ModuleType;
  moduleLabel: string;
  source?: "Manuel" | "Brain Dump" | "Système";
  undoPayload: CommandUndoPayload;
  undoneAt?: string;
}
