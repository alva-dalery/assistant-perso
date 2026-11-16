import { NextResponse } from "next/server";
import { describeGmailError, isGmailConfigured, listFolders } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
    if (!isGmailConfigured()) {
        return NextResponse.json(
            { error: describeGmailError(new Error("not configured")), folders: [] },
            { status: 400, headers: { "Cache-Control": "no-store" } }
        );
    }

    try {
        const folders = await listFolders();
        return NextResponse.json({ folders }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return NextResponse.json(
            { error: describeGmailError(error), folders: [] },
            { status: 502, headers: { "Cache-Control": "no-store" } }
        );
    }
}
