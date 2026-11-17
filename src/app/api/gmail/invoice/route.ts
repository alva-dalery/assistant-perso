import { NextResponse } from "next/server";
import {
    describeGmailError,
    detectInvoiceFromMessage,
    getMessage,
    isGmailConfigured,
} from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
    if (!isGmailConfigured()) {
        return NextResponse.json(
            { proposal: null, error: describeGmailError(new Error("not configured")) },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    const uid = Number(new URL(request.url).searchParams.get("uid"));
    if (!Number.isInteger(uid) || uid <= 0) {
        return NextResponse.json(
            { proposal: null, error: "Paramètre uid invalide." },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    try {
        const message = await getMessage(uid);
        const proposal = detectInvoiceFromMessage(message);
        return NextResponse.json(
            { proposal },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        return NextResponse.json(
            { proposal: null, error: describeGmailError(error) },
            { status: 502, headers: { "Cache-Control": "no-store" } }
        );
    }
}
