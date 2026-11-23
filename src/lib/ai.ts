export type DeepSeekModel = "deepseek-chat" | "deepseek-reasoner";
export type DeepSeekKeySource = "env" | "header" | "none";

export interface DeepSeekConfig {
  apiKey: string;
  model: DeepSeekModel;
  source: DeepSeekKeySource;
}

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CallDeepSeekOptions {
  request?: Request;
  apiKeyOverride?: string;
  modelOverride?: DeepSeekModel;
  messages: DeepSeekMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export class DeepSeekError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "DeepSeekError";
    this.status = status;
  }
}

const VALID_MODELS = new Set<DeepSeekModel>(["deepseek-chat", "deepseek-reasoner"]);

function normalizeModel(value: string | null | undefined): DeepSeekModel | null {
  if (!value) return null;
  const trimmed = value.trim();
  return VALID_MODELS.has(trimmed as DeepSeekModel) ? (trimmed as DeepSeekModel) : null;
}

/**
 * Résout la clé API DeepSeek et le modèle :
 * 1. Priorité au serveur (`process.env.DEEPSEEK_API_KEY`)
 * 2. Repli sur le header client `x-deepseek-api-key` (clé saisie dans Paramètres)
 */
export function resolveDeepSeekConfig(
  request?: Request,
  apiKeyOverride?: string,
  modelOverride?: DeepSeekModel
): DeepSeekConfig {
  const envKey = (process.env.DEEPSEEK_API_KEY ?? "").trim();
  const headerKey = (request?.headers.get("x-deepseek-api-key") ?? "").trim();
  const overrideKey = (apiKeyOverride ?? "").trim();

  let apiKey = "";
  let source: DeepSeekKeySource = "none";

  if (envKey) {
    apiKey = envKey;
    source = "env";
  } else if (overrideKey) {
    apiKey = overrideKey;
    source = "header";
  } else if (headerKey) {
    apiKey = headerKey;
    source = "header";
  }

  const model =
    modelOverride ||
    normalizeModel(request?.headers.get("x-deepseek-model")) ||
    normalizeModel(process.env.DEEPSEEK_MODEL) ||
    "deepseek-chat";

  return { apiKey, model, source };
}

function describeDeepSeekHttpError(status: number, bodyText: string): string {
  if (status === 401) {
    return "Clé API DeepSeek invalide ou révoquée (erreur 401). Vérifiez votre clé dans Paramètres ou .env.local.";
  }
  if (status === 402) {
    return "Crédits DeepSeek épuisés ou paiement requis (erreur 402). Rechargez votre compte sur platform.deepseek.com.";
  }
  if (status === 429) {
    return "Limite de requêtes DeepSeek atteinte (erreur 429). Réessayez dans quelques secondes.";
  }
  if (status >= 500) {
    return `Serveur DeepSeek temporairement indisponible (${status}). Réessayez dans un instant.`;
  }
  const snippet = bodyText.slice(0, 180).trim();
  return snippet
    ? `Erreur API DeepSeek (${status}) : ${snippet}`
    : `Erreur API DeepSeek (${status}).`;
}

/**
 * Exécute un appel chat/completions vers l'API DeepSeek.
 */
export async function callDeepSeek(options: CallDeepSeekOptions): Promise<{
  content: string;
  model: DeepSeekModel;
  source: DeepSeekKeySource;
}> {
  const config = resolveDeepSeekConfig(
    options.request,
    options.apiKeyOverride,
    options.modelOverride
  );

  if (!config.apiKey) {
    throw new DeepSeekError(
      "Aucune clé API DeepSeek configurée. Ajoutez DEEPSEEK_API_KEY dans .env.local ou saisissez-la dans Paramètres → Clés API.",
      400
    );
  }

  const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com")
    .trim()
    .replace(/\/+$/, "");

  const isReasoner = config.model === "deepseek-reasoner";
  const body: Record<string, unknown> = {
    model: config.model,
    messages: options.messages,
    max_tokens: options.maxTokens ?? 1800,
  };

  if (!isReasoner) {
    body.temperature = options.temperature ?? 0.4;
    if (options.jsonMode) {
      body.response_format = { type: "json_object" };
    }
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(50_000),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new DeepSeekError(
        "Délai dépassé (50s) lors de l'appel à DeepSeek. Réessayez.",
        504
      );
    }
    throw new DeepSeekError(
      "Impossible de joindre api.deepseek.com (vérifiez la connexion réseau).",
      502
    );
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new DeepSeekError(
      describeDeepSeekHttpError(response.status, errText),
      response.status === 401 || response.status === 402 || response.status === 429
        ? response.status
        : 502
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
      };
    }>;
  };

  const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) {
    throw new DeepSeekError("Réponse vide renvoyée par DeepSeek.", 502);
  }

  return { content, model: config.model, source: config.source };
}

function extractJsonObject(raw: string): string {
  const cleaned = raw.trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : cleaned;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return candidate.slice(start, end + 1);
  }
  return candidate;
}

/**
 * Appelle DeepSeek et garantit un objet JSON parsé.
 */
export async function callDeepSeekJson<T>(options: CallDeepSeekOptions): Promise<{
  data: T;
  model: DeepSeekModel;
  source: DeepSeekKeySource;
}> {
  const resolved = resolveDeepSeekConfig(
    options.request,
    options.apiKeyOverride,
    options.modelOverride
  );
  const messages = [...options.messages];
  const lastIdx = messages.length - 1;
  if (lastIdx >= 0 && resolved.model === "deepseek-reasoner") {
    messages[lastIdx] = {
      ...messages[lastIdx],
      content: `${messages[lastIdx].content}\n\nIMPORTANT : Réponds uniquement avec un objet JSON valide sans aucun texte avant ou après.`,
    };
  }

  const result = await callDeepSeek({
    ...options,
    messages,
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(extractJsonObject(result.content)) as T;
    return { data: parsed, model: result.model, source: result.source };
  } catch {
    throw new DeepSeekError(
      "La réponse de DeepSeek n'est pas au format JSON attendu. Réessayez.",
      502
    );
  }
}
