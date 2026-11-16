import {
  UserProfile,
  EmailDraft,
  ClothingItem,
  OutfitSuggestion,
  HealthData,
  RecipeItem,
  PantryItem,
  WorkoutSession,
  DisputeCase,
  PersonalProject,
} from "@/types";

export const initialUserProfile: UserProfile = {
  name: "Alva",
  energyToday: "medium",
  focusMode: false,
  morphology: "Silhouette V (Épaules dessinées, taille plus fine)",
  colorimetrySeason: "Automne Chaud (Tons terre, terracotta, olive, camel)",
  tdahNotes: "Préfère les micro-actions de 10 min, les validations en 1 clic et zéro culpabilisation.",
  emailWritingStyle: "Chaleureux, direct, professionnel sans lourdeur académique, tutoiement bienveillant ou vouvoiement cordial selon le contexte.",
};

export const initialEmails: EmailDraft[] = [
  {
    id: "mail-1",
    sender: "Marc Lefèvre",
    senderEmail: "marc.lefevre@agence-conseil.fr",
    subject: "Disponibilité pour le point d'étape du projet jeudi ?",
    receivedDate: "Aujourd'hui à 14:15",
    summary: "Demande de caler un point d'étape de 30 min jeudi après-midi.",
    suggestedReply: `Bonjour Marc,

Merci pour ton message. 

Jeudi après-midi me convient tout à fait. Je suis disponible à 14h30 ou à 16h si cela s'insère bien dans ton agenda. 

Dis-moi ce qui t'arrange le mieux et je te confirme le lien visio.

Bonne fin de journée,
Alva`,
    status: "pending_review",
    urgency: "haute",
  },
  {
    id: "mail-2",
    sender: "Claire D.",
    senderEmail: "claire@atelier-artisan.com",
    subject: "Devis pour le liner et la tuyauterie du bain nordique",
    receivedDate: "Hier à 18:30",
    summary: "Envoi du devis ajusté avec le raccord inox résistant à la chaleur.",
    suggestedReply: `Bonjour Claire,

Bien reçu le devis avec le raccord inox spécifique. C'est exactement ce qu'il nous fallait pour garantir la durabilité de l'installation du poêle.

Je valide la proposition. Peux-tu m'indiquer le délai de livraison estimé une fois le bon signé ?

Bien cordialement,
Alva`,
    status: "pending_review",
    urgency: "normale",
  },
];

export const initialClothes: ClothingItem[] = [
  {
    id: "c-1",
    name: "Surchemise en flanelle épaisse Terracotta",
    category: "veste",
    color: "Terracotta / Rouille",
    tags: ["chaud", "casual", "chic"],
    season: "mi-saison",
    morphoMatch: true,
    colorimetryMatch: true,
  },
  {
    id: "c-2",
    name: "T-shirt col rond écru coton lourd 240g",
    category: "haut",
    color: "Écru / Crème",
    tags: ["basique", "confort"],
    season: "toutes",
    morphoMatch: true,
    colorimetryMatch: true,
  },
  {
    id: "c-3",
    name: "Pantalon Chino coupe droite Kaki Olive",
    category: "bas",
    color: "Vert Olive",
    tags: ["polyvalent", "stretch"],
    season: "toutes",
    morphoMatch: true,
    colorimetryMatch: true,
  },
  {
    id: "c-4",
    name: "Bottines en cuir suédé marron cognac",
    category: "chaussures",
    color: "Cognac / Camel",
    tags: ["élégant", "imperméable"],
    season: "mi-saison",
    morphoMatch: true,
    colorimetryMatch: true,
  },
  {
    id: "c-5",
    name: "Pull en mérinos col montant Bleu Marine profond",
    category: "haut",
    color: "Bleu Marine",
    tags: ["respirant", "thermorégulateur"],
    season: "hiver",
    morphoMatch: true,
    colorimetryMatch: false, // Exemple : moins idéal selon la colorimétrie
  },
];

export const initialOutfits: OutfitSuggestion[] = [
  {
    id: "outfit-1",
    title: "Look Automne Confort & Propre",
    occasion: "Journée active & Réunions informelles",
    temperatureRange: "14°C - 19°C (Météo du jour)",
    whyItWorks: "Le col écru illumine le visage, la surchemise terracotta réchauffe le teint et structure le haut du corps.",
    items: [initialClothes[0], initialClothes[1], initialClothes[2], initialClothes[3]],
  },
];

