import { NextResponse } from "next/server";
import { deleteMessage, describeGmailError, isGmailConfigured } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
    if (!isGmailConfigured()) {
        return NextResponse.json(
            { error: describeGmailError(new Error("not configured")) },
            { status: 400 }
        );
    }

    let payload: { uid?: number };
    try {
        payload = (await request.json()) as { uid?: number };
    } catch {
        return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
    }

    const uid = Number(payload.uid);
    if (!Number.isInteger(uid) || uid <= 0) {
        return NextResponse.json({ error: "Paramètre uid invalide." }, { status: 400 });
    }

    try {
        const result = await deleteMessage(uid);
        return NextResponse.json(result, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : describeGmailError(error);
        const isValidation = /invalide|introuvable/i.test(message);
        return NextResponse.json(
            { error: isValidation ? message : describeGmailError(error) },
            { status: isValidation ? 400 : 502 }
        );
    }
}
