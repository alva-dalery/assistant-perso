import { NextResponse } from "next/server";
import { callDeepSeekJson, DeepSeekError } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ClothingInput {
  id: string;
  name: string;
  category: string;
  color: string;
  season: string;
  tags: string[];
  morphoMatch: boolean;
  colorimetryMatch: boolean;
}

interface DressingAiRequest {
  action?: "analyze_item" | "suggest_outfit" | "packing_list";
  itemName?: string;
  itemDescription?: string;
  itemColor?: string;
  morphology?: string;
  colorimetrySeason?: string;
  clothes?: ClothingInput[];
  weather?: string;
  occasion?: string;
  destination?: string;
  days?: number;
  weatherSummary?: string;
}

export async function POST(request: Request) {
  let body: DressingAiRequest;
  try {
    body = (await request.json()) as DressingAiRequest;
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  try {
    if (body.action === "analyze_item") {
      if (!body.itemName?.trim() && !body.itemDescription?.trim()) {
        return NextResponse.json(
          { error: "Indiquez le nom ou la description du vêtement." },
          { status: 400 }
        );
      }

      const { data, model } = await callDeepSeekJson<{
        category: "haut" | "bas" | "chaussures" | "veste" | "accessoire";
        color: string;
        season: "ete" | "hiver" | "mi-saison" | "toutes";
        tags: string[];
        morphoMatch: boolean;
        colorimetryMatch: boolean;
        advice: string;
      }>({
        request,
        messages: [
          {
            role: "system",
            content: `Tu es styliste personnel expert en morphologie et colorimétrie.
Analyse une pièce vestimentaire selon le profil du client.
Réponds uniquement en JSON :
{
  "category": "haut" | "bas" | "chaussures" | "veste" | "accessoire",
  "color": "Couleur normalisée en français",
  "season": "ete" | "hiver" | "mi-saison" | "toutes",
  "tags": ["tag1", "tag2", "tag3"],
  "morphoMatch": true,
  "colorimetryMatch": true,
  "advice": "Conseil concret d'association en 1 phrase"
}`,
          },
          {
            role: "user",
            content: `Profil morphologie : ${body.morphology || "Silhouette V"}
Colorimétrie : ${body.colorimetrySeason || "Automne Chaud"}
Vêtement : ${body.itemName || ""}
Couleur indiquée : ${body.itemColor || "Non précisée"}
Détails : ${body.itemDescription || ""}`,
          },
        ],
        temperature: 0.3,
        maxTokens: 450,
      });

      return NextResponse.json({ ...data, model }, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "packing_list") {
      const destination = (body.destination ?? "").trim();
      if (!destination) {
        return NextResponse.json({ error: "Indiquez une destination." }, { status: 400 });
      }

      const wardrobeLines = (body.clothes ?? [])
        .map((c) => `- ${c.name} (${c.category}, ${c.color}, saison: ${c.season})`)
        .join("\n");

      const { data, model } = await callDeepSeekJson<{
        items: Array<{ label: string; note: string; category: string }>;
      }>({
        request,
        messages: [
          {
            role: "system",
            content: `Tu prépares une valise optimisée sans surcharge mentale (checklist TDAH concise de 8 à 12 items essentiels), en piochant en priorité dans le dressing existant quand c'est pertinent.
Réponds uniquement en JSON :
{
  "items": [
    { "label": "Quantité x Article", "note": "Pourquoi / déjà dans le dressing ou à prévoir", "category": "Vêtements" | "Chaussures" | "Trousse & Santé" | "Tech & Papiers" }
  ]
}`,
          },
          {
            role: "user",
            content: `Destination : ${destination}
Durée : ${body.days || 7} jours
Météo connue / estimée : ${body.weatherSummary || "À adapter au climat local de la destination"}
Dressing disponible :
${wardrobeLines || "(inventaire vide)"}`,
          },
        ],
        temperature: 0.4,
        maxTokens: 1000,
      });

      return NextResponse.json(
        { items: Array.isArray(data.items) ? data.items : [], model },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // suggest_outfit
    const clothes = body.clothes ?? [];
    if (clothes.length === 0) {
      return NextResponse.json(
        { error: "Ajoutez d'abord des vêtements dans votre garde-robe." },
        { status: 400 }
      );
    }

    const catalog = clothes
      .map(
        (c) =>
          `- id="${c.id}" | ${c.name} | cat=${c.category} | couleur=${c.color} | saison=${c.season} | morpho=${c.morphoMatch} | colorimétrie=${c.colorimetryMatch}`
      )
      .join("\n");

    const { data, model } = await callDeepSeekJson<{
      title: string;
      occasion: string;
      temperatureRange: string;
      itemIds: string[];
      whyItWorks: string;
    }>({
      request,
      messages: [
        {
          role: "system",
          content: `Tu es styliste personnel. Compose UNE tenue cohérente en sélectionnant uniquement des \`itemIds\` existants dans le dressing fourni (2 à 5 pièces compatibles entre elles).
Réponds uniquement en JSON :
{
  "title": "Nom de la tenue",
  "occasion": "...",
  "temperatureRange": "ex: 14°C - 18°C",
  "itemIds": ["id1", "id2", "id3"],
  "whyItWorks": "Explication en 1-2 phrases (météo, morpho, colorimétrie)"
}`,
        },
        {
          role: "user",
          content: `Morphologie : ${body.morphology || "Silhouette V"}
Colorimétrie : ${body.colorimetrySeason || "Automne Chaud"}
Météo du jour : ${body.weather || "17°C, temps doux"}
Occasion : ${body.occasion || "Journée active / travail"}

Garde-robe disponible :
${catalog}`,
        },
      ],
      temperature: 0.4,
      maxTokens: 600,
    });

    const validIds = new Set(clothes.map((c) => c.id));
    const filteredIds = Array.isArray(data.itemIds)
      ? data.itemIds.filter((id) => validIds.has(id))
      : [];

    return NextResponse.json(
      {
        title: data.title || "Tenue conseillée du jour",
        occasion: data.occasion || body.occasion || "Quotidien",
        temperatureRange: data.temperatureRange || body.weather || "Tempéré",
        itemIds: filteredIds.length > 0 ? filteredIds : clothes.slice(0, 3).map((c) => c.id),
        whyItWorks: data.whyItWorks || "Association équilibrée selon votre profil.",
        model,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message =
      error instanceof DeepSeekError ? error.message : "Erreur lors de l'analyse stylistique.";
    const status = error instanceof DeepSeekError ? error.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
