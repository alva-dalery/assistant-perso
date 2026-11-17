/**
 * Couvertures et métadonnées des livres empruntés (emails de la BM Lyon).
 *
 * La recherche automatique interroge Google Books puis Open Library afin de :
 *  - retrouver le **titre complet** (sous-titre compris) ;
 *  - retrouver le **prénom + nom** de l'auteur ;
 *  - récupérer une liste de couvertures candidates.
 * Le lien de l'image peut ensuite être corrigé à la main ; ce choix est mémorisé
 * dans le navigateur, comme les autres mémoires de l'application.
 */

const STORAGE_KEY = "assistantPerso.loanCovers.v1";

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

/** Mots significatifs communs entre le titre de l'email et celui du catalogue. */
function similarity(left: string, right: string): number {
    const a = new Set(normalize(left).split(" ").filter((word) => word.length > 2));
    const b = new Set(normalize(right).split(" ").filter((word) => word.length > 2));
    if (a.size === 0 || b.size === 0) return 0;
    let common = 0;
    for (const word of a) {
        if (b.has(word)) common += 1;
    }
    return common / Math.min(a.size, b.size);
}

/**
 * Le résultat du catalogue correspond-il au livre demandé ?
 * `lenient` sert au dernier essai : mieux vaut une couverture approchante
 * qu'aucune couverture, l'utilisateur pouvant corriger le lien.
 */
function credible(requested: string, candidate: string, lenient = false): boolean {
    if (!candidate.trim()) return false;
    const normalizedRequested = normalize(requested);
    const normalizedCandidate = normalize(candidate);
    if (!normalizedRequested) return false;
    if (normalizedCandidate.startsWith(normalizedRequested)) return true;
    if (normalizedCandidate.includes(normalizedRequested)) return true;
    return similarity(requested, candidate) >= (lenient ? 0.34 : 0.6);
}

/** « DAMASIO, Alain » → « Alain Damasio », « ALAIN DAMASIO » → « Alain Damasio ». */
function normalizeAuthor(value: string): string {
    const trimmed = value.replace(/\s+/g, " ").trim();
    if (!trimmed) return "";

    if (trimmed.includes(",")) {
        const [last, first] = trimmed.split(",").map((part) => part.trim());
        if (last && first) return `${titleCase(first)} ${titleCase(last)}`;
    }

    if (trimmed === trimmed.toUpperCase()) return titleCase(trimmed);
    return trimmed;
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

function cleanCoverUrl(value: string): string {
    return value
        .replace(/^http:/, "https:")
        .replace(/&edge=curl/g, "")
        .replace(/zoom=\d/, "zoom=2");
}

function unique(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        if (!value) continue;
        const url = value.trim();
        if (!/^https?:\/\//i.test(url)) continue;
        if (seen.has(url)) continue;
        seen.add(url);
        result.push(url);
    }
    return result;
}

function readableTitle(title?: string, subtitle?: string): string {
    return [title?.trim(), subtitle?.trim()].filter(Boolean).join(" : ").slice(0, 160);
}

async function googleBooksLookup(
    title: string,
    author: string | null,
    lenient = false
): Promise<BookLookup> {
    const params = new URLSearchParams({
        q: `intitle:${title}${author ? ` inauthor:${author}` : ""}`,
        maxResults: "3",
        fields: "items(volumeInfo(title,subtitle,authors,imageLinks))",
    });
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`);
    if (!response.ok) return EMPTY_LOOKUP;

    const data = (await response.json()) as {
        items?: {
            volumeInfo?: {
                title?: string;
                subtitle?: string;
                authors?: string[];
                imageLinks?: {
                    extraLarge?: string;
                    large?: string;
                    medium?: string;
                    thumbnail?: string;
                    smallThumbnail?: string;
                };
            };
        }[];
    };

    const covers: string[] = [];
    let matched: { title: string; authors: string[] } | null = null;

    for (const item of data.items ?? []) {
        const info = item.volumeInfo;
        if (!info) continue;
        const candidate = readableTitle(info.title, info.subtitle);
        if (!credible(title, candidate, lenient)) continue;

        if (!matched) {
            matched = {
                title: candidate,
                authors: (info.authors ?? [])
                    .map(normalizeAuthor)
                    .filter((value) => Boolean(value))
                    .slice(0, 3),
            };
        }

        const links = info.imageLinks;
        for (const link of [
            links?.extraLarge,
            links?.large,
            links?.medium,
            links?.thumbnail,
            links?.smallThumbnail,
        ]) {
            if (link) covers.push(cleanCoverUrl(link));
        }
    }

    return {
        title: matched?.title ?? null,
        authors: matched?.authors ?? [],
        covers: unique(covers).slice(0, 5),
    };
}

async function openLibraryLookup(
    title: string,
    author: string | null,
    lenient = false
): Promise<BookLookup> {
    const params = new URLSearchParams({
        title,
        limit: "3",
        fields: "title,subtitle,author_name,cover_i,isbn",
    });
    if (author) params.set("author", author);

    const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
    if (!response.ok) return EMPTY_LOOKUP;

    const data = (await response.json()) as {
        docs?: {
            title?: string;
            subtitle?: string;
            author_name?: string[];
            cover_i?: number;
            isbn?: string[];
        }[];
    };

    const covers: string[] = [];
    let matched: { title: string; authors: string[] } | null = null;

    for (const doc of data.docs ?? []) {
        const candidate = readableTitle(doc.title, doc.subtitle);
        if (!credible(title, candidate, lenient)) continue;

        if (!matched) {
            matched = {
                title: candidate,
                authors: (doc.author_name ?? [])
                    .map(normalizeAuthor)
                    .filter((value) => Boolean(value))
                    .slice(0, 3),
            };
        }

        if (doc.cover_i) {
            covers.push(`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`);
        }
        const isbn = doc.isbn?.find((value) => value.length >= 10);
        if (isbn) {
            covers.push(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`);
        }
    }

    return {
        title: matched?.title ?? null,
        authors: matched?.authors ?? [],
        covers: unique(covers).slice(0, 5),
    };
}

