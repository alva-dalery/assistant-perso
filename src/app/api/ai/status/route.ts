import { NextResponse } from "next/server";
import { callDeepSeek, DeepSeekError, resolveDeepSeekConfig } from "@/lib/ai";
import type { DeepSeekModel } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const config = resolveDeepSeekConfig(request);
  return NextResponse.json(
    {
      configured: Boolean(config.apiKey),
      source: config.source,
      model: config.model,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  let body: { apiKey?: string; model?: DeepSeekModel } = {};
  try {
    body = (await request.json()) as { apiKey?: string; model?: DeepSeekModel };
  } catch {
    body = {};
  }

  const config = resolveDeepSeekConfig(request, body.apiKey, body.model);
  if (!config.apiKey) {
    return NextResponse.json(
      {
        ok: false,
        model: config.model,
        source: config.source,
        error:
          "Aucune clé DeepSeek renseignée. Collez votre clé API ou configurez DEEPSEEK_API_KEY dans .env.local.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const startedAt = Date.now();
  try {
    const res = await callDeepSeek({
      request,
      apiKeyOverride: body.apiKey,
      modelOverride: body.model,
      messages: [
        { role: "system", content: "Réponds simplement par OK." },
        { role: "user", content: "Test de connexion." },
      ],
      maxTokens: 16,
      temperature: 0,
    });

    return NextResponse.json(
      {
        ok: true,
        model: res.model,
        source: res.source,
        latencyMs: Date.now() - startedAt,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message =
      error instanceof DeepSeekError
        ? error.message
        : "Impossible de contacter l'API DeepSeek.";
    const status = error instanceof DeepSeekError ? error.status : 502;
    return NextResponse.json(
      {
        ok: false,
        model: config.model,
        source: config.source,
        latencyMs: Date.now() - startedAt,
        error: message,
      },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
