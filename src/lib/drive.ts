import type { InvoiceProvider } from "@/lib/gmail";

/**
 * Identifiants des dossiers Google Drive « Factures » pour chaque fournisseur.
 * Chaque dossier contient les sous-dossiers par année (2020, 2021, ..., 2026).
 */
export const DRIVE_FACTURES_FOLDER_IDS: Record<InvoiceProvider, string> = {
    eec: "1efMeqNs3IYlsfXyb1IAnHjrPxfeLPYJ-",
    cde: "1Dtwk8-zmoUtvY5jc0v0mtYZn3r7YVaz8",
    lagoon: "1DUGmiFYheDzlY0cKEe4HxXBMOGPD7ElP",
    "opt-internet": "1XqppqDhKUHslJJyVsRHSBdWdSvnRMG9q",
    "opt-mobile": "1T9551bEdlDXvQ71woIrU1KHGeH9GBqYP",
};

export const DRIVE_PROVIDER_FOLDER_LABEL: Record<InvoiceProvider, string> = {
    eec: "EEC / Factures",
    cde: "CDE (Calédonienne des eaux) / Factures",
    lagoon: "Lagoon / Factures",
    "opt-internet": "OPT - Internet / Factures",
    "opt-mobile": "OPT - Mobile / Factures",
};

export function isDriveConfigured(): boolean {
    return Boolean(process.env.GOOGLE_DRIVE_WEBHOOK_URL?.trim());
}

/** Extrait l'année (ex. "2026") depuis le nom de fichier ou la période, sinon année courante. */
export function extractInvoiceYear(fileName: string, period?: string): string {
    const fromName = fileName.match(/\b(20\d{2})\b/);
    if (fromName) return fromName[1];
    if (period) {
        const fromPeriod = period.match(/\b(20\d{2})\b/);
        if (fromPeriod) return fromPeriod[1];
    }
    return String(new Date().getFullYear());
}

export interface DriveUploadResult {
    fileId: string;
    name: string;
    year: string;
    folderId: string;
    webViewLink?: string;
}

export async function uploadInvoiceToDrive(params: {
    provider: InvoiceProvider;
    year: string;
    fileName: string;
    buffer: Buffer;
    mimeType?: string;
}): Promise<DriveUploadResult> {
    const webhookUrl = process.env.GOOGLE_DRIVE_WEBHOOK_URL?.trim();
    if (!webhookUrl) {
        throw new Error(
            "Google Drive non configuré (variable GOOGLE_DRIVE_WEBHOOK_URL manquante dans .env.local)."
        );
    }

    const parentFolderId = DRIVE_FACTURES_FOLDER_IDS[params.provider];
    if (!parentFolderId) {
        throw new Error(`Fournisseur inconnu pour Google Drive : ${params.provider}`);
    }

    const safeFileName =
        params.fileName.replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 140) || "facture.pdf";

    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "follow",
        body: JSON.stringify({
            token: process.env.GOOGLE_DRIVE_WEBHOOK_SECRET?.trim() ?? "",
            parentFolderId,
            year: params.year,
            fileName: safeFileName,
            mimeType: params.mimeType || "application/pdf",
            base64: params.buffer.toString("base64"),
        }),
    });

    const rawText = await response.text();
    interface AppsScriptResponse {
        ok?: boolean;
        error?: string;
        fileId?: string;
        name?: string;
        folderId?: string;
        webViewLink?: string;
    }
    let payload: AppsScriptResponse | null = null;
    try {
        payload = JSON.parse(rawText) as AppsScriptResponse;
    } catch {
        payload = null;
    }

    if (!response.ok || !payload?.ok) {
        const detail =
            payload?.error ||
            (rawText.trim().startsWith("<")
                ? "Le script Google Drive a renvoyé une page HTML (vérifiez le déploiement « Tout le monde »)."
                : rawText.slice(0, 200));
        throw new Error(detail || `Erreur Google Drive (HTTP ${response.status}).`);
    }

    return {
        fileId: payload.fileId ?? "",
        name: payload.name ?? safeFileName,
        year: params.year,
        folderId: payload.folderId ?? parentFolderId,
        webViewLink: payload.webViewLink,
    };
}
