import { NextResponse } from "next/server";
import {
    buildReplyDraft,
    describeGmailError,
    getMessage,
    isGmailConfigured,
} from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ReplyDraftPayload {
    uid?: number;
    signature?: string;
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
        const draft = buildReplyDraft(message, signature);
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
