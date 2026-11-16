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

export async function GET(request: Request) {
    if (!isGmailConfigured()) {
        return NextResponse.json(
            { error: describeGmailError(new Error("not configured")), suggestion: null },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    const uid = Number(new URL(request.url).searchParams.get("uid"));
    if (!Number.isInteger(uid) || uid <= 0) {
        return NextResponse.json(
            { error: "Paramètre uid invalide.", suggestion: null },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    try {
        const summary = await getMessageSummary(uid);
        const suggestion = await suggestFolderForMessage({
            senderEmail: summary.fromEmail,
            senderName: summary.fromName,
            subject: summary.subject,
        });

        return NextResponse.json(
            { suggestion },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        return NextResponse.json(
            { error: describeGmailError(error), suggestion: null },
            { status: 502, headers: { "Cache-Control": "no-store" } }
        );
    }
}
