import { NextResponse } from "next/server";
import { callDeepSeekJson, DeepSeekError } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ProjectsAiRequest {
  action?: "create_plan" | "breakdown_task";
  title?: string;
  category?: "diy" | "voyage" | "autre";
  summary?: string;
  taskTitle?: string;
  taskDescription?: string;
  projectTitle?: string;
}

interface GeneratedTask {
  title: string;
  description: string;
  durationEst: string;
}

export async function POST(request: Request) {
  let body: ProjectsAiRequest;
  try {
    body = (await request.json()) as ProjectsAiRequest;
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  try {
    if (body.action === "breakdown_task") {
      const taskTitle = (body.taskTitle ?? "").trim();
      if (!taskTitle) {
        return NextResponse.json({ error: "Titre de l'étape manquant." }, { status: 400 });
      }

      const { data, model } = await callDeepSeekJson<{ tasks: GeneratedTask[] }>({
        request,
        messages: [
          {
            role: "system",
            content: `Tu es un coach en organisation TDAH bienveillant et ultra pragmatique.
Découpe une tâche qui semble bloquante en exactement 3 micro-étapes minuscules, concrètes, sans friction (5 à 10 minutes max chacune).
Réponds uniquement en JSON : { "tasks": [ { "title": "...", "description": "...", "durationEst": "5 min" } ] }.`,
          },
          {
            role: "user",
            content: `Projet : ${body.projectTitle || "Personnel"}
Étape bloquante : ${taskTitle}
Détails : ${body.taskDescription || "Aucun détail supplémentaire."}`,
          },
        ],
        temperature: 0.4,
        maxTokens: 700,
      });

      return NextResponse.json(
        { tasks: Array.isArray(data.tasks) ? data.tasks.slice(0, 4) : [], model },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const title = (body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "Titre du projet manquant." }, { status: 400 });
    }

    const { data, model } = await callDeepSeekJson<{
      summary?: string;
      tasks: GeneratedTask[];
    }>({
      request,
      messages: [
        {
          role: "system",
          content: `Tu es un expert en planification anti-overwhelm pour cerveau TDAH.
Génère entre 5 et 7 micro-jalons séquentiels, très concrets, réalistes et motivants (10 à 30 min par jalon).
Réponds uniquement en JSON :
{
  "summary": "Résumé clair en 1 à 2 phrases",
  "tasks": [
    { "title": "Action courte", "description": "Consigne concrète et rassurante", "durationEst": "15 min" }
  ]
}`,
        },
        {
          role: "user",
          content: `Nom du projet : ${title}
Catégorie : ${body.category || "autre"}
Contexte utilisateur : ${body.summary || "Découpage complet depuis zéro."}`,
        },
      ],
      temperature: 0.4,
      maxTokens: 1100,
    });

    return NextResponse.json(
      {
        summary: data.summary || body.summary || "",
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        model,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message =
      error instanceof DeepSeekError ? error.message : "Erreur lors de la génération IA.";
    const status = error instanceof DeepSeekError ? error.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
