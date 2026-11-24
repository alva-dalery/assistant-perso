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
    id: "disp-allianz-perone",
    title: "Sinistre Corporel — Fracture du péroné (Wam Park / Allianz)",
    adversary: "Allianz (RC Pro Wam Park Condrieu)",
    referenceNumber: "2207GACNC00130 / B2250073846",
    status: "action_requise",
    nextDeadline: "16 Décembre 2026 (convocation Nouméa impossible)",
    actionRequired:
      "Envoyer le mail/LRAR à Allianz (sinistre.nc@sami-allianz.fr, corporel@allianz.fr, dpr.om@sami-allianz.fr) avec justificatif de domicile pour désigner un médecin expert à Lyon et confirmer l'impossibilité d'honorer la convocation du 16/12/2026 à Nouméa. (Dossier local : Accident péroné)",
    history: [
      {
        date: "30 Juillet 2022",
        action:
          "Accident au Wam Park de Condrieu (module gonflable sous-gonflé) : fracture du péroné gauche, urgences HCL Lyon Sud.",
      },
      {
        date: "01 Août 2022",
        action:
          "Ostéosynthèse au CH Pierre Oudot (Bourgoin-Jallieu), plâtre sans appui 45 jours, arrêt de travail de 3 mois.",
      },
      {
        date: "16 Août 2022",
        action: "Envoi de la lettre de doléances au Wam Park.",
      },
      {
        date: "20 Juillet 2023",
        action:
          "Ablation du matériel (vis/plaque) à la Clinique Kuindo-Magnin (Nouméa) + 42 séances de kinésithérapie au total.",
      },
      {
        date: "11 Janvier 2026",
        action:
          "Envoi de l'avenant à la lettre de doléances (36 pièces : 2 407,62 € de frais avancés, 20 893,98 € de pertes de CA, 424,74 € de frais pro).",
      },
      {
        date: "23 Janvier 2026",
        action:
          "Certificat médical de consolidation établi (transmis à Allianz le 26/01/2026 avec 3 comptes rendus de radiologie).",
      },
      {
        date: "03 Février 2026",
        action: "Réception d'une provision de 2 100 €.",
      },
      {
        date: "01 Juillet 2026",
        action:
          "Dossier transmis au service Défense pénale et recours (DPR) pour le contrat NOH.",
      },
      {
        date: "21 Septembre 2026",
        action:
          "Demande de réattribution de l'expertise médicale en région lyonnaise (résidence en Métropole depuis juin 2026).",
      },
      {
        date: "10 Novembre 2026",
        action:
          "Convocation du Dr MAILLAUD pour une expertise le 16/12/2026 à 13h30 à Nouméa (2e médecin désigné à Nouméa).",
      },
      {
        date: "12 Novembre 2026",
        action:
          "Réponse au Dr MAILLAUD (hors du territoire) et rédaction du projet de mail à Allianz pour expertise à Lyon.",
      },
    ],
    draftedLetter: {
      subject:
        "Dossier 2207GACNC00130 / sinistre B2250073846 — Expertise médicale : impossibilité d'assister à la convocation du 16/12/2026 à Nouméa et demande de désignation d'un expert en métropole",
      legalBasis:
        "Responsabilité civile professionnelle (contrat CP500000061534) & garantie Défense Pénale et Recours",
      body: `Madame, Monsieur,

Je fais suite à la convocation reçue le 10 novembre 2026 du Docteur Claude MAILLAUD, qui me propose une expertise médicale le mercredi 16 décembre 2026 à 13 h 30 à Nouméa, dans le cadre du sinistre référencé ci-dessus.

1. Rappel de ma situation
Je réside depuis juin 2026 en métropole, dans la région lyonnaise, pour une durée indéterminée. Je vous ai informés de cette situation à plusieurs reprises (20/07/2026, 21/09/2026, 29/09/2026 et 12/11/2026). Le Docteur MAILLAUD est donc le deuxième médecin désigné à Nouméa, alors que ma localisation actuelle vous a été communiquée par écrit. Je ne peux pas me rendre à cette convocation qui suppose un déplacement de plus de 16 000 km.

2. Mes demandes
1. Désigner un médecin expert dans la région lyonnaise, comme vous l'avez indiqué être en mesure de le faire, dans un délai de quinze jours à compter de ce message.
2. Confirmer par écrit que mon absence à la convocation du 16 décembre 2026 ne constitue pas un refus de me soumettre à l'expertise et qu'aucune décision de clôture ou de forclusion ne sera prise de ce fait.
3. À défaut, si vous maintenez l'expertise à Nouméa, m'indiquer par écrit la prise en charge intégrale des frais de déplacement et d'hébergement.

3. Éléments déjà transmis
Pour mémoire, le certificat médical de consolidation du 23 janvier 2026 ainsi que les trois comptes rendus de radiologie de contrôle (02/11/2022, 29/09/2023 et 05/01/2026) vous ont été adressés le 26 janvier 2026.

Je vous remercie de bien vouloir m'accuser réception de ce message et de me faire connaître votre position par écrit.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

Alva DALERY
Graphiste indépendante
alva.dalery@gmail.com
Tél. : +33 7 69 93 35 78 — +687 80 56 80
[Adresse actuelle dans la région lyonnaise — à compléter]`,
    },
  },
  {
    id: "disp-bnc-indigo",
    title: "Résiliation Forfait INDIGO — Prélèvements indus répétés",
    adversary: "Banque de Nouvelle Calédonie (BNC)",
    referenceNumber: "DALERY/BNC/INDIGO-2026",
    status: "attente_reponse",
    nextDeadline: "17 Décembre 2026 (échéance réponse 35 jours DSP2)",
    actionRequired:
      "Attendre l'échéance du 17/12/2026 (délai DSP2 de 35 jours suite à la réclamation du 12/11 et à l'accusé du 21/11). Ne pas déposer de nouveau courrier avant pour ne pas réinitialiser le délai ; saisir le Médiateur (TSA 31359, 75621 Paris Cedex) à défaut de remboursement des 3 952 F XPF dus. (Dossier local : Résiliation carte BNC)",
    history: [
      {
        date: "09 Janvier 2026",
        action:
          "Demande écrite de résiliation du forfait INDIGO et de restitution de la carte VISA.",
      },
      {
        date: "20 Janvier 2026",
        action:
          "Accord transmis et confirmation de clôture du forfait par la conseillère Alizée ANGIBAUD.",
      },
      {
        date: "03 Février 2026",
        action:
          "1re réclamation après prélèvement indu ; la BNC reconnaît par écrit une « anomalie de nos services informatiques ».",
      },
      {
        date: "05 Mars – 12 Juin 2026",
        action:
          "Poursuite des prélèvements mensuels (1 941 F puis 1 976 F/mois) avec remboursements partiels/tardifs.",
      },
      {
        date: "Octobre – Novembre 2026",
        action:
          "Nouvelles cotisations INDIGO prélevées sans régularisation : solde immédiat restant dû de 3 952 F XPF (anomalie sur 10 mois).",
      },
      {
        date: "12 Novembre 2026",
        action:
          "Envoi de la réclamation formelle à reclamations@bnc.nc (3 pièces jointes) : remboursement de 3 952 F, radiation définitive et attestation.",
      },
      {
        date: "21 Novembre 2026",
        action:
          "Accusé de réception obtenu via le formulaire en ligne BNC (catégorie Moyens de paiement, 4 PJ, sans n° de dossier).",
      },
    ],
    draftedLetter: {
      subject:
        "Saisine du Médiateur — Prélèvements indus persistants sur forfait INDIGO résilié le 20/01/2026 (DALERY/BNC/INDIGO-2026)",
      legalBasis:
        "Directive DSP2 (délai de réponse de 35 jours) & Code monétaire et financier",
      body: `Monsieur le Médiateur,
TSA 31359
75621 Paris Cedex

Objet : Demande de médiation — Banque de Nouvelle Calédonie (BNC) — Prélèvements indus persistants après résiliation du forfait INDIGO

Monsieur le Médiateur,

Je sollicite votre intervention concernant un différend persistant avec la Banque de Nouvelle Calédonie (BNC), agence Aloha Professionnels, relatif au maintien abusif de prélèvements sur un forfait INDIGO pourtant résilié le 20 janvier 2026.

Malgré l'accord de clôture confirmé par écrit le 20 janvier 2026 et la reconnaissance par la banque dès le 3 février 2026 d'une « anomalie de nos services informatiques », les cotisations ont continué à être prélevées pendant 10 mois consécutifs. Les mensualités d'octobre et novembre 2026 restent impayées à mon profit pour un solde immédiat de 3 952 F XPF.

J'ai adressé une réclamation formelle le 12 novembre 2026 à reclamations@bnc.nc puis via le formulaire en ligne le 21 novembre 2026 (accusé de réception obtenu sans attribution de numéro de dossier). Le délai opposable de 35 jours (champ DSP2) étant expiré, je vous demande de bien vouloir intervenir auprès de la BNC afin d'obtenir :
1. Le remboursement intégral des sommes indûment prélevées restant dues (3 952 F XPF, ou tout prélèvement ultérieur).
2. La suppression définitive du forfait INDIGO et la délivrance d'une attestation écrite de radiation.

Vous trouverez ci-joint l'ensemble des échanges, relevés de mouvements et accusés de réception.

Je vous prie d'agréer, Monsieur le Médiateur, l'expression de mes salutations distinguées.

Alva DALERY`,
    },
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

