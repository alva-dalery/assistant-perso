import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_fr?: string;
  brands?: string | string[];
  nutriscore_grade?: string;
  nova_group?: number;
  additives_n?: number;
  additives_tags?: string[];
  labels_tags?: string[];
  image_front_small_url?: string;
  categories?: string;
}

export interface ScannedFoodProduct {
  code: string;
  name: string;
  brand: string;
  score: number;
  verdict: "Excellent" | "Bon" | "Médiocre" | "Mauvais";
  nutriscore: string | null;
  novaGroup: number | null;
  additivesCount: number;
  isBio: boolean;
  additivesLabel: string;
  imageUrl: string | null;
  suggestedCategory: "frais" | "epicerie" | "boissons" | "surgeles";
}

function computeHealthScore(p: OffProduct): {
  score: number;
  verdict: ScannedFoodProduct["verdict"];
  isBio: boolean;
} {
  const grade = (p.nutriscore_grade ?? "").toLowerCase();
  const baseByNutri: Record<string, number> = {
    a: 90,
    b: 76,
    c: 58,
    d: 36,
    e: 18,
  };
  let score = baseByNutri[grade] ?? 62;

  const nova = Number(p.nova_group);
  if (nova === 1) score += 6;
  else if (nova === 3) score -= 4;
  else if (nova === 4) score -= 18;

  const additivesCount =
    typeof p.additives_n === "number"
      ? p.additives_n
      : Array.isArray(p.additives_tags)
        ? p.additives_tags.length
        : 0;
  score -= Math.min(24, additivesCount * 5);

  const labels = (p.labels_tags ?? []).join(" ").toLowerCase();
  const isBio = labels.includes("organic") || labels.includes("bio") || labels.includes("ab-agriculture");
  if (isBio) score += 6;

  score = Math.max(5, Math.min(100, Math.round(score)));
  const verdict: ScannedFoodProduct["verdict"] =
    score >= 75 ? "Excellent" : score >= 55 ? "Bon" : score >= 35 ? "Médiocre" : "Mauvais";

  return { score, verdict, isBio };
}

function guessCategory(categories?: string): ScannedFoodProduct["suggestedCategory"] {
  const lower = (categories ?? "").toLowerCase();
  if (/(boisson|beverage|jus|lait|eau|thé|café|infusion)/.test(lower)) return "boissons";
  if (/(surgel|frozen|glace)/.test(lower)) return "surgeles";
  if (/(frais|yaourt|fromage|légume|fruit|oeuf|viande|poisson|salade)/.test(lower)) return "frais";
  return "epicerie";
}

function formatProduct(p: OffProduct): ScannedFoodProduct | null {
  const name = (p.product_name_fr || p.product_name || "").trim();
  if (!name) return null;

  const { score, verdict, isBio } = computeHealthScore(p);
  const additivesCount =
    typeof p.additives_n === "number"
      ? p.additives_n
      : Array.isArray(p.additives_tags)
        ? p.additives_tags.length
        : 0;
  const nova = Number(p.nova_group) || null;
  const nutriscore =
    p.nutriscore_grade && /^[a-e]$/i.test(p.nutriscore_grade)
      ? p.nutriscore_grade.toUpperCase()
      : null;

  const parts: string[] = [];
  parts.push(
    additivesCount === 0
      ? "0 additif détecté"
      : `${additivesCount} additif${additivesCount > 1 ? "s" : ""}`
  );
  if (nova) parts.push(`NOVA ${nova}`);
  if (nutriscore) parts.push(`Nutri-Score ${nutriscore}`);
  if (isBio) parts.push("Bio");

  const brandName = Array.isArray(p.brands)
    ? (p.brands[0] || "Marque non précisée").trim()
    : ((p.brands || "Marque non précisée").split(",")[0] || "Marque non précisée").trim();

  return {
    code: String(p.code || name),
    name,
    brand: brandName,
    score,
    verdict,
    nutriscore,
    novaGroup: nova,
    additivesCount,
    isBio,
    additivesLabel: parts.join(" · "),
    imageUrl: p.image_front_small_url || null,
    suggestedCategory: guessCategory(p.categories),
  };
}

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json(
      { error: "Saisissez un code-barres ou un nom de produit." },
      { status: 400 }
    );
  }

  const headers = {
    "User-Agent": "AssistantPerso/1.0 (https://github.com/alva-dalery/assistant-perso)",
    Accept: "application/json",
  };

  try {
    // Code-barres numérique (EAN-8 à EAN-14)
    if (/^\d{8,14}$/.test(q)) {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(q)}.json?fields=code,product_name,product_name_fr,brands,nutriscore_grade,nova_group,additives_n,additives_tags,labels_tags,image_front_small_url,categories`,
        { headers, cache: "no-store", signal: AbortSignal.timeout(12_000) }
      );
      if (!res.ok) {
        return NextResponse.json(
          { error: `Open Food Facts indisponible (${res.status}).` },
          { status: 502 }
        );
      }
      const data = (await res.json()) as { status?: number; product?: OffProduct };
      const formatted = data.status === 1 && data.product ? formatProduct(data.product) : null;
      return NextResponse.json(
        { products: formatted ? [formatted] : [], source: "openfoodfacts" },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // Recherche textuelle (Search-a-licious Open Food Facts)
    const url = new URL("https://search.openfoodfacts.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("page_size", "6");
    url.searchParams.set("langs", "fr");
    url.searchParams.set(
      "fields",
      "code,product_name,product_name_fr,brands,nutriscore_grade,nova_group,additives_n,additives_tags,labels_tags,image_front_small_url,categories"
    );

    const res = await fetch(url.toString(), {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(14_000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Open Food Facts indisponible (${res.status}).` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as { hits?: OffProduct[] };
    const products = (data.hits ?? [])
      .map(formatProduct)
      .filter((item): item is ScannedFoodProduct => item !== null)
      .slice(0, 5);

    return NextResponse.json(
      { products, source: "openfoodfacts" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Impossible de joindre Open Food Facts pour le moment." },
      { status: 502 }
    );
  }
}
