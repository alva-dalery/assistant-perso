import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

function describeWmoCode(code: number): { label: string; rain: boolean } {
  if (code === 0) return { label: "Ciel dégagé", rain: false };
  if (code === 1 || code === 2) return { label: "Éclaircies", rain: false };
  if (code === 3) return { label: "Couvert", rain: false };
  if (code === 45 || code === 48) return { label: "Brouillard", rain: false };
  if (code >= 51 && code <= 67) return { label: "Pluie ou bruine", rain: true };
  if (code >= 71 && code <= 77) return { label: "Neige", rain: true };
  if (code >= 80 && code <= 82) return { label: "Averses", rain: true };
  if (code >= 95) return { label: "Orages", rain: true };
  return { label: "Temps variable", rain: false };
}

function clothingTip(tempC: number, rain: boolean): string {
  const parts: string[] = [];
  if (tempC >= 26) parts.push("Matières légères et respirantes (lin, coton)");
  else if (tempC >= 19) parts.push("Tenue légère avec une surchemise ou gilet pour le soir");
  else if (tempC >= 12) parts.push("Superposition mi-saison (t-shirt + veste ou maille)");
  else parts.push("Couches chaudes recommandées (pull + manteau)");
  if (rain) parts.push("prévoir une pièce imperméable");
  return parts.join(" · ");
}

export async function GET(request: Request) {
  const rawCity = (new URL(request.url).searchParams.get("city") ?? "Paris").trim();
  const cityQuery = rawCity.split("(")[0].split(",")[0].trim() || "Paris";

  try {
    const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geoUrl.searchParams.set("name", cityQuery);
    geoUrl.searchParams.set("count", "1");
    geoUrl.searchParams.set("language", "fr");
    geoUrl.searchParams.set("format", "json");

    const geoRes = await fetch(geoUrl.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!geoRes.ok) {
      return NextResponse.json(
        { error: `Service de géocodage météo indisponible (${geoRes.status}).` },
        { status: 502 }
      );
    }

    const geoData = (await geoRes.json()) as {
      results?: Array<{
        name: string;
        country?: string;
        latitude: number;
        longitude: number;
      }>;
    };

    const place = geoData.results?.[0];
    if (!place) {
      return NextResponse.json(
        { error: `Ville « ${rawCity} » introuvable sur Open-Meteo.` },
        { status: 404 }
      );
    }

    const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
    weatherUrl.searchParams.set("latitude", String(place.latitude));
    weatherUrl.searchParams.set("longitude", String(place.longitude));
    weatherUrl.searchParams.set("current", "temperature_2m,weather_code");
    weatherUrl.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,weather_code");
    weatherUrl.searchParams.set("timezone", "auto");
    weatherUrl.searchParams.set("forecast_days", "3");

    const weatherRes = await fetch(weatherUrl.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!weatherRes.ok) {
      return NextResponse.json(
        { error: `Prévisions météo indisponibles (${weatherRes.status}).` },
        { status: 502 }
      );
    }

    const forecast = (await weatherRes.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
      daily?: {
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        weather_code?: number[];
      };
    };

    const tempC = Math.round(forecast.current?.temperature_2m ?? 18);
    const minC = Math.round(forecast.daily?.temperature_2m_min?.[0] ?? tempC - 3);
    const maxC = Math.round(forecast.daily?.temperature_2m_max?.[0] ?? tempC + 3);
    const code = Number(forecast.current?.weather_code ?? forecast.daily?.weather_code?.[0] ?? 1);
    const { label, rain } = describeWmoCode(code);

    return NextResponse.json(
      {
        city: place.name,
        country: place.country || "",
        tempC,
        minC,
        maxC,
        conditionLabel: label,
        recommendation: clothingTip(tempC, rain),
        source: "open-meteo",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Impossible de récupérer la météo en direct." },
      { status: 502 }
    );
  }
}
