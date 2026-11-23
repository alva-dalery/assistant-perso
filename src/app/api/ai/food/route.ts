import { NextResponse } from "next/server";
import { callDeepSeekJson, DeepSeekError } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface FoodAiRequest {
  action?: "parse_pantry" | "generate_recipes";
  text?: string;
  pantry?: Array<{ name: string; quantity?: string; category?: string }>;
  energyLevel?: "low" | "medium" | "high";
  craving?: string;
}

export async function POST(request: Request) {
  let body: FoodAiRequest;
  try {
    body = (await request.json()) as FoodAiRequest;
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  try {
    if (body.action === "parse_pantry") {
      const text = (body.text ?? "").trim();
      if (!text) {
        return NextResponse.json({ error: "Décrivez ce que vous avez dans votre frigo." }, { status: 400 });
      }

      const { data, model } = await callDeepSeekJson<{
        items: Array<{
          name: string;
          category: "frais" | "epicerie" | "boissons" | "surgeles";
          quantity: string;
          yukaScore: number;
          yukaVerdict: "Excellent" | "Bon" | "Médiocre" | "Mauvais";
        }>;
      }>({
        request,
        messages: [
          {
            role: "system",
            content: `Tu extrais une liste d'aliments depuis un texte libre (contenu du frigo ou retour de courses).
Réponds uniquement en JSON :
{
  "items": [
    {
      "name": "Nom propre en français",
      "category": "frais" | "epicerie" | "boissons" | "surgeles",
      "quantity": "Quantité lisible (ex: 6 pièces, 500g, 1 bouteille)",
      "yukaScore": 80,
      "yukaVerdict": "Excellent" | "Bon" | "Médiocre" | "Mauvais"
    }
  ]
}`,
          },
          { role: "user", content: text },
        ],
        temperature: 0.2,
        maxTokens: 900,
      });

      const items = Array.isArray(data.items)
        ? data.items.map((item) => ({
            name: item.name || "Aliment",
            category:
              item.category === "epicerie" ||
              item.category === "boissons" ||
              item.category === "surgeles"
                ? item.category
                : "frais",
            quantity: item.quantity || "1",
            yukaScore: Math.max(0, Math.min(100, Number(item.yukaScore) || 75)),
            yukaVerdict: item.yukaVerdict || "Bon",
          }))
        : [];

      return NextResponse.json({ items, model }, { headers: { "Cache-Control": "no-store" } });
    }

    const pantry = body.pantry ?? [];
    if (pantry.length === 0) {
      return NextResponse.json(
        { error: "Ajoutez au moins un aliment dans votre frigo pour générer des recettes." },
        { status: 400 }
      );
    }

    const pantryList = pantry.map((p) => `- ${p.name} (${p.quantity || "1"})`).join("\n");
    const energyDesc =
      body.energyLevel === "low"
        ? "Énergie basse : recettes ultra simples, moins de 15 minutes, 1 seule poêle/bol, zéro vaisselle complexe"
        : body.energyLevel === "high"
          ? "Énergie haute : recettes gourmandes et complètes jusqu'à 30 minutes"
          : "Énergie modérée : recettes équilibrées de 15 à 20 minutes";

    const { data, model } = await callDeepSeekJson<{
      recipes: Array<{
        title: string;
        timeMinutes: number;
        brainBenefit: string;
        costEstimatedEur: number;
        ingredients: Array<{ name: string; inStock: boolean; yukaScore?: number }>;
        instructions: string[];
      }>;
    }>({
      request,
      messages: [
        {
          role: "system",
          content: `Tu es nutritionniste spécialisé en santé cérébrale / TDAH (dopamine, oméga-3, index glycémique bas).
Propose exactement 2 recettes saines, réalistes et anti-coup-de-barre en utilisant un maximum d'ingrédients déjà en stock.
Marque \`inStock: true\` uniquement pour les ingrédients présents dans le frigo de l'utilisateur, \`false\` pour ce qu'il faut acheter (en limitant les ingrédients manquants).
Réponds uniquement en JSON :
{
  "recipes": [
    {
      "title": "...",
      "timeMinutes": 15,
      "brainBenefit": "...",
      "costEstimatedEur": 4.5,
      "ingredients": [{ "name": "...", "inStock": true, "yukaScore": 90 }],
      "instructions": ["Étape 1...", "Étape 2..."]
    }
  ]
}`,
        },
        {
          role: "user",
          content: `Inventaire actuel du frigo/placards :
${pantryList}

Profil d'énergie : ${energyDesc}
Envie particulière : ${body.craving || "Aucune préférence, surprends-moi sainement"}`,
        },
      ],
      temperature: 0.5,
      maxTokens: 1400,
    });

    const recipes = Array.isArray(data.recipes) ? data.recipes.slice(0, 3) : [];
    return NextResponse.json({ recipes, model }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message =
      error instanceof DeepSeekError ? error.message : "Erreur lors de l'appel à DeepSeek Food.";
    const status = error instanceof DeepSeekError ? error.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
