import { NextResponse } from "next/server";
import { callDeepSeekJson, DeepSeekError, resolveDeepSeekConfig } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export type BrainDumpActionType =
  | "add_reminder"
  | "add_shopping"
  | "add_pantry"
  | "add_project_task"
  | "create_project"
  | "add_dispute_note"
  | "add_clothing"
  | "none";

interface BrainDumpRequest {
  text?: string;
  projects?: Array<{ id: string; title: string }>;
  disputes?: Array<{ id: string; title: string; adversary: string }>;
  userProfile?: { name?: string; tdahNotes?: string };
}

interface BrainDumpResult {
  mode: "deepseek" | "local";
  targetModule:
    | "dashboard"
    | "emails"
    | "dressing"
    | "sante"
    | "courses"
    | "sport"
    | "litiges"
    | "projets"
    | "culture";
  moduleLabel: string;
  summary: string;
  suggestion: string;
  actionType: BrainDumpActionType;
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

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function localFallbackClassify(text: string, req: BrainDumpRequest): BrainDumpResult {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (/(acheter|course|courses|supermarché|manque|prendre du|prendre des|avocat|oeuf|œuf|lait|pain)/.test(lower)) {
    return {
      mode: "local",
      targetModule: "courses",
      moduleLabel: "Food & Courses",
      summary: trimmed,
      suggestion: "Ajouté directement à votre liste de courses.",
      actionType: "add_shopping",
      payload: {
        title: trimmed.replace(/^(acheter|penser à acheter|prendre)\s+/i, "").trim() || trimmed,
        category: "Courses",
        priceEst: 3.5,
      },
    };
  }

  if (/(frigo|placard|stock|il reste|j'ai acheté)/.test(lower)) {
    return {
      mode: "local",
      targetModule: "courses",
      moduleLabel: "Frigo & Placards",
      summary: trimmed,
      suggestion: "Ajouté à votre inventaire du frigo.",
      actionType: "add_pantry",
      payload: {
        title: trimmed,
        category: "frais",
        quantity: "1",
      },
    };
  }

  if (/(assurance|banque|litige|remboursement|constat|réclamation|relance|lrar|facture impayée)/.test(lower)) {
    const firstDispute = req.disputes?.[0];
    return {
      mode: "local",
      targetModule: "litiges",
      moduleLabel: "Litiges & Démarches",
      summary: trimmed,
      suggestion: firstDispute
        ? `Note ajoutée au dossier « ${firstDispute.adversary} ».`
        : "Enregistré dans vos rappels prioritaires (module Litiges).",
      actionType: firstDispute ? "add_dispute_note" : "add_reminder",
      payload: {
        title: trimmed,
        disputeId: firstDispute?.id,
        date: todayIso(),
        time: "10:00",
      },
    };
  }

  if (/(projet|bain|nordique|voyage|thaïlande|bricolage|étape|monter|installer)/.test(lower)) {
    const matchedProject =
      req.projects?.find((p) =>
        lower.includes(p.title.toLowerCase().split(" ")[0] || "")
      ) ?? req.projects?.[0];

    if (matchedProject) {
      return {
        mode: "local",
        targetModule: "projets",
        moduleLabel: `Projets (${matchedProject.title})`,
        summary: trimmed,
        suggestion: `Ajouté comme nouvelle micro-étape dans « ${matchedProject.title} ».`,
        actionType: "add_project_task",
        payload: {
          title: trimmed,
          note: "Micro-étape issue du Brain Dump",
          projectId: matchedProject.id,
        },
      };
    }
  }

  if (/(vêtement|chemise|pantalon|veste|robe|pull|chaussure|tenue|valise)/.test(lower)) {
    return {
      mode: "local",
      targetModule: "dressing",
      moduleLabel: "Dressing",
      summary: trimmed,
      suggestion: "Ajouté comme pièce dans votre garde-robe.",
      actionType: "add_clothing",
      payload: {
        title: trimmed,
        category: "haut",
        color: "À préciser",
      },
    };
  }

  if (/(mail|email|répondre|écrire|contacter)/.test(lower)) {
    return {
      mode: "local",
      targetModule: "emails",
      moduleLabel: "Secrétariat & Rappels",
      summary: trimmed,
      suggestion: "Rappel créé pour aujourd'hui afin de traiter cet email sans l'oublier.",
      actionType: "add_reminder",
      payload: {
        title: trimmed,
        date: todayIso(),
        time: "11:00",
        note: "À traiter dans le module Secrétariat",
      },
    };
  }

  if (/(sport|séance|courir|étirement|mobilité|yoga)/.test(lower)) {
    return {
      mode: "local",
      targetModule: "sport",
      moduleLabel: "Sport & Énergie",
      summary: trimmed,
      suggestion: "Rappel sportif ajouté au planning du jour.",
      actionType: "add_reminder",
      payload: {
        title: trimmed,
        date: todayIso(),
        time: "17:00",
        note: "Module Sport",
      },
    };
  }

  return {
    mode: "local",
    targetModule: "dashboard",
    moduleLabel: "Planning du jour",
    summary: trimmed,
    suggestion: "Enregistré comme rappel actionnable pour aujourd'hui.",
    actionType: "add_reminder",
    payload: {
      title: trimmed,
      date: todayIso(),
      time: "14:00",
      note: "Brain Dump",
    },
  };
}

export async function POST(request: Request) {
  let body: BrainDumpRequest;
  try {
    body = (await request.json()) as BrainDumpRequest;
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "Le texte est vide." }, { status: 400 });
  }

