import { NextResponse } from "next/server";
import {
    buildReplyDraft,
    describeGmailError,
    extractFirstName,
    getMessage,
    isGmailConfigured,
} from "@/lib/gmail";
import type { ReplyStyle } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ReplyDraftPayload {
    uid?: number;
    signature?: string;
    style?: unknown;
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
        return NextResponse.json(draft, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) {
        return NextResponse.json(
            { error: describeGmailError(error) },
            { status: 502, headers: { "Cache-Control": "no-store" } }
        );
    }
}
