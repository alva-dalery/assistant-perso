import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const MAX_BYTES = 5 * 1024 * 1024;
const MIN_BYTES = 500;

function isPrivateHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
        host === "localhost" ||
        host === "::1" ||
        host === "0.0.0.0" ||
        host.endsWith(".local") ||
        host.endsWith(".internal")
    ) {
        return true;
    }
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return true;
    const match172 = host.match(/^172\.(\d+)\./);
    if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) return true;
    if (/^(fe80:|fc|fd)/i.test(host)) return true;
    return false;
}

function allowedUrl(value: string): boolean {
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:") return false;
        if (!url.hostname || isPrivateHost(url.hostname)) return false;
        return true;
    } catch {
        return false;
    }
}

/**
 * Récupère une couverture côté serveur puis la renvoie au navigateur.
 *
 * Évite les blocages de hotlink, les redirections refusées et les images cassées
 * (y compris les pixels transparents 1×1 d'Open Library) : on ne renvoie que du
 * vrai `image/*` d'au moins 500 octets, avec un cache navigateur d'une journée.
 */
export async function GET(request: Request) {
    const raw = new URL(request.url).searchParams.get("url") ?? "";
    if (!raw) {
        return NextResponse.json({ error: "Paramètre url manquant." }, { status: 400 });
    }
    if (!allowedUrl(raw)) {
        return NextResponse.json({ error: "Source d'image non autorisée." }, { status: 400 });
    }

    try {
        const response = await fetch(raw, {
            redirect: "follow",
            cache: "no-store",
            headers: {
                Accept: "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8",
                "User-Agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            },
            signal: AbortSignal.timeout(12_000),
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Image indisponible (${response.status}).` },
                { status: 404 }
            );
        }

        const type = (response.headers.get("content-type") ?? "").toLowerCase();
        if (!type.startsWith("image/")) {
            return NextResponse.json(
                { error: "La source n'a pas renvoyé une image." },
                { status: 415 }
            );
        }

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength < MIN_BYTES) {
            return NextResponse.json({ error: "Image vide ou factice." }, { status: 404 });
        }
        if (buffer.byteLength > MAX_BYTES) {
            return NextResponse.json({ error: "Image trop volumineuse." }, { status: 413 });
        }

        return new NextResponse(buffer, {
            headers: {
                "Content-Type": type,
                "Cache-Control": "public, max-age=86400, immutable",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch {
        return NextResponse.json({ error: "Téléchargement de l'image impossible." }, { status: 502 });
    }
}
