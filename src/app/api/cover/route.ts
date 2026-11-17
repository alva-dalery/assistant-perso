import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Sources d'images autorisées (Open Library / Internet Archive / Google Books). */
const ALLOWED_HOSTS = [
    "covers.openlibrary.org",
    "openlibrary.org",
    "books.google.com",
    "books.googleusercontent.com",
    "archive.org",
    "www.archive.org",
];

const ALLOWED_SUFFIXES = [".archive.org", ".googleusercontent.com", ".google.com"];

const MAX_BYTES = 5 * 1024 * 1024;

function allowedHost(value: string): boolean {
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:") return false;
        const host = url.hostname.toLowerCase();
        if (ALLOWED_HOSTS.includes(host)) return true;
        return ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix));
    } catch {
        return false;
    }
}

/**
 * Récupère une couverture côté serveur puis la renvoie au navigateur.
 *
 * Évite les blocages de hotlink, les redirections refusées (Open Library renvoie
 * vers Internet Archive) et les images cassées : on ne renvoie que du vrai
 * image/*, avec un cache navigateur d'une journée.
 */
export async function GET(request: Request) {
    const raw = new URL(request.url).searchParams.get("url") ?? "";
    if (!raw) {
        return NextResponse.json({ error: "Paramètre url manquant." }, { status: 400 });
    }
    if (!allowedHost(raw)) {
        return NextResponse.json({ error: "Source d'image non autorisée." }, { status: 400 });
    }

    try {
        const response = await fetch(raw, {
            redirect: "follow",
            cache: "no-store",
            headers: {
                Accept: "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8",
                "User-Agent": "Assistant perso (couvertures de livres)",
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
        if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
            return NextResponse.json({ error: "Image vide ou trop volumineuse." }, { status: 413 });
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