/** Place en premier l'auteur déjà cité dans l'email (si le catalogue le connaît). */
function reorderAuthors(authors: string[], requested: string | null): string[] {
    if (!requested || !requested.trim() || authors.length < 2) return authors;
    return [...authors].sort((a, b) => similarity(requested, b) - similarity(requested, a));
}

function mergeLookups(base: BookLookup, extra: BookLookup): BookLookup {
    return {
        title: base.title ?? extra.title,
        authors: base.authors.length > 0 ? base.authors : extra.authors,
        covers: unique([...base.covers, ...extra.covers]).slice(0, 5),
    };
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

        const attempts: Array<() => Promise<BookLookup>> = [
            () => googleBooksLookup(title, author),
            () => googleBooksLookup(title, null),
            () => openLibraryLookup(title, author),
            () => openLibraryLookup(title, null),
            () => openLibraryLookup(title, null, true),
        ];

        for (const attempt of attempts) {
            if (result.covers.length > 0) break;
            try {
                const found = await attempt();
                result = mergeLookups(result, found);
            } catch {
                // source indisponible : on passe à la suivante
            }
        }

        result = { ...result, authors: reorderAuthors(result.authors, author) };
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

/* ----------------------------- Affichage des images ----------------------------- */

const PROXYABLE_COVER = /^https?:\/\/([a-z0-9-]+\.)*(openlibrary\.org|archive\.org|google\.com|googleusercontent\.com)\//i;

/**
 * Les couvertures sont servies par notre propre route `/api/cover` : cela évite
 * les blocages de hotlink et les redirections refusées par le navigateur.
 * Un lien saisi à la main sur un autre domaine est utilisé tel quel.
 */
export function coverSrc(url: string | null | undefined): string | null {
    if (!url) return null;
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) return null;
    return PROXYABLE_COVER.test(trimmed)
        ? `/api/cover?url=${encodeURIComponent(trimmed)}`
        : trimmed;
}
