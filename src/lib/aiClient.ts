export type DeepSeekModel = "deepseek-chat" | "deepseek-reasoner";

export interface ClientAiConfig {
  apiKey?: string;
  model?: DeepSeekModel;
}

const AI_CONFIG_KEY = "assistantPerso.aiConfig.v1";
const SHIP24_KEY = "assistantPerso.ship24Key.v1";

export function loadShip24Key(): string {
  if (typeof window === "undefined") return "";
  try {
    return (window.localStorage.getItem(SHIP24_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function saveShip24Key(key: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = key.trim();
    if (trimmed) window.localStorage.setItem(SHIP24_KEY, trimmed);
    else window.localStorage.removeItem(SHIP24_KEY);
  } catch {
    // ignore storage errors
  }
}

export function getShip24Headers(): Record<string, string> {
  const key = loadShip24Key();
  return key ? { "x-ship24-api-key": key } : {};
}

export function loadAiConfig(): ClientAiConfig {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(AI_CONFIG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ClientAiConfig;
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey.trim() : undefined,
      model:
        parsed.model === "deepseek-reasoner" || parsed.model === "deepseek-chat"
          ? parsed.model
          : "deepseek-chat",
    };
  } catch {
    return {};
  }
}

export function saveAiConfig(config: ClientAiConfig): void {
  if (typeof window === "undefined") return;
  try {
    const next: ClientAiConfig = {
      apiKey: config.apiKey?.trim() || undefined,
      model: config.model || "deepseek-chat",
    };
    window.localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

export function getAiHeaders(): Record<string, string> {
  const config = loadAiConfig();
  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers["x-deepseek-api-key"] = config.apiKey;
  }
  if (config.model) {
    headers["x-deepseek-model"] = config.model;
  }
  return headers;
}

export async function aiPost<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAiHeaders(),
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(payload.error || `Erreur serveur (${response.status}).`);
  }
  return payload as T;
}
