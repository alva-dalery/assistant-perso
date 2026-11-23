import { NextResponse } from "next/server";
import {
    buildReplyDraft,
    describeGmailError,
    extractFirstName,
    getMessage,
    isGmailConfigured,
} from "@/lib/gmail";
import type { ReplyStyle } from "@/lib/gmail";
import { callDeepSeekJson, DeepSeekError, resolveDeepSeekConfig } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ReplyDraftPayload {
    uid?: number;
    signature?: string;
    style?: unknown;
    writingStyle?: string;
    instruction?: string;
    useAi?: boolean;
}

function sanitizeStyle(input: unknown): ReplyStyle | undefined {
    if (!input || typeof input !== "object") return undefined;
    const value = input as {
        greeting?: unknown;
        includeOffer?: unknown;
        closing?: unknown;
        register?: unknown;
    };

    const greeting =
        value.greeting === "Salut" ? "Salut" : value.greeting === "Bonjour" ? "Bonjour" : undefined;
    const includeOffer = typeof value.includeOffer === "boolean" ? value.includeOffer : undefined;
    const closing =
        typeof value.closing === "string" && value.closing.trim()
            ? value.closing.slice(0, 300)
            : undefined;

    const register =
        value.register === "tutoiement"
            ? "tutoiement"
            : value.register === "vouvoiement"
              ? "vouvoiement"
              : undefined;

    if (!greeting && includeOffer === undefined && !closing && !register) return undefined;
    return { greeting, includeOffer, closing, register };
}

export async function POST(request: Request) {
    if (!isGmailConfigured()) {
        return NextResponse.json(
            { error: describeGmailError(new Error("not configured")) },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    let payload: ReplyDraftPayload;
    try {
        payload = (await request.json()) as ReplyDraftPayload;
    } catch {
        return NextResponse.json(
            { error: "Corps de requête JSON invalide." },
            { status: 400 }
        );
    }

    const uid = Number(payload.uid);
    if (!Number.isInteger(uid) || uid <= 0) {
        return NextResponse.json(
            { error: "Paramètre uid invalide." },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    try {
        const message = await getMessage(uid);
        const signature = typeof payload.signature === "string" ? payload.signature : "";
        const style = sanitizeStyle(payload.style);
        const firstName = extractFirstName({
            senderName: message.fromName,
            senderEmail: message.fromEmail,
            bodyText: `${message.currentText || message.text}\n${message.historyText}`,
            imageNames: message.inlineImages,
        });
        const draft = buildReplyDraft(
            {
                fromName: message.fromName,
                fromEmail: message.fromEmail,
                subject: message.subject,
                text: message.currentText || message.text,
                history: message.historyText,
                firstName,
                needsReply: message.needsReply,
                exchanges: message.exchanges,
            },
            signature,
            style
        );

        const aiConfig = resolveDeepSeekConfig(request);
        if (payload.useAi !== false && aiConfig.apiKey) {
            try {
                const writingStyle =
                    typeof payload.writingStyle === "string" ? payload.writingStyle.trim() : "";
                const instruction =
                    typeof payload.instruction === "string" ? payload.instruction.trim() : "";

                const learnedHint = style
                    ? `Style appris sur vos derniers envois : salutation="${style.greeting || "Bonjour"}", registre="${style.register || draft.register}", clôture="${style.closing || signature || "Bien cordialement,"}".`
                    : "";

                const { data, model } = await callDeepSeekJson<{
                    subject?: string;
                    body?: string;
                    intent?: string;
                    register?: "tutoiement" | "vouvoiement";
                }>({
                    request,
                    messages: [
                        {
                            role: "system",
                            content: `Tu es le secrétaire personnel d'${signature ? signature.split("\n").pop()?.trim() || "Alva" : "Alva"}.
Tu rédiges un brouillon de réponse prêt à relire.
Règles strictes :
- Langue : français naturel, humain, direct, chaleureux, concis.
- INTERDIT : formules robotiques ou pompeuses ("J'espère que ce mail vous trouve en bonne santé", "Je me permets de revenir vers vous", "N'hésitez surtout pas à revenir vers moi pour toute question").
- Respecte impérativement le registre détecté (${draft.register}) sauf si l'instruction utilisateur demande autre chose.
- N'invente jamais de dates, prix, pièces jointes ou engagements absents du mail ou de la consigne. Si une information manque, laisse un repère clair entre crochets comme [préciser créneau].
- Termine par la signature : ${signature.trim() || "Bien cordialement,"}
${writingStyle ? `- Directives de plume de l'utilisateur : ${writingStyle}` : ""}
${learnedHint}

Réponds uniquement en JSON :
{
  "subject": "Objet du mail (commençant par Re: si réponse)",
  "body": "Corps complet du message avec sauts de ligne",
  "intent": "Intention en 2-3 mots (ex: prise de rendez-vous, facturation, réponse)",
  "register": "tutoiement" | "vouvoiement"
}`,
                        },
                        {
                            role: "user",
                            content: `Expéditeur : ${message.fromName || message.fromEmail} <${message.fromEmail}>
Prénom détecté : ${firstName || "Inconnu"}
Objet : ${message.subject}
Nombre d'échanges dans le fil : ${message.exchanges ?? 1}
${instruction ? `\nConsigne spécifique de l'utilisateur pour cette réponse : ${instruction}\n` : ""}
Message reçu :
${(message.currentText || message.text || "").slice(0, 4000)}

${message.historyText ? `Historique précédent (extrait) :\n${message.historyText.slice(0, 2000)}` : ""}`,
                        },
                    ],
                    temperature: 0.4,
                    maxTokens: 900,
                });

                if (data.body && data.body.trim()) {
                    return NextResponse.json(
                        {
                            ...draft,
                            subject: data.subject?.trim() || draft.subject,
                            body: data.body.trim(),
                            intent: data.intent?.trim() || draft.intent,
                            register:
                                data.register === "tutoiement" || data.register === "vouvoiement"
                                    ? data.register
                                    : draft.register,
                            aiPowered: true,
                            aiModel: model,
                        },
                        { headers: { "Cache-Control": "no-store" } }
                    );
                }
            } catch (aiErr) {
                const warning =
                    aiErr instanceof DeepSeekError
                        ? aiErr.message
                        : "DeepSeek indisponible, brouillon rédigé par règles locales.";
                return NextResponse.json(
                    { ...draft, aiPowered: false, aiWarning: warning },
                    { headers: { "Cache-Control": "no-store" } }
                );
            }
        }

        return NextResponse.json(
            { ...draft, aiPowered: false },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        return NextResponse.json(
            { error: describeGmailError(error) },
            { status: 502, headers: { "Cache-Control": "no-store" } }
        );
    }
}
