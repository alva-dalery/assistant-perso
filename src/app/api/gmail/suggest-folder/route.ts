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

const EMPTY = { suggestion: null, scanned: 0, withSender: 0, withDomain: 0 };

export async function GET(request: Request) {
    if (!isGmailConfigured()) {
        return NextResponse.json(
            { ...EMPTY, error: describeGmailError(new Error("not configured")) },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    const uid = Number(new URL(request.url).searchParams.get("uid"));
    if (!Number.isInteger(uid) || uid <= 0) {
        return NextResponse.json(
            { ...EMPTY, error: "Paramètre uid invalide." },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    try {
        const summary = await getMessageSummary(uid);
        const result = await suggestFolderForMessage({
            senderEmail: summary.fromEmail,
            senderName: summary.fromName,
            subject: summary.subject,
        });

        return NextResponse.json(result, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) {
        return NextResponse.json(
            { ...EMPTY, error: describeGmailError(error) },
            { status: 502, headers: { "Cache-Control": "no-store" } }
        );
    }
}
