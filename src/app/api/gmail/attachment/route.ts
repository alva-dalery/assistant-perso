import { NextResponse } from "next/server";
import { describeGmailError, downloadPart, isGmailConfigured } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SAFE_IMAGE = /^image\/(png|jpe?g|gif|webp|bmp|avif)$/i;
const SAFE_DOCUMENT = /^application\/pdf$/i;

export async function GET(request: Request) {
    if (!isGmailConfigured()) {
        return NextResponse.json(
            { error: describeGmailError(new Error("not configured")) },
            { status: 400 }
        );
    }

    const url = new URL(request.url);
    const uid = Number(url.searchParams.get("uid"));
    const part = url.searchParams.get("part") ?? "";

    if (!Number.isInteger(uid) || uid <= 0 || !/^\d+(\.\d+)*$/.test(part)) {
        return NextResponse.json({ error: "Paramètres uid/part invalides." }, { status: 400 });
    }

    try {
        const { buffer, contentType, filename } = await downloadPart(uid, part);

        // Le type déclaré par le client n'est accepté que s'il est sûr : les images
        // et PDF s'affichent, tout le reste est forcé en téléchargement.
        const declared = (url.searchParams.get("type") ?? contentType ?? "").toLowerCase();
        const safeType = SAFE_IMAGE.test(declared)
            ? declared
            : SAFE_DOCUMENT.test(declared)
                ? declared
                : "application/octet-stream";

        const disposition = SAFE_IMAGE.test(safeType) ? "inline" : "attachment";
        const requestedName = url.searchParams.get("name") || filename || "fichier";
        const safeName = requestedName.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "fichier";

        return new NextResponse(new Uint8Array(buffer), {
            headers: {
                "Content-Type": safeType,
                "Content-Disposition": `${disposition}; filename="${safeName}"`,
                "Cache-Control": "private, max-age=300",
                "X-Content-Type-Options": "nosniff",
            },
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
