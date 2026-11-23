import { NextResponse } from "next/server";
import { extractTrackingFromExternalPage } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const BLOCKED_HOST_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?)$/i;

function isSafePublicUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    if (!host || host.endsWith(".local") || BLOCKED_HOST_RE.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const targetUrl = (body.url ?? "").trim();
  if (!targetUrl || !isSafePublicUrl(targetUrl)) {
    return NextResponse.json(
      { error: "Lien de suivi invalide ou non autorisé." },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(targetUrl, {
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
    });

    const finalUrl = response.url || targetUrl;
    const rawBody = await response.text().catch(() => "");
    const limited = rawBody.slice(0, 250_000);

    // Nettoyer les balises HTML pour faciliter la détection textuelle tout en gardant les attributs/JSON
    const stripped = limited
      .replace(/<script\b[^>]*>/gi, "\n")
      .replace(/<\/script>/gi, "\n")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");

    const extracted = extractTrackingFromExternalPage(`${limited}\n${stripped}`, finalUrl);

    if (extracted.numbers.length === 0) {
      return NextResponse.json(
        {
          resolved: false,
          numbers: [],
          carrier: extracted.carrier,
          status: extracted.status,
          finalUrl,
          directCarrierUrl: null,
          note: "La page du transporteur charge le numéro dynamiquement en JavaScript ou bloque l'accès serveur : ouvrez le lien puis collez le numéro Colissimo ci-dessous.",
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        resolved: true,
        ...extracted,
        finalUrl,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      {
        resolved: false,
        numbers: [],
        carrier: null,
        status: null,
        finalUrl: targetUrl,
        directCarrierUrl: null,
        note: "Impossible de lire le portail de suivi automatiquement. Vous pouvez saisir le numéro Colissimo manuellement ci-dessous.",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }
}
