/**
 * Couvertures et métadonnées des livres empruntés (emails de la BM Lyon).
 *
 * La recherche automatique passe par `/api/book-lookup` (Apple Books FR, Open Library,
 * Google Books et recherche d'images sur internet) afin de :
 *  - retrouver le **titre complet** (sous-titre compris) ;
 *  - retrouver le **prénom + nom** de l'auteur ;
 *  - récupérer une liste de couvertures candidates.
 * Le lien de l'image peut ensuite être corrigé à la main ; ce choix est mémorisé
 * dans le navigateur, comme les autres mémoires de l'application.
 */

const STORAGE_KEY = "assistantPerso.loanCovers.v1";
const EXTENSIONS_STORAGE_KEY = "assistantPerso.loanExtensions.v1";

export interface BookLookup {
    /** Titre complet tel que catalogué (sous-titre inclus). */
    title: string | null;
    /** Auteurs au format « Prénom Nom ». */
    authors: string[];
    /** Couvertures candidates, la plus grande d'abord. */
    covers: string[];
}

const EMPTY_LOOKUP: BookLookup = { title: null, authors: [], covers: [] };

/** Clé stable d'un ouvrage (titre + auteur, insensible à la casse et aux accents). */
export function loanCoverKey(title: string, author: string | null): string {
    return `${normalize(title)}|${normalize(author ?? "")}`;
}

function normalize(value: string): string {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Met en forme un titre écrit en capitales par la bibliothèque. */
export function titleCase(value: string): string {
    if (value !== value.toUpperCase()) return value;
    return value
        .toLowerCase()
        .replace(/(^|[\s'’\-])([a-zà-ÿ])/g, (_match, prefix: string, letter: string) => {
            return `${prefix}${letter.toUpperCase()}`;
        });
}

const LOOKUP_CACHE = new Map<string, BookLookup>();
const LOOKUP_PROMISES = new Map<string, Promise<BookLookup>>();

/**
 * Recherche le titre complet, les auteurs et les couvertures d'un ouvrage.
 * Les résultats (même vides) sont mis en cache pour la session.
 */
export async function lookupBook(
    title: string,
    author: string | null,
    options?: { force?: boolean }
): Promise<BookLookup> {
    if (!title.trim()) return EMPTY_LOOKUP;
    const key = loanCoverKey(title, author);
    if (options?.force) LOOKUP_CACHE.delete(key);

    const cached = LOOKUP_CACHE.get(key);
    if (cached) return cached;

    const running = LOOKUP_PROMISES.get(key);
    if (running) return running;

    const task = (async (): Promise<BookLookup> => {
        let result = EMPTY_LOOKUP;
        try {
            const params = new URLSearchParams({ title: title.trim() });
            if (author?.trim()) params.set("author", author.trim());
            if (options?.force) params.set("force", "1");

            const response = await fetch(`/api/book-lookup?${params.toString()}`);
            if (response.ok) {
                const data = (await response.json()) as Partial<BookLookup>;
                result = {
                    title: typeof data.title === "string" ? data.title : null,
                    authors: Array.isArray(data.authors) ? data.authors : [],
                    covers: Array.isArray(data.covers) ? data.covers : [],
                };
            }
        } catch {
            result = EMPTY_LOOKUP;
        }

        LOOKUP_CACHE.set(key, result);
        LOOKUP_PROMISES.delete(key);
        return result;
    })();

    LOOKUP_PROMISES.set(key, task);
    return task;
}

/* ----------------------------- Liens choisis à la main ----------------------------- */

export function loadCoverOverrides(): Record<string, string> {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object") return {};
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) {
                result[key] = value.trim();
            }
        }
        return result;
    } catch {
        return {};
    }
}

export function saveCoverOverrides(overrides: Record<string, string>): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch {
        // Stockage indisponible : le lien reste valable pour la session.
    }
}

export function loadLoanExtensions(): Record<string, boolean> {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(EXTENSIONS_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object") return {};
        const result: Record<string, boolean> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (value === true) result[key] = true;
        }
        return result;
    } catch {
        return {};
    }
}

export function saveLoanExtensions(extensions: Record<string, boolean>): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(EXTENSIONS_STORAGE_KEY, JSON.stringify(extensions));
    } catch {
        // Stockage indisponible : la prolongation reste valable pour la session.
    }
}

/* ----------------------------- Affichage des images ----------------------------- */

/**
 * Les couvertures sont servies par notre propre route `/api/cover` : cela évite
 * les blocages de hotlink, les redirections refusées et les pixels factices.
 */
export function coverSrc(url: string | null | undefined): string | null {
    if (!url) return null;
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) return null;
    return `/api/cover?url=${encodeURIComponent(trimmed)}`;
}
