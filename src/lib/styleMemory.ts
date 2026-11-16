/**
 * Mémoire de style, stockée dans le navigateur (localStorage).
 *
 * Chaque réponse réellement envoyée ou enregistrée en brouillon est conservée
 * comme exemple. On en déduit ensuite un profil simple (salutation, présence de
 * la phrase de clôture, bloc de signature) envoyé au serveur pour que les
 * propositions suivantes se rapprochent de votre plume.
 *
 * Limite assumée : la mémoire vit sur cet appareil/navigateur. Vider les données
 * du site la réinitialise. Un stockage partagé (base distante) serait nécessaire
 * pour la retrouver sur un autre appareil.
 */

export interface ReplySample {
    text: string;
    intent: string | null;
    register: "vouvoiement" | "tutoiement" | null;
    at: string;
}

export interface ReplyStyleProfile {
    greeting: "Bonjour" | "Salut";
    includeOffer: boolean;
    closing: string;
    register: "vouvoiement" | "tutoiement";
    sampleCount: number;
}

const STORAGE_KEY = "assistantPerso.replyStyle.v1";
const MAX_SAMPLES = 30;

export function loadSamples(): ReplySample[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (item): item is ReplySample =>
                typeof item === "object" &&
                item !== null &&
                typeof (item as ReplySample).text === "string"
        );
    } catch {
        return [];
    }
}

export function recordReplySample(sample: {
    text: string;
    intent?: string | null;
    register?: "vouvoiement" | "tutoiement" | null;
}): number {
    if (typeof window === "undefined") return 0;
    const text = sample.text.trim();
    if (text.length < 20) return loadSamples().length;

    const samples = loadSamples();
    samples.push({
        text,
        intent: sample.intent ?? null,
        register: sample.register ?? null,
        at: new Date().toISOString(),
    });

    const trimmed = samples.slice(-MAX_SAMPLES);
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
        // Quota ou navigation privée : on ignore, la réponse reste utilisable.
    }
    return trimmed.length;
}

export function clearStyleMemory(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch {
        // ignore
    }
}

function lastLines(text: string, count: number): string[] {
    return text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-count);
}

/** Déduit un profil de style à partir des exemples mémorisés. */
export function computeStyleProfile(): ReplyStyleProfile {
    const samples = loadSamples();
    const defaults: ReplyStyleProfile = {
        greeting: "Bonjour",
        includeOffer: true,
        closing: "",
        register: "vouvoiement",
        sampleCount: samples.length,
    };
    if (samples.length === 0) return defaults;

    const salut = samples.filter((sample) => /^salut\b/i.test(sample.text)).length;
    const greeting: "Bonjour" | "Salut" = salut > samples.length / 2 ? "Salut" : "Bonjour";

    const withOffer = samples.filter((sample) =>
        /(n'hésitez pas|n'hésite pas|do not hesitate)/i.test(sample.text)
    ).length;
    const includeOffer = withOffer >= samples.length / 2;

    const closings = samples
        .map((sample) => lastLines(sample.text, 2).join("\n"))
        .filter((value) => value.length > 0);

    const counts = new Map<string, number>();
    for (const closing of closings) {
        counts.set(closing, (counts.get(closing) ?? 0) + 1);
    }

    let closing = "";
    let bestCount = 0;
    for (const [value, count] of counts) {
        if (count > bestCount) {
            closing = value;
            bestCount = count;
        }
    }

    const stableClosing = bestCount >= Math.ceil(samples.length / 2) ? closing : "";

    const tuSamples = samples.filter((sample) => sample.register === "tutoiement").length;
    const register: "vouvoiement" | "tutoiement" =
        tuSamples > samples.length / 2 ? "tutoiement" : "vouvoiement";

    return {
        greeting,
        includeOffer,
        closing: stableClosing,
        register,
        sampleCount: samples.length,
    };
}
