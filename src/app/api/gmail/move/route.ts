import { NextResponse } from "next/server";
import { describeGmailError, isGmailConfigured, moveMessage } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface MovePayload {
    uid?: number;
    destination?: string;
}

export async function POST(request: Request) {
    if (!isGmailConfigured()) {
        return NextResponse.json(
            { error: describeGmailError(new Error("not configured")) },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    let payload: MovePayload;
    try {
        payload = (await request.json()) as MovePayload;
    } catch {
        return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
    }

    const uid = Number(payload.uid);
    const destination = typeof payload.destination === "string" ? payload.destination : "";

    if (!Number.isInteger(uid) || uid <= 0) {
        return NextResponse.json(
            { error: "Paramètre uid invalide." },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    try {
        const result = await moveMessage(uid, destination);
        return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        const message = error instanceof Error ? error.message : describeGmailError(error);
        const isValidationError = /invalide|manquant|inconnu/i.test(message);
        return NextResponse.json(
            { error: isValidationError ? message : describeGmailError(error) },
            { status: isValidationError ? 400 : 502, headers: { "Cache-Control": "no-store" } }
        );
    }
}
