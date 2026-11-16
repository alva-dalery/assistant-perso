import { NextResponse } from "next/server";
import { describeGmailError, isGmailConfigured, sendEmail } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface SendPayload {
    to?: string;
    subject?: string;
    text?: string;
    inReplyTo?: string;
    mode?: "draft" | "send";
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
        const result = await sendEmail({
            to: payload.to ?? "",
            subject: payload.subject ?? "",
            text: payload.text ?? "",
            inReplyTo: payload.inReplyTo,
            mode: payload.mode === "draft" ? "draft" : "send",
        });
        return NextResponse.json(result, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : describeGmailError(error);
        const isValidationError = /invalide|vide|trop long/i.test(message);
        return NextResponse.json(
            { error: isValidationError ? message : describeGmailError(error) },
            { status: isValidationError ? 400 : 502, headers: { "Cache-Control": "no-store" } }
        );
    }
}
