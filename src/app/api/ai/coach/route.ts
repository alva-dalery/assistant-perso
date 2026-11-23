import { NextResponse } from "next/server";
import { callDeepSeekJson, DeepSeekError } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface CoachRequest {
  action?: "regulate" | "generate_workout";
  mood?: string;
  message?: string;
  health?: {
    sleepScore?: number;
    sleepHours?: number;
    restingHr?: number;
    hrv?: number;
    steps?: number;
  };
  energyLevel?: "low" | "medium" | "high";
  tdahNotes?: string;
  durationMinutes?: number;
  focus?: string;
  constraints?: string;
}

export async function POST(request: Request) {
  let body: CoachRequest;
  try {
    body = (await request.json()) as CoachRequest;
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  try {
    if (body.action === "generate_workout") {
      const duration = Math.max(5, Math.min(60, Number(body.durationMinutes) || 15));
      const { data, model } = await callDeepSeekJson<{
        title: string;
        durationMinutes: number;
        energyLevelRequired: "low" | "medium" | "high";
        focus: string;
        exercises: Array<{ name: string; durationOrReps: string; tip: string }>;
      }>({
        request,
        messages: [
          {
            role: "system",
            content: `Tu es coach sportif adapté aux cerveaux TDAH (zéro culpabilité, démarrage doux, progression fluide).
Crée une séance de 4 à 6 exercices adaptés au niveau d'énergie demandé.
IMPORTANT pour le lecteur chronométré : formate chaque \`durationOrReps\` exactement comme "45 secondes", "60 secondes", "2 minutes" ou "12 répétitions".
Réponds uniquement en JSON :
{
  "title": "Nom motivant de la séance",
  "durationMinutes": ${duration},
  "energyLevelRequired": "${body.energyLevel || "medium"}",
  "focus": "Focus physiologique / mental",
  "exercises": [
    { "name": "Nom de l'exercice", "durationOrReps": "45 secondes", "tip": "Conseil posture / respiration" }
  ]
}`,
          },
          {
            role: "user",
            content: `Niveau d'énergie : ${body.energyLevel || "medium"}
Durée souhaitée : ${duration} minutes
Objectif : ${body.focus || "Mobilité, énergie douce et clarté mentale"}
Contraintes / zone sensible : ${body.constraints || "Aucune contrainte particulière, sans matériel lourd"}`,
          },
        ],
        temperature: 0.5,
        maxTokens: 1000,
      });

      return NextResponse.json(
        {
          workout: {
            id: `w-ai-${Date.now()}`,
            title: data.title || "Séance personnalisée IA",
            durationMinutes: Number(data.durationMinutes) || duration,
            energyLevelRequired: body.energyLevel || "medium",
            focus: data.focus || body.focus || "Énergie & mobilité",
            exercises: Array.isArray(data.exercises) ? data.exercises.slice(0, 8) : [],
          },
          model,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // action === "regulate"
    const { data, model } = await callDeepSeekJson<{
      title: string;
      validation: string;
      immediateAction: string;
      nextStep: string;
    }>({
      request,
      messages: [
        {
          role: "system",
          content: `Tu es un compagnon de régulation émotionnelle et cognitive spécialisé TDAH / TAG (trouble anxieux généralisé).
Tu parles avec chaleur, calme, lucidité scientifique et zéro moralisation. Sois très concret et court (adapté à un cerveau surchargé).
Note importante : tu n'es pas médecin et ne donnes pas de diagnostic médical.
Réponds uniquement en JSON :
{
  "title": "Titre court rassurant",
  "validation": "1-2 phrases de déculpabilisation / lecture physiologique",
  "immediateAction": "1 micro-action physique ou respiratoire de 60 à 120 secondes à faire tout de suite",
  "nextStep": "1 minuscule étape concrète ensuite pour retrouver du mouvement"
}`,
        },
        {
          role: "user",
          content: `État sélectionné : ${body.mood || "libre"}
Ce que je ressens / ce qui me bloque : ${body.message || "Besoin de régulation immédiate"}
Énergie du jour : ${body.energyLevel || "medium"}
Biomarqueurs saisis : sommeil ${body.health?.sleepScore ?? "?"}/100 (${body.health?.sleepHours ?? "?"}h), pouls ${body.health?.restingHr ?? "?"} bpm, VFC ${body.health?.hrv ?? "?"} ms, pas ${body.health?.steps ?? "?"}
Préférences TDAH : ${body.tdahNotes || "Micro-actions sans pression"}`,
        },
      ],
      temperature: 0.45,
      maxTokens: 650,
    });

    return NextResponse.json(
      {
        advice: {
          title: data.title || "Point d'ancrage immédiat",
          validation: data.validation || "",
          immediateAction: data.immediateAction || "",
          nextStep: data.nextStep || "",
        },
        model,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message =
      error instanceof DeepSeekError ? error.message : "Erreur lors de l'appel au coach IA.";
    const status = error instanceof DeepSeekError ? error.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
