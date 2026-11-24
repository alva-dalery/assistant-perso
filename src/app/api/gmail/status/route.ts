import { NextResponse } from "next/server";
import { checkGmailStatus, describeGmailError } from "@/lib/gmail";
import { isDriveConfigured } from "@/lib/drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
    try {
        const status = await checkGmailStatus();
        return NextResponse.json(
            { ...status, driveConfigured: isDriveConfigured() },
            {
                headers: { "Cache-Control": "no-store" },
            }
        );
    } catch (error) {
        return NextResponse.json(
            {
                configured: false,
                driveConfigured: isDriveConfigured(),
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
