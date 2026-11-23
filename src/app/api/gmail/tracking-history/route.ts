import { NextResponse } from "next/server";
import { callDeepSeekJson, DeepSeekError } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface LaPosteEvent {
  date?: string;
  label?: string;
  site?: string;
  status?: string;
}

interface LaPosteTimelineStep {
  id?: number;
  label?: string;
  shortLabel?: string;
  date?: string;
  status?: boolean;
}

interface LaPosteResponse {
  shipment?: {
    idShip?: string;
    product?: string;
    isFinal?: boolean;
    timeline?: LaPosteTimelineStep[];
    event?: LaPosteEvent[];
  };
  returnMessage?: string;
}

function resolveLaPosteKey(request: Request): {
  apiKey: string;
  source: "env" | "header" | "none";
} {
  const envKey = (process.env.LAPOSTE_API_KEY ?? "").trim();
  if (envKey) return { apiKey: envKey, source: "env" };
  const headerKey = (request.headers.get("x-laposte-api-key") ?? "").trim();
  if (headerKey) return { apiKey: headerKey, source: "header" };
  return { apiKey: "", source: "none" };
}

function formatEventDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function GET(request: Request) {
  const { apiKey, source } = resolveLaPosteKey(request);
  return NextResponse.json(
    { configured: Boolean(apiKey), source },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  let body: { trackingNumber?: string; rawText?: string };
  try {
    body = (await request.json()) as { trackingNumber?: string; rawText?: string };
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  // Option 1 (0 € supplémentaire) : extraction structurée par DeepSeek depuis un texte collé
  const rawText = (body.rawText ?? "").trim();
  if (rawText) {
    try {
      const { data } = await callDeepSeekJson<{
        status: string | null;
        carrier: string | null;
        history: string[];
      }>({
        request,
        messages: [
          {
            role: "system",
            content: `Tu extrais l'historique d'un suivi de colis à partir d'un texte copié-collé depuis la page du transporteur ou du marchand.
Réponds uniquement en JSON :
{
  "status": "Statut actuel court (ex: Livré, En transit, En cours de livraison, Pris en charge) ou null",
  "carrier": "Nom du transporteur (ex: La Poste / Colissimo) ou null",
  "history": ["Date — Étape (Lieu si présent)", "... du plus récent au plus ancien"]
}`,
          },
          { role: "user", content: rawText.slice(0, 6000) },
        ],
        temperature: 0.1,
        maxTokens: 700,
      });

      return NextResponse.json(
        {
          ok: true,
          status: data.status || null,
          carrier: data.carrier || null,
          history: Array.isArray(data.history) ? data.history.slice(0, 15) : [],
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    } catch (err) {
      const msg =
        err instanceof DeepSeekError
          ? err.message
          : "Impossible d'analyser ce texte de suivi.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  // Option 2 : API officielle gratuite La Poste Suivi v2 (X-Okapi-Key)
  const { apiKey } = resolveLaPosteKey(request);
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Clé gratuite La Poste non configurée : créez-en une gratuitement (sans carte bancaire) sur developer.laposte.fr et ajoutez-la dans Paramètres → IA & Clés, ou collez directement le texte de suivi ci-dessous.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const trackingNumber = (body.trackingNumber ?? "").trim().replace(/\s+/g, "");
  if (!trackingNumber || trackingNumber.length < 5) {
    return NextResponse.json(
      { error: "Numéro de suivi manquant ou invalide." },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `https://api.laposte.fr/suivi/v2/idships/${encodeURIComponent(trackingNumber)}?lang=fr_FR`,
      {
        method: "GET",
        headers: {
          "X-Okapi-Key": apiKey,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      }
    );

    const payload = (await response.json().catch(() => ({}))) as LaPosteResponse;

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          { error: "Clé La Poste (X-Okapi-Key) invalide ou non abonnée à l'API Suivi v2." },
          { status: 401 }
        );
      }
      if (response.status === 404) {
        return NextResponse.json(
          {
            error:
              payload.returnMessage ||
              "Numéro introuvable chez La Poste / Colissimo (vérifiez le numéro ou le transporteur).",
          },
          { status: 404 }
        );
      }
      return NextResponse.json(
        {
          error:
            payload.returnMessage || `Erreur API La Poste (${response.status}).`,
        },
        { status: 502 }
      );
    }

    const shipment = payload.shipment;
    if (!shipment) {
      return NextResponse.json({
        ok: true,
        status: null,
        carrier: "La Poste / Colissimo",
        history: [],
        note: "Colis reconnu, aucune étape disponible pour le moment.",
      });
    }

    const events = Array.isArray(shipment.event) ? shipment.event : [];
    const sortedEvents = [...events].sort((a, b) =>
      (b.date ?? "").localeCompare(a.date ?? "")
    );

    const history = sortedEvents
      .map((ev) => {
        const when = formatEventDate(ev.date);
        const label = (ev.label ?? "").trim();
        const site = ev.site?.trim() ? ` (${ev.site.trim()})` : "";
        return when ? `${when} — ${label}${site}` : `${label}${site}`;
      })
      .filter(Boolean)
      .slice(0, 15);

    const completedSteps = (shipment.timeline ?? []).filter((step) => step.status);
    const latestStep = completedSteps[completedSteps.length - 1];
    const status = latestStep?.shortLabel?.trim() || latestStep?.label?.trim() || null;

    const product = (shipment.product ?? "").toLowerCase();
    const carrier = product.includes("chronopost")
      ? "Chronopost"
      : "La Poste / Colissimo";

    return NextResponse.json(
      {
        ok: true,
        status,
        carrier,
        history,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Impossible de joindre api.laposte.fr pour le moment." },
      { status: 502 }
    );
  }
}
