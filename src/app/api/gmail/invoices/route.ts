import { NextResponse } from "next/server";
import { describeGmailError, detectInvoicesForUids, isGmailConfigured } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
    if (!isGmailConfigured()) {
        return NextResponse.json(
            { items: [], error: describeGmailError(new Error("not configured")) },
            { status: 400 }
        );
    }

    let payload: { uids?: unknown };
    try {
        payload = (await request.json()) as { uids?: unknown };
    } catch {
        return NextResponse.json({ items: [], error: "JSON invalide." }, { status: 400 });
    }

    const uids = Array.isArray(payload.uids)
        ? payload.uids
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0)
            .slice(0, 25)
        : [];

    if (uids.length === 0) {
        return NextResponse.json({ items: [], error: "Aucun uid valide." }, { status: 400 });
    }

    try {
        const items = await detectInvoicesForUids(uids);
        return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        console.error("[gmail:invoices]", error);
        return NextResponse.json(
            { items: [], error: describeGmailError(error) },
            { status: 502 }
        );
    }
}