export const initialHealthData: HealthData = {
  sleepScore: 86,
  sleepHours: 7.8,
  restingHr: 58,
  hrv: 62,
  steps: 6420,
  mindfulnessMinutes: 10,
  energyLevel: "medium",
  supplements: [
    {
      id: "sup-1",
      name: "Magnésium Bisglycinate + B6",
      timing: "matin",
      benefit: "Soutien neurotransmetteurs, réduction de l'anxiété et tension musculaire",
      taken: true,
    },
    {
      id: "sup-2",
      name: "Oméga-3 EPA concentré (2000mg)",
      timing: "matin",
      benefit: "Fluidité membranaire neuronale & régulation du focus TDAH",
      taken: true,
    },
    {
      id: "sup-3",
      name: "L-Tyrosine (500mg à jeun)",
      timing: "matin",
      benefit: "Précurseur de la dopamine pour faciliter le démarrage des tâches",
      taken: true,
    },
    {
      id: "sup-4",
      name: "Ashwagandha KSM-66 ou Théaninate",
      timing: "soir",
      benefit: "Apaisement du système nerveux sympathique (anti-TAG)",
      taken: false,
    },
  ],
};

export const initialPantry: PantryItem[] = [
  { id: "p-1", name: "Oeufs Bio plein air (x6)", category: "frais", quantity: "4 restants", status: "disponible", yukaScore: 90, yukaVerdict: "Excellent" },
  { id: "p-2", name: "Avocats Hass mûrs", category: "frais", quantity: "2 pièces", status: "disponible", yukaScore: 85, yukaVerdict: "Excellent" },
  { id: "p-3", name: "Pain au levain de seigle tranché", category: "epicerie", quantity: "1/2 pain", status: "disponible", yukaScore: 78, yukaVerdict: "Bon" },
  { id: "p-4", name: "Filets de saumon sauvage surgelés", category: "surgeles", quantity: "2 portions", status: "disponible", yukaScore: 94, yukaVerdict: "Excellent" },
  { id: "p-5", name: "Graines de courge & noix de cajou", category: "epicerie", quantity: "1 sachet", status: "bientot_fini", yukaScore: 88, yukaVerdict: "Excellent" },
  { id: "p-6", name: "Huile d'olive vierge extra pressée à froid", category: "epicerie", quantity: "1 bouteille", status: "disponible", yukaScore: 95, yukaVerdict: "Excellent" },
];

export const initialRecipes: RecipeItem[] = [
  {
    id: "rec-1",
    title: "Bowl Dopamine & Oméga-3 Anti-Coup de Pompe",
    timeMinutes: 12,
    brainBenefit: "Protéines digestes + Bons lipides = Zéro pic glycémique, concentration stable.",
    costEstimatedEur: 4.80,
    ingredients: [
      { name: "2 oeufs mollets ou pochés", inStock: true, yukaScore: 90 },
      { name: "1/2 avocat en tranches", inStock: true, yukaScore: 85 },
      { name: "1 tranche de pain seigle au levain grillée", inStock: true, yukaScore: 78 },
      { name: "Poignée de jeunes pousses d'épinards", inStock: false, yukaScore: 95 },
      { name: "Graines de courge torréfiées au tamari", inStock: true, yukaScore: 88 },
    ],
    instructions: [
      "Faire cuire les oeufs 6 min dans l'eau bouillante pour un coeur coulant.",
      "Toaster la tranche de pain au levain.",
      "Dresser l'avocat et les pousses d'épinards assaisonnées d'huile d'olive.",
      "Déposer les oeufs et parsemer de graines croquantes.",
    ],
  },
];

