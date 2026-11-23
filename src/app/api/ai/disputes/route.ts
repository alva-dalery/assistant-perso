import { NextResponse } from "next/server";
import { callDeepSeekJson, DeepSeekError } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface DisputeAiRequest {
  title?: string;
  adversary?: string;
  referenceNumber?: string;
  facts?: string;
  goal?: string;
  history?: Array<{ date: string; action: string }>;
  userName?: string;
  tone?: "amiable" | "mise_en_demeure" | "mediateur";
}

export async function POST(request: Request) {
  let body: DisputeAiRequest;
  try {
    body = (await request.json()) as DisputeAiRequest;
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  if (!body.title?.trim() || !body.adversary?.trim()) {
    return NextResponse.json(
      { error: "Le titre du dossier et la partie adverse sont requis." },
      { status: 400 }
    );
  }

  const toneLabel =
    body.tone === "mise_en_demeure"
      ? "Mise en demeure formelle (LRAR, ton ferme et juridique avec délai de 8 jours)"
      : body.tone === "mediateur"
        ? "Saisine du médiateur compétent (structuré, factuel, récapitulatif chronologique)"
        : "Relance amiable ferme et courtoise (avant contentieux)";

  const historyLines = (body.history ?? [])
    .map((h) => `- ${h.date} : ${h.action}`)
    .join("\n");

  try {
    const { data, model } = await callDeepSeekJson<{
      subject: string;
      body: string;
      legalBasis: string;
      nextRecommendedAction: string;
    }>({
      request,
      messages: [
        {
          role: "system",
          content: `Tu es juriste français spécialisé en droit de la consommation, assurances et banque.
Rédige un courrier professionnel prêt à envoyer (avec champs [À COMPLÉTER] uniquement si une info personnelle comme l'adresse postale manque).
Ne fabrique jamais de numéro d'article de loi incertain : cite uniquement les principes et articles exacts applicables en droit français (Code civil, Code de la consommation, Code des assurances).
Réponds uniquement en JSON :
{
  "subject": "Objet précis du courrier",
  "body": "Corps complet du courrier avec en-tête, faits, demande chiffrée/datée, formule de politesse et signature",
  "legalBasis": "Articles ou fondements juridiques pertinents en une ligne",
  "nextRecommendedAction": "Prochaine action concrète recommandée à l'utilisateur"
}`,
        },
        {
          role: "user",
          content: `Expéditeur : ${body.userName || "Alva DALERY"}
Dossier : ${body.title}
Partie adverse : ${body.adversary}
Référence dossier : ${body.referenceNumber || "Non communiquée"}
Ton souhaité : ${toneLabel}
Objectif / précisions : ${body.goal || "Obtenir résolution rapide et remboursement/réponse écrite."}
Faits / contexte : ${body.facts || "Voir l'historique ci-dessous."}
Historique :
${historyLines || "(aucun historique)"}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 1600,
    });

    return NextResponse.json(
      {
        subject: data.subject || `Réclamation - ${body.title}`,
        body: data.body || "",
        legalBasis: data.legalBasis || "Droit français des obligations et de la consommation",
        nextRecommendedAction:
          data.nextRecommendedAction || "Relire, compléter vos coordonnées puis envoyer.",
        model,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message =
      error instanceof DeepSeekError ? error.message : "Erreur lors de la rédaction du courrier.";
    const status = error instanceof DeepSeekError ? error.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
