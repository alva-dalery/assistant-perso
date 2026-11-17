import { NextResponse } from "next/server";
import { describeGmailError, downloadInvoiceLink, isGmailConfigured } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
    if (!isGmailConfigured()) {
        return NextResponse.json(
            { error: describeGmailError(new Error("not configured")) },
            { status: 400 }
        );
    }

    const url = new URL(request.url).searchParams.get("url") ?? "";
    if (!url) {
        return NextResponse.json({ error: "Paramètre url manquant." }, { status: 400 });
    }

    try {
        const { buffer, contentType } = await downloadInvoiceLink(url);
        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                "Content-Type": contentType.includes("pdf") ? "application/pdf" : contentType,
                "Content-Disposition": "inline",
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : describeGmailError(error);
        const isValidation = /autorisé|manquant|volumineux|refusé|redirige/i.test(message);
        return NextResponse.json(
            { error: isValidation ? message : describeGmailError(error) },
            { status: isValidation ? 400 : 502 }
        );
    }
}