export const initialWorkouts: WorkoutSession[] = [
  {
    id: "w-low",
    title: "Déverrouillage & Régulation Nerveuse (Anti-Blocage TDAH)",
    durationMinutes: 8,
    energyLevelRequired: "low",
    focus: "Mobilité douce, respiration diaphragmatique & décharge de cortisol",
    exercises: [
      { name: "Respiration 4-7-8 au sol", durationOrReps: "2 minutes", tip: "Calme l'amygdale et fait baisser le stress instantanément" },
      { name: "Chat-Chameau (Cat-Cow) lent", durationOrReps: "10 cycles fluides", tip: "Mobilise la colonne vertébrale sans forcer" },
      { name: "Posture de l'enfant avec étirement des épaules", durationOrReps: "2 minutes", tip: "Détente profonde du bas du dos" },
      { name: "Squats au poids du corps doux", durationOrReps: "10 répétitions", tip: "Rappeler au cerveau que le corps est en mouvement" },
    ],
  },
  {
    id: "w-med",
    title: "Circuit Dopamine & Renforcement Express",
    durationMinutes: 20,
    energyLevelRequired: "medium",
    focus: "Gainage, jambes et cardio modéré pour stimuler la clarté mentale",
    exercises: [
      { name: "Fentes alternées lentes", durationOrReps: "12 répétitions / jambe", tip: "Garde le dos bien droit" },
      { name: "Pompes surélevées ou au sol", durationOrReps: "10 à 12 répétitions", tip: "Contraction contrôlée des pectoraux et gainage" },
      { name: "Planche dynamique (toucher épaules)", durationOrReps: "45 secondes", tip: "Évite de balancer le bassin" },
      { name: "Jumping Jacks modérés ou Shadow Boxing", durationOrReps: "60 secondes", tip: "Libération endorphinique immédiate" },
    ],
  },
  {
    id: "w-high",
    title: "Session Puissance & Cardio TDAH (Plein Régime)",
    durationMinutes: 35,
    energyLevelRequired: "high",
    focus: "Dépense énergétique complète, renforcement fonctionnel & endorphines maximales",
    exercises: [
      { name: "Échauffement articulaire dynamique", durationOrReps: "3 minutes", tip: "Rotations chevilles, genoux, hanches et épaules" },
      { name: "Squats sautés ou Squats profonds", durationOrReps: "15 répétitions", tip: "Amorti souple sur l'avant du pied" },
      { name: "Burpees adaptés sans choc", durationOrReps: "10 répétitions", tip: "Rythme soutenu pour faire monter le cardio" },
      { name: "Mountain Climbers rythmés", durationOrReps: "45 secondes", tip: "Gainage fort et genoux vers les coudes" },
      { name: "Étirements longs et retour au calme", durationOrReps: "4 minutes", tip: "Respiration ventrale pour réguler le rythme cardiaque" },
    ],
  },
];

export const initialDisputes: DisputeCase[] = [
  {
    id: "disp-1",
    title: "Sinistre Auto — Recours & Règlement Franchise (Accident non responsable)",
    adversary: "Assurance Pacifica / AXA",
    referenceNumber: "DOS-2024-8849-AUTO",
    status: "action_requise",
    nextDeadline: "20 Novembre 2026 (dans 4 jours)",
    actionRequired: "Envoyer la mise en demeure pour remboursement de franchise indûment retenue (art. L121-12 Code des Assurances).",
    history: [
      { date: "14 Octobre 2026", action: "Déclaration de sinistre & dépôt du constat amiable." },
      { date: "28 Octobre 2026", action: "Rapport d'expertise reçu : responsabilité adverse reconnue à 100%." },
      { date: "05 Novembre 2026", action: "Relance téléphonique sans réponse écrite concernant la franchise de 450€." },
    ],
    draftedLetter: {
      subject: "Mise en demeure — Restitution de la franchise suite au sinistre non responsable n° DOS-2024-8849-AUTO",
      legalBasis: "Article L121-12 du Code des Assurances et convention IRSA",
      body: `Madame, Monsieur,

Faisant suite à notre déclaration de sinistre en date du 14 octobre 2026 concernant mon véhicule immatriculé [XX-XXX-XX], je vous rappelle que le rapport d'expertise établi par votre cabinet mandaté a établi l'entière responsabilité du tiers identifié.

À ce jour, malgré la reconnaissance de la responsabilité adverse à 100%, la franchise contractuelle d'un montant de 450,00 € demeure indûment prélevée sur mon décompte d'indemnisation.

En application de l'article L. 121-12 du Code des assurances, la subrogation légale vous autorise à recouvrer l'intégralité des débours auprès de l'assureur adverse. Il vous appartient donc de me restituer sans délai cette somme.

Par la présente, je vous mets formellement en demeure de procéder au virement de ladite somme de 450,00 € sous un délai de huit (8) jours ouvrés à compter de la réception de cette lettre.

À défaut de règlement dans le délai imparti, je me verrai contraint de saisir le Médiateur de l'Assurance ainsi que la juridiction de proximité compétente.

Dans l'attente de votre confirmation de virement, je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.`,
    },
  },
  {
    id: "disp-2",
    title: "Contestation Option Payante Bancaire non sollicitée",
    adversary: "Banque BNP Paribas",
    referenceNumber: "CPT-483920194",
    status: "attente_reponse",
    nextDeadline: "28 Novembre 2026",
    actionRequired: "En attente du retour du service réclamation client suite au courrier recommandé du 3 novembre.",
    history: [
      { date: "02 Novembre 2026", action: "Constat de prélèvements mensuels de 9,90€ pour une option 'Sérénité+' jamais signée." },
      { date: "03 Novembre 2026", action: "Envoi LRAR avec demande de remboursement rétroactif (total 118,80€)." },
    ],
  },
];

