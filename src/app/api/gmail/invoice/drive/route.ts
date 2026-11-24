import { NextResponse } from "next/server";
import {
    describeGmailError,
    downloadInvoiceLink,
    downloadPart,
    isGmailConfigured,
    type InvoiceProvider,
} from "@/lib/gmail";
import {
    DRIVE_FACTURES_FOLDER_IDS,
    DRIVE_PROVIDER_FOLDER_LABEL,
    extractInvoiceYear,
    isDriveConfigured,
    uploadInvoiceToDrive,
    type DriveUploadResult,
} from "@/lib/drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface FileToUpload {
    part?: string;
    url?: string;
    fileName?: string;
}

export async function POST(request: Request) {
    if (!isGmailConfigured()) {
        return NextResponse.json(
            { ok: false, error: describeGmailError(new Error("not configured")) },
            { status: 400 }
        );
    }

    if (!isDriveConfigured()) {
        return NextResponse.json(
            {
                ok: false,
                error: "Google Drive non configuré (GOOGLE_DRIVE_WEBHOOK_URL manquant dans .env.local).",
            },
            { status: 400 }
        );
    }

    let body: {
        uid?: unknown;
        provider?: unknown;
        period?: unknown;
        files?: unknown;
    };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ ok: false, error: "JSON invalide." }, { status: 400 });
    }

    const uid = Number(body.uid);
    const provider = typeof body.provider === "string" ? (body.provider as InvoiceProvider) : null;
    const period = typeof body.period === "string" ? body.period : undefined;
    const files = Array.isArray(body.files) ? (body.files as FileToUpload[]) : [];

    if (!Number.isInteger(uid) || uid <= 0) {
        return NextResponse.json({ ok: false, error: "Paramètre uid invalide." }, { status: 400 });
    }
    if (!provider || !(provider in DRIVE_FACTURES_FOLDER_IDS)) {
        return NextResponse.json(
            { ok: false, error: "Fournisseur de facture invalide." },
            { status: 400 }
        );
    }
    if (files.length === 0) {
        return NextResponse.json(
            { ok: false, error: "Aucun fichier à ranger." },
            { status: 400 }
        );
    }

    try {
        const uploaded: DriveUploadResult[] = [];
        for (const item of files) {
            const fileName = (item.fileName ?? "").trim() || "facture.pdf";
            const part = typeof item.part === "string" ? item.part.trim() : "";
            const url = typeof item.url === "string" ? item.url.trim() : "";

            let buffer: Buffer;
            let contentType = "application/pdf";

            if (part && /^\d+(\.\d+)*$/.test(part)) {
                const downloaded = await downloadPart(uid, part);
                buffer = downloaded.buffer;
                contentType = downloaded.contentType || "application/pdf";
            } else if (url) {
                const downloaded = await downloadInvoiceLink(url);
                buffer = downloaded.buffer;
                contentType = downloaded.contentType || "application/pdf";
            } else {
                throw new Error("Source de facture manquante (ni pièce jointe, ni lien).");
            }

            const year = extractInvoiceYear(fileName, period);
            const result = await uploadInvoiceToDrive({
                provider,
                year,
                fileName,
                buffer,
                mimeType: contentType.includes("pdf") ? "application/pdf" : contentType,
            });
            uploaded.push(result);
        }

        return NextResponse.json({
            ok: true,
            folder: `${DRIVE_PROVIDER_FOLDER_LABEL[provider]} / ${uploaded[0]?.year ?? ""}`,
            uploaded,
        });
    } catch (error) {
        console.error("[gmail:invoice:drive]", error);
        const message = error instanceof Error ? error.message : describeGmailError(error);
        return NextResponse.json({ ok: false, error: message }, { status: 502 });
    }
}
