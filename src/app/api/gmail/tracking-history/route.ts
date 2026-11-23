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

interface ParcelLabCheckpoint {
  timestamp?: string;
  status_text?: string;
  status_details?: string;
  location?: string;
}

interface ParcelLabResponse {
  header?: {
    tracking_number?: string;
    courier?: {
      name?: string;
      prettyname?: string;
      trackingurl?: string;
    };
    last_delivery_status?: {
      status?: string;
      status_text?: string;
    };
  };
  body?: ParcelLabCheckpoint[];
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

function guessParcelLabCouriers(trackingNumber: string, carrierHint?: string): string[] {
  const hint = (carrierHint ?? "").toLowerCase();
  if (hint.includes("colissimo") || hint.includes("poste") || /^[689][A-Z]/.test(trackingNumber)) {
    return ["colissimo", "laposte"];
  }
  if (hint.includes("chronopost")) return ["chronopost"];
  if (hint.includes("dhl")) return ["dhl-germany", "dhl-express"];
  if (hint.includes("ups") || /^1Z/i.test(trackingNumber)) return ["ups"];
  if (hint.includes("dpd")) return ["dpd-fr", "dpd-de"];
  if (hint.includes("gls")) return ["gls"];
  return ["colissimo", "laposte", "dhl-germany", "dpd-fr", "ups"];
}

async function queryParcelLab(
  trackingNumber: string,
  carrierHint?: string
): Promise<{
  status: string | null;
  carrier: string | null;
  history: string[];
} | null> {
  const couriers = guessParcelLabCouriers(trackingNumber, carrierHint);
  for (const courier of couriers) {
    try {
      const url = new URL("https://api.parcellab.com/v2/checkpoints");
      url.searchParams.set("tno", trackingNumber);
      url.searchParams.set("courier", courier);
      url.searchParams.set("lang", "fr");

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(6_000),
      });
      if (!res.ok) continue;
      const data = (await res.json().catch(() => null)) as ParcelLabResponse | null;
      if (!data || !Array.isArray(data.body) || data.body.length === 0) continue;

      const sorted = [...data.body].sort((a, b) =>
        (b.timestamp ?? "").localeCompare(a.timestamp ?? "")
      );
      const history = sorted
        .map((cp) => {
          const when = formatEventDate(cp.timestamp);
          const text = (cp.status_details || cp.status_text || "").trim();
          const loc = cp.location?.trim() ? ` (${cp.location.trim()})` : "";
          return when ? `${when} — ${text}${loc}` : `${text}${loc}`;
        })
        .filter(Boolean)
        .slice(0, 15);

      return {
        status: data.header?.last_delivery_status?.status_text?.trim() || null,
        carrier: data.header?.courier?.prettyname?.trim() || data.header?.courier?.name?.trim() || null,
        history,
      };
    } catch {
      // try next courier
    }
  }
  return null;
}

export async function GET(request: Request) {
  const { apiKey, source } = resolveLaPosteKey(request);
  return NextResponse.json(
    { configured: Boolean(apiKey), source },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  let body: { trackingNumber?: string; carrier?: string; rawText?: string };
  try {
    body = (await request.json()) as {
      trackingNumber?: string;
      carrier?: string;
      rawText?: string;
    };
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

  const trackingNumber = (body.trackingNumber ?? "").trim().replace(/\s+/g, "");
  if (!trackingNumber || trackingNumber.length < 5) {
    return NextResponse.json(
      { error: "Numéro de suivi manquant ou invalide." },
      { status: 400 }
    );
  }

  // Option 2 : API La Poste Suivi v2 si une clé est configurée
  const { apiKey } = resolveLaPosteKey(request);
  if (apiKey) {
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

      if (response.ok && payload.shipment) {
        const events = Array.isArray(payload.shipment.event) ? payload.shipment.event : [];
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

        const completedSteps = (payload.shipment.timeline ?? []).filter((step) => step.status);
        const latestStep = completedSteps[completedSteps.length - 1];
        const status = latestStep?.shortLabel?.trim() || latestStep?.label?.trim() || null;

        const product = (payload.shipment.product ?? "").toLowerCase();
        const carrier = product.includes("chronopost")
          ? "Chronopost"
          : "La Poste / Colissimo";

        return NextResponse.json(
          { ok: true, status, carrier, history },
          { headers: { "Cache-Control": "no-store" } }
        );
      }
    } catch {
      // fallback sur parcelLab sans clé
    }
  }

  // Option 3 (sans clé, sans inscription) : tentative via parcelLab v2 checkpoints
  const parcelLabResult = await queryParcelLab(trackingNumber, body.carrier);
  if (parcelLabResult && parcelLabResult.history.length > 0) {
    return NextResponse.json(
      { ok: true, ...parcelLabResult },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      status: null,
      carrier: null,
      history: [],
      note: "Aucun historique automatique disponible sans compte pro. Utilisez « + Coller le texte de la page de suivi » juste en dessous : DeepSeek extraira les étapes gratuitement en 1 clic.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
