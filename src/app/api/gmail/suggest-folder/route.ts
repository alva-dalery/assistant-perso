import { NextResponse } from "next/server";
import {
    describeGmailError,
    getMessageSummary,
    isGmailConfigured,
    suggestFolderForMessage,
} from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMPTY = {
    suggestions: [],
    scanned: 0,
    processed: 0,
    withSender: 0,
    errors: 0,
    nextOffset: null,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: Request) {
    if (!isGmailConfigured()) {
        return NextResponse.json(
            { ...EMPTY, error: describeGmailError(new Error("not configured")) },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    const params = new URL(request.url).searchParams;
    const refresh = params.get("refresh") === "1";
    const offset = Number(params.get("offset") ?? "0");
    const batch = Number(params.get("batch") ?? "15");
    const uid = Number(params.get("uid"));
    const senderParam = (params.get("sender") ?? "").trim();
    const subjectParam = (params.get("subject") ?? "").slice(0, 300);

    try {
        let senderEmail = senderParam;
        let senderName = (params.get("name") ?? "").trim();
        let subject = subjectParam;

        // Le client envoie l'expéditeur : évite un aller-retour IMAP par lot.
        if (!senderEmail) {
            if (!Number.isInteger(uid) || uid <= 0) {
                return NextResponse.json(
                    { ...EMPTY, error: "Paramètres uid ou expéditeur invalides." },
                    { status: 400, headers: { "Cache-Control": "no-store" } }
                );
            }
            const summary = await getMessageSummary(uid);
            senderEmail = summary.fromEmail;
            senderName = summary.fromName;
            subject = summary.subject;
        }

        if (!EMAIL_RE.test(senderEmail)) {
            return NextResponse.json(
                { ...EMPTY, error: "Adresse expéditeur invalide." },
                { status: 400, headers: { "Cache-Control": "no-store" } }
            );
        }

        const result = await suggestFolderForMessage(
            { senderEmail, senderName, subject },
            { refresh, offset, batch }
        );

        return NextResponse.json(result, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) {
        console.error("[gmail:suggest-folder]", error);
        return NextResponse.json(
            { ...EMPTY, error: describeGmailError(error) },
            { status: 502, headers: { "Cache-Control": "no-store" } }
        );
    }
}
