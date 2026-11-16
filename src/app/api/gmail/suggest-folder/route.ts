import { NextResponse } from "next/server";
import {
    describeGmailError,
    getMessageSummary,
    isGmailConfigured,
    suggestFolderForMessage,
} from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const EMPTY = { suggestions: [], scanned: 0, withSender: 0 };

export async function GET(request: Request) {
    if (!isGmailConfigured()) {
        return NextResponse.json(
            { ...EMPTY, error: describeGmailError(new Error("not configured")) },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    const params = new URL(request.url).searchParams;
    const refresh = params.get("refresh") === "1";
    const uid = Number(params.get("uid"));

    if (!Number.isInteger(uid) || uid <= 0) {
        return NextResponse.json(
            { ...EMPTY, error: "Paramètre uid invalide." },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    try {
        const summary = await getMessageSummary(uid);
        const result = await suggestFolderForMessage(
            {
                senderEmail: summary.fromEmail,
                senderName: summary.fromName,
                subject: summary.subject,
            },
            { refresh }
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
