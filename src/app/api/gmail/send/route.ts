import { NextResponse } from "next/server";
import {
    describeGmailError,
    isGmailConfigured,
    markMessageAnswered,
    sendEmail,
} from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface SendPayload {
    to?: string;
    subject?: string;
    text?: string;
    inReplyTo?: string;
    mode?: "draft" | "send";
    /** UID du message d'origine, pour le marquer comme répondu après envoi. */
    uid?: number;
}

export async function POST(request: Request) {
    if (!isGmailConfigured()) {
        return NextResponse.json(
            { error: describeGmailError(new Error("not configured")) },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    let payload: SendPayload;
    try {
        payload = (await request.json()) as SendPayload;
    } catch {
        return NextResponse.json(
            { error: "Corps de requête JSON invalide." },
            { status: 400 }
        );
    }

    try {
        const mode = payload.mode === "draft" ? "draft" : "send";
        const result = await sendEmail({
            to: payload.to ?? "",
            subject: payload.subject ?? "",
            text: payload.text ?? "",
            inReplyTo: payload.inReplyTo,
            mode,
        });

        // Après un envoi réel, le message d'origine reçoit le drapeau \Answered :
        // il quitte ainsi la file « À traiter » au prochain rafraîchissement.
        const uid = Number(payload.uid);
        const markedAnswered =
            mode === "send" && Number.isInteger(uid) && uid > 0
                ? await markMessageAnswered(uid)
                : false;

        return NextResponse.json(
            { ...result, markedAnswered },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : describeGmailError(error);
        const isValidationError = /invalide|vide|trop long/i.test(message);
        return NextResponse.json(
            { error: isValidationError ? message : describeGmailError(error) },
            { status: isValidationError ? 400 : 502, headers: { "Cache-Control": "no-store" } }
        );
    }
}