  const config = resolveDeepSeekConfig(request);
  if (!config.apiKey) {
    return NextResponse.json(localFallbackClassify(text, body), {
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const projectsSummary = (body.projects ?? [])
      .map((p) => `- id="${p.id}" : ${p.title}`)
      .join("\n");
    const disputesSummary = (body.disputes ?? [])
      .map((d) => `- id="${d.id}" : ${d.title} (${d.adversary})`)
      .join("\n");

    const { data } = await callDeepSeekJson<Omit<BrainDumpResult, "mode">>({
      request,
      messages: [
        {
          role: "system",
          content: `Tu es l'assistant personnel TDAH d'${body.userProfile?.name || "Alva"}.
Tu tries une pensée brute en une action concrète dans le bon module.
Aujourd'hui nous sommes le ${todayIso()}.

Projets existants :
${projectsSummary || "(aucun)"}

Litiges existants :
${disputesSummary || "(aucun)"}

Tu dois répondre UNIQUEMENT en JSON valide respectant exactement ce schéma :
{
  "targetModule": "dashboard" | "emails" | "dressing" | "sante" | "courses" | "sport" | "litiges" | "projets" | "culture",
  "moduleLabel": "Nom lisible en français",
  "summary": "Reformulation courte et claire de la pensée",
  "suggestion": "Explication concise (1 phrase) de l'action qui va être créée",
  "actionType": "add_reminder" | "add_shopping" | "add_pantry" | "add_project_task" | "create_project" | "add_dispute_note" | "add_clothing",
  "payload": {
    "title": "Titre concis et actionnable",
    "note": "Détail optionnel",
    "time": "HH:MM (si rappel)",
    "date": "YYYY-MM-DD (si rappel, par défaut ${todayIso()})",
    "category": "Catégorie adaptée (rayon courses, ou diy/voyage/autre pour projet, ou haut/bas/chaussures/veste/accessoire pour vêtement, ou frais/epicerie/boissons/surgeles pour frigo)",
    "priceEst": 4.5,
    "quantity": "1",
    "projectId": "id exact d'un projet existant si actionType=add_project_task",
    "disputeId": "id exact d'un litige existant si actionType=add_dispute_note",
    "color": "couleur si vêtement"
  }
}`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      temperature: 0.25,
      maxTokens: 500,
    });

    const validActions = new Set<BrainDumpActionType>([
      "add_reminder",
      "add_shopping",
      "add_pantry",
      "add_project_task",
      "create_project",
      "add_dispute_note",
      "add_clothing",
      "none",
    ]);

    const result: BrainDumpResult = {
      mode: "deepseek",
      targetModule: data.targetModule || "dashboard",
      moduleLabel: data.moduleLabel || "Planning du jour",
      summary: data.summary || text,
      suggestion: data.suggestion || "Action prête à être enregistrée.",
      actionType: validActions.has(data.actionType) ? data.actionType : "add_reminder",
      payload: {
        ...(data.payload || {}),
        title: data.payload?.title || text,
        date: data.payload?.date || todayIso(),
      },
    };

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof DeepSeekError && (error.status === 401 || error.status === 402)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(localFallbackClassify(text, body), {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
