import { NextRequest, NextResponse } from "next/server";

/**
 * Protection d'accès "moi uniquement" pour Assistant perso.
 *
 * Fonctionnement : HTTP Basic Auth (la fenêtre identifiant / mot de passe
 * du navigateur), vérifié côté serveur AVANT tout rendu de page.
 * Les identifiants sont lus dans les variables d'environnement :
 *   - SITE_USER     : votre identifiant
 *   - SITE_PASSWORD : un mot de passe long et aléatoire (ASCII de préférence)
 *
 * En local (`npm run dev`), la protection est désactivée : localhost reste
 * accessible directement via `lancer.command` / `Assistant perso.app`.
 */

const SITE_USER = process.env.SITE_USER ?? "";
const SITE_PASSWORD = process.env.SITE_PASSWORD ?? "";

/** Comparaison à durée constante (limite les attaques temporelles). */
function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

function deny(message: string, status: 401 | 503): NextResponse {
    const response = new NextResponse(message, {
        status,
        headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "X-Robots-Tag": "noindex, nofollow, noarchive",
        },
    });
    if (status === 401) {
        response.headers.set("WWW-Authenticate", 'Basic realm="Assistant perso", charset="UTF-8"');
    }
    return response;
}

export function middleware(request: NextRequest): NextResponse {
    // Développement local : accès libre sur localhost.
    if (process.env.NODE_ENV !== "production") {
        return NextResponse.next();
    }

    // Échec "fermé" : si les variables ne sont pas configurées, on bloque tout.
    if (!SITE_USER || !SITE_PASSWORD) {
        return deny(
            "Protection non configurée : renseignez SITE_USER et SITE_PASSWORD (voir DEPLOIEMENT.md).",
            503
        );
    }

    const authorization = request.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Basic ")) {
        return deny("Accès réservé.", 401);
    }

    let decoded = "";
    try {
        decoded = atob(authorization.slice(6).trim());
    } catch {
        return deny("Identifiants illisibles.", 401);
    }

    const separator = decoded.indexOf(":");
    if (separator === -1) {
        return deny("Identifiants incomplets.", 401);
    }

    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);

    if (!safeCompare(user, SITE_USER) || !safeCompare(password, SITE_PASSWORD)) {
        return deny("Identifiants invalides.", 401);
    }

    const response = NextResponse.next();
    // Empêche l'indexation par les moteurs de recherche et le cache partagé.
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
}

export const config = {
    // Tout protéger sauf les assets internes de Next.
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
