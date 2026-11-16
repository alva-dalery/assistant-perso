import { NextResponse } from "next/server";
import { describeGmailError, isGmailConfigured, listInbox } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
    if (!isGmailConfigured()) {
        return NextResponse.json(
            { error: describeGmailError(new Error("not configured")), messages: [], total: 0 },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    const requested = Number(new URL(request.url).searchParams.get("limit") ?? "12");
    const limit = Number.isFinite(requested)
        ? Math.min(Math.max(Math.trunc(requested), 1), 30)
        : 12;

    try {
        const data = await listInbox(limit);
        return NextResponse.json(data, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) {
        return NextResponse.json(
            { error: describeGmailError(error), messages: [], total: 0 },
            { status: 502, headers: { "Cache-Control": "no-store" } }
        );
    }
}
