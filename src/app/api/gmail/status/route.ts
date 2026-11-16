import { NextResponse } from "next/server";
import { checkGmailStatus, describeGmailError } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
    try {
        const status = await checkGmailStatus();
        return NextResponse.json(status, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error) {
        return NextResponse.json(
            {
                configured: false,
                email: null,
                inboxCount: null,
                imap: "error",
                smtp: "error",
                error: describeGmailError(error),
            },
            { status: 500, headers: { "Cache-Control": "no-store" } }
        );
    }
}