export const initialProjects: PersonalProject[] = [
  {
    id: "proj-1",
    title: "Bain Nordique DIY Extérieur (Bois & Poêle Inox)",
    category: "diy",
    summary: "Création d'un bain chaud scandinave en cèdre/mélèze avec isolation thermique et système de chauffage autonome au feu de bois.",
    budgetEstEur: 2400,
    budgetSpentEur: 650,
    currentStepIndex: 1,
    tasks: [
      { id: "t-1", title: "Plans 3D et dimensionnement (Ø 180cm, 4-5 personnes)", description: "Calcul du volume d'eau (environ 1400L) et charge au sol (1.5 tonne).", durationEst: "3h", completed: true },
      { id: "t-2", title: "Terrassement & dalle stabilisée en gravier compacté", description: "Décaisser sur 15cm, géotextile, pose de dalles gravillonnées de niveau.", durationEst: "1 week-end", completed: false },
      { id: "t-3", title: "Commande poêle à bois externe en inox 316L résistant chlore", description: "Comparatif des puissances (30kW recommandé pour monter à 38°C en 2h).", durationEst: "1h", completed: false },
      { id: "t-4", title: "Montage de la cuve en douglas rainuré-languette et cerclages inox", description: "Assemblage sur lambourdes imputrescibles et tension progressive des cerclages.", durationEst: "2 jours", completed: false },
      { id: "t-5", title: "Installation plomberie thermosiphon (sans pompe électrique)", description: "Raccordement pente ascendante naturelle de l'eau chaude vers le haut de cuve.", durationEst: "4h", completed: false },
    ],
  },
  {
    id: "proj-2",
    title: "Voyage en Thaïlande (15 jours : Bangkok, Chiang Mai, Îles du Sud)",
    category: "voyage",
    summary: "Itinéraire équilibré alliant immersion culturelle, cuisine de rue, nature dans le nord et détente insulaire, sans surcharge de transports.",
    budgetEstEur: 3200,
    budgetSpentEur: 1450,
    currentStepIndex: 2,
    tasks: [
      { id: "v-1", title: "Réservation vols internationaux (Paris - Bangkok AR)", description: "Compagnie sélectionnée, escale courte, bagage 23kg inclus.", durationEst: "Fait", completed: true },
      { id: "v-2", title: "Formalités administratives & Santé", description: "Vérification passeport (> 6 mois de validité), assurance voyage rapatriement, anti-moustiques DEET.", durationEst: "Fait", completed: true },
      { id: "v-3", title: "Tracé de l'itinéraire & Réservations trains de nuit / vols internes", description: "Train de nuit couchettes Bangkok -> Chiang Mai, puis vol vers Krabi / Koh Lanta.", durationEst: "2h", completed: false },
      { id: "v-4", title: "Génération de la valise météo intelligente (chaleur humide & temples)", description: "Vêtements légers en lin, pantalons couvrant les genoux pour les temples, chaussures faciles à retirer.", durationEst: "30 min", completed: false },
    ],
  },
];

