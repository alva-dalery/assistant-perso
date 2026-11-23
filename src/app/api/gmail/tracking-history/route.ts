import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

interface Ship24Event {
  status?: string;
  location?: string | null;
  occurrenceDatetime?: string;
  courierCode?: string;
  statusMilestone?: string;
}

interface Ship24Tracking {
  shipment?: {
    statusMilestone?: string;
  };
  events?: Ship24Event[];
}

const MILESTONE_FR: Record<string, string> = {
  delivered: "Livré",
  out_for_delivery: "En cours de livraison",
  transit: "En transit",
  in_transit: "En transit",
  pick_up: "Pris en charge",
  info_received: "Information reçue",
  exception: "Anomalie signalée",
  undelivered: "Échec de livraison",
};

function resolveShip24Key(request: Request): {
  apiKey: string;
  source: "env" | "header" | "none";
} {
  const envKey = (process.env.SHIP24_API_KEY ?? "").trim();
  if (envKey) return { apiKey: envKey, source: "env" };
  const headerKey = (request.headers.get("x-ship24-api-key") ?? "").trim();
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
  const { apiKey, source } = resolveShip24Key(request);
  return NextResponse.json(
    { configured: Boolean(apiKey), source },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const { apiKey } = resolveShip24Key(request);
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Suivi en direct non configuré : ajoutez votre clé API Ship24 (gratuite 100 colis/mois sur ship24.com) dans Paramètres → IA & Clés ou SHIP24_API_KEY sur Vercel.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  let body: { trackingNumber?: string };
  try {
    body = (await request.json()) as { trackingNumber?: string };
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const trackingNumber = (body.trackingNumber ?? "").trim();
  if (!trackingNumber || trackingNumber.length < 5) {
    return NextResponse.json(
      { error: "Numéro de suivi manquant ou invalide." },
      { status: 400 }
    );
  }

  const endpoints = [
    "https://api.ship24.com/public/v1/trackers/track",
    "https://api.ship24.com/v1/trackers/track",
  ];

  let lastStatus = 502;
  let lastErrorText = "";

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ trackingNumber }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });

      if (response.status === 404) {
        lastStatus = 404;
        continue;
      }

      if (!response.ok) {
        lastStatus = response.status;
        lastErrorText = await response.text().catch(() => "");
        break;
      }

      const payload = (await response.json()) as {
        data?: { trackings?: Ship24Tracking[] };
        trackings?: Ship24Tracking[];
      };

      const tracking =
        payload.data?.trackings?.[0] ?? payload.trackings?.[0] ?? null;

      if (!tracking) {
        return NextResponse.json(
          {
            ok: true,
            status: null,
            carrier: null,
            history: [],
            note: "Colis enregistré sur Ship24, aucune étape remontée par le transporteur pour le moment.",
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }

      const rawEvents = Array.isArray(tracking.events) ? tracking.events : [];
      const sortedEvents = [...rawEvents].sort((a, b) =>
        (b.occurrenceDatetime ?? "").localeCompare(a.occurrenceDatetime ?? "")
      );

      const history = sortedEvents
        .map((ev) => {
          const when = formatEventDate(ev.occurrenceDatetime);
          const label = ev.status?.trim() || MILESTONE_FR[ev.statusMilestone ?? ""] || "Mise à jour";
          const loc = ev.location?.trim() ? ` (${ev.location.trim()})` : "";
          return when ? `${when} — ${label}${loc}` : `${label}${loc}`;
        })
        .slice(0, 15);

      const milestone =
        tracking.shipment?.statusMilestone || sortedEvents[0]?.statusMilestone || "";
      const status = MILESTONE_FR[milestone] ?? null;
      const courierCode = sortedEvents[0]?.courierCode?.trim() || null;

      return NextResponse.json(
        {
          ok: true,
          status,
          carrier: courierCode,
          history,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    } catch {
      lastStatus = 502;
    }
  }

  if (lastStatus === 401 || lastStatus === 403) {
    return NextResponse.json(
      { error: "Clé API Ship24 invalide ou expirée." },
      { status: 401 }
    );
  }
  if (lastStatus === 402 || lastStatus === 429) {
    return NextResponse.json(
      { error: "Quota Ship24 atteint pour ce mois." },
      { status: lastStatus }
    );
  }

  return NextResponse.json(
    {
      error: lastErrorText
        ? `Erreur Ship24 (${lastStatus}) : ${lastErrorText.slice(0, 160)}`
        : `Impossible de récupérer l'historique Ship24 (${lastStatus}).`,
    },
    { status: 502 }
  );
}
