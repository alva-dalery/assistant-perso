export type ModuleType =
  | "dashboard"
  | "emails"
  | "dressing"
  | "sante"
  | "courses"
  | "sport"
  | "litiges"
  | "projets"
  | "parametres";

export type EnergyLevel = "low" | "medium" | "high";

export interface UserProfile {
  name: string;
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

