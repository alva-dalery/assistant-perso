import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

interface BookLookupResult {
    title: string | null;
    authors: string[];
    covers: string[];
}

const EMPTY_LOOKUP: BookLookupResult = { title: null, authors: [], covers: [] };

const BROWSER_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BLOCKED_IMAGE_DOMAINS = [
    "shutterstock.com",
    "alamy.com",
    "gettyimages.",
    "istockphoto.com",
    "dreamstime.com",
    "123rf.com",
    "depositphotos.com",
];

function normalize(value: string): string {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function stripTruncation(value: string): { text: string; truncated: boolean } {
    const trimmed = value.trim();
    const truncated = /(?:\.\.\.|…|\[\.\.\.\])$/.test(trimmed);
    const text = trimmed
        .replace(/(?:\.\.\.|…|\[\.\.\.\])+$/g, "")
        .replace(/[:\-–—/,;\s]+$/g, "")
        .trim();
    return { text, truncated };
}

function prepareTitleVariants(raw: string): string[] {
    const { text, truncated } = stripTruncation(raw);
    if (!text) return [];

    const variants: string[] = [text];
    const words = text.split(/\s+/).filter(Boolean);

    // Si le titre est coupé (ou contient plusieurs mots), le dernier mot peut être tronqué
    if ((truncated || words.length >= 4) && words.length >= 3) {
        const withoutLast = words.slice(0, -1).join(" ");
        if (withoutLast.length >= 4) variants.push(withoutLast);
    }

    // Si un sous-titre coupé suit « : », « / » ou « - », garder le titre principal
    const main = text.split(/\s*(?::|\/| - )\s*/)[0]?.trim();
    if (main && main !== text && main.length >= 4) {
        variants.push(main);
    }

    return Array.from(new Set(variants));
}

function prepareAuthor(raw: string | null): { search: string | null; rawNorm: string } {
    if (!raw || !raw.trim()) return { search: null, rawNorm: "" };
    const { text, truncated } = stripTruncation(raw);
    if (!text) return { search: null, rawNorm: "" };

    if (text.includes(",")) {
        const [lastRaw, firstRaw] = text.split(",").map((part) => part.trim());
        const last = lastRaw ? titleCase(lastRaw) : "";
        const first = firstRaw ? titleCase(firstRaw) : "";
        // Si le prénom est tronqué (ex: « DAMASIO, Al... » ou « LALLEMAND, O. »), ne chercher que le nom
        if (last && (!first || truncated || first.replace(/\./g, "").length <= 2)) {
            return { search: last, rawNorm: normalize(last) };
        }
        if (last && first) {
            const combined = `${first} ${last}`;
            return { search: combined, rawNorm: normalize(combined) };
        }
    }

    const words = text.split(/\s+/).filter(Boolean);
    if (truncated && words.length >= 2) {
        const withoutLast = words.slice(0, -1).join(" ");
        return { search: withoutLast, rawNorm: normalize(text) };
    }

    // Un seul mot coupé (ex: « Damas... ») : utile pour filtrer les candidats, mais pas pour un filtre strict
    if (truncated && words.length === 1) {
        return { search: null, rawNorm: normalize(text) };
    }

    const formatted = text === text.toUpperCase() ? titleCase(text) : text;
    return { search: formatted, rawNorm: normalize(formatted) };
}

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

function credible(requested: string, candidate: string, lenient = false): boolean {
    if (!candidate.trim()) return false;
    const { text } = stripTruncation(requested);
    const normalizedRequested = normalize(text);
    const normalizedCandidate = normalize(candidate);
    if (!normalizedRequested) return false;
    if (normalizedCandidate.startsWith(normalizedRequested)) return true;
    if (normalizedCandidate.includes(normalizedRequested)) return true;

    // Gestion d'un dernier mot coupé (ex: « la horde du contrev » vs « la horde du contrevent »)
    const reqWords = normalizedRequested.split(" ").filter(Boolean);
    const candWords = normalizedCandidate.split(" ").filter(Boolean);
    if (reqWords.length >= 2 && candWords.length >= reqWords.length) {
        const lastReq = reqWords[reqWords.length - 1];
        const prefixWords = reqWords.slice(0, -1).filter((w) => w.length > 2);
        const allPrefixPresent = prefixWords.every((w) => candWords.includes(w));
        const lastMatchesPrefix = candWords.some((w) => w.startsWith(lastReq));
        if (allPrefixPresent && lastMatchesPrefix && (prefixWords.length > 0 || lastReq.length >= 3)) {
            return true;
        }
    }

    return similarity(text, candidate) >= (lenient ? 0.34 : 0.6);
}

function authorMatches(rawAuthorNorm: string, candidateAuthors: string[]): boolean {
    if (!rawAuthorNorm || candidateAuthors.length === 0) return false;
    const reqTokens = rawAuthorNorm.split(" ").filter((t) => t.length >= 2);
    if (reqTokens.length === 0) return false;
    return candidateAuthors.some((cand) => {
        const candNorm = normalize(cand);
        const candWords = candNorm.split(" ");
        return reqTokens.some((tok) => candWords.some((cw) => cw.startsWith(tok)));
    });
}

function titleCase(value: string): string {
    if (value !== value.toUpperCase()) return value;
    return value
        .toLowerCase()
        .replace(/(^|[\s'’\-])([a-zà-ÿ])/g, (_match, prefix: string, letter: string) => {
            return `${prefix}${letter.toUpperCase()}`;
        });
}

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

function readableTitle(title?: string, subtitle?: string): string {
    return [title?.trim(), subtitle?.trim()].filter(Boolean).join(" : ").slice(0, 160);
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

function mergeLookups(base: BookLookupResult, extra: BookLookupResult): BookLookupResult {
    return {
        title: base.title ?? extra.title,
        authors: base.authors.length > 0 ? base.authors : extra.authors,
        covers: unique([...base.covers, ...extra.covers]).slice(0, 6),
    };
}

function reorderAuthors(authors: string[], requested: string | null): string[] {
    if (!requested || !requested.trim() || authors.length < 2) return authors;
    return [...authors].sort((a, b) => similarity(requested, b) - similarity(requested, a));
}

async function itunesLookup(
    queryTitle: string,
    originalTitle: string,
    author: string | null,
    rawAuthorNorm: string
): Promise<BookLookupResult> {
    const term = [queryTitle, author].filter(Boolean).join(" ");
    const params = new URLSearchParams({
        term,
        country: "fr",
        media: "ebook",
        limit: "5",
    });
    const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`, {
        signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return EMPTY_LOOKUP;

    const data = (await response.json()) as {
        results?: Array<{
            trackName?: string;
            artistName?: string;
            artworkUrl100?: string;
        }>;
    };

    const items = (data.results ?? [])
        .map((item) => {
            const candidate = (item.trackName ?? "").trim();
            const authors = item.artistName
                ? item.artistName
                      .split(/[,&]/)
                      .map(normalizeAuthor)
                      .filter(Boolean)
                      .slice(0, 3)
                : [];
            return { item, candidate, authors };
        })
        .filter(({ candidate }) => credible(originalTitle, candidate));

    // Préférer les résultats qui correspondent aussi à l'auteur (même tronqué)
    items.sort(
        (a, b) =>
            Number(authorMatches(rawAuthorNorm, b.authors)) -
            Number(authorMatches(rawAuthorNorm, a.authors))
    );

    const covers: string[] = [];
    let matched: { title: string; authors: string[] } | null = null;

    for (const { item, candidate, authors } of items) {
        if (!matched) {
            matched = { title: candidate.slice(0, 160), authors };
        }
        if (item.artworkUrl100) {
            covers.push(item.artworkUrl100.replace(/\/100x100bb\./, "/600x600bb."));
        }
    }

    return {
        title: matched?.title ?? null,
        authors: matched?.authors ?? [],
        covers: unique(covers).slice(0, 4),
    };
}

async function openLibraryLookup(
    queryTitle: string,
    originalTitle: string,
    author: string | null,
    rawAuthorNorm: string,
    options?: { lenient?: boolean; generalQuery?: boolean }
): Promise<BookLookupResult> {
    const params = new URLSearchParams({
        limit: "4",
        fields: "title,subtitle,author_name,cover_i,isbn",
    });
    if (options?.generalQuery) {
        params.set("q", [queryTitle, author].filter(Boolean).join(" "));
    } else {
        params.set("title", queryTitle);
        if (author) params.set("author", author);
    }

    const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`, {
        signal: AbortSignal.timeout(6_000),
    });
    if (!response.ok) return EMPTY_LOOKUP;

    const data = (await response.json()) as {
        docs?: Array<{
            title?: string;
            subtitle?: string;
            author_name?: string[];
            cover_i?: number;
            isbn?: string[];
        }>;
    };

    const docs = (data.docs ?? [])
        .map((doc) => {
            const candidate = readableTitle(doc.title, doc.subtitle);
            const authors = (doc.author_name ?? [])
                .map(normalizeAuthor)
                .filter(Boolean)
                .slice(0, 3);
            return { doc, candidate, authors };
        })
        .filter(({ candidate }) => credible(originalTitle, candidate, options?.lenient));

    docs.sort(
        (a, b) =>
            Number(authorMatches(rawAuthorNorm, b.authors)) -
            Number(authorMatches(rawAuthorNorm, a.authors))
    );

    const covers: string[] = [];
    let matched: { title: string; authors: string[] } | null = null;

    for (const { doc, candidate, authors } of docs) {
        if (!matched) {
            matched = { title: candidate, authors };
        }
        if (doc.cover_i) {
            covers.push(`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false`);
        }
        const isbn = doc.isbn?.find((value) => value.length >= 10);
        if (isbn) {
            covers.push(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`);
        }
    }

    return {
        title: matched?.title ?? null,
        authors: matched?.authors ?? [],
        covers: unique(covers).slice(0, 4),
    };
}

async function googleBooksLookup(
    queryTitle: string,
    originalTitle: string,
    author: string | null
): Promise<BookLookupResult> {
    const params = new URLSearchParams({
        q: `intitle:${queryTitle}${author ? ` inauthor:${author}` : ""}`,
        maxResults: "3",
        fields: "items(volumeInfo(title,subtitle,authors,imageLinks))",
    });
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`, {
        signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return EMPTY_LOOKUP;

    const data = (await response.json()) as {
        items?: Array<{
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
        }>;
    };

    const covers: string[] = [];
    let matched: { title: string; authors: string[] } | null = null;

    for (const item of data.items ?? []) {
        const info = item.volumeInfo;
        if (!info) continue;
        const candidate = readableTitle(info.title, info.subtitle);
        if (!credible(originalTitle, candidate)) continue;

        if (!matched) {
            matched = {
                title: candidate,
                authors: (info.authors ?? [])
                    .map(normalizeAuthor)
                    .filter(Boolean)
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
            if (link) {
                covers.push(
                    link
                        .replace(/^http:/, "https:")
                        .replace(/&edge=curl/g, "")
                        .replace(/zoom=\d/, "zoom=2")
                );
            }
        }
    }

    return {
        title: matched?.title ?? null,
        authors: matched?.authors ?? [],
        covers: unique(covers).slice(0, 4),
    };
}

async function duckDuckGoImageLookup(title: string, author: string | null): Promise<BookLookupResult> {
    const query = [title, author, "livre couverture"].filter(Boolean).join(" ");
    const pageResponse = await fetch(
        `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
        {
            headers: { "User-Agent": BROWSER_UA },
            signal: AbortSignal.timeout(5_000),
        }
    );
    if (!pageResponse.ok) return EMPTY_LOOKUP;

    const html = await pageResponse.text();
    const vqd = (html.match(/vqd=["']?([^"&']+)/) || html.match(/vqd=([0-9-]+)/))?.[1];
    if (!vqd) return EMPTY_LOOKUP;

    const imgResponse = await fetch(
        `https://duckduckgo.com/i.js?l=fr-fr&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&f=,,,,,&p=1`,
        {
            headers: {
                "User-Agent": BROWSER_UA,
                Referer: "https://duckduckgo.com/",
            },
            signal: AbortSignal.timeout(5_000),
        }
    );
    if (!imgResponse.ok) return EMPTY_LOOKUP;

    const data = (await imgResponse.json()) as {
        results?: Array<{
            image?: string;
            width?: number;
            height?: number;
        }>;
    };

    const covers: string[] = [];
    for (const item of data.results ?? []) {
        const url = item.image;
        if (!url || !/^https?:\/\//i.test(url)) continue;
        const lower = url.toLowerCase();
        if (BLOCKED_IMAGE_DOMAINS.some((domain) => lower.includes(domain))) continue;
        if (item.width && item.height && item.width / item.height > 2.0) continue;
        covers.push(url);
        if (covers.length >= 5) break;
    }

    return { title: null, authors: [], covers: unique(covers) };
}

const SERVER_CACHE = new Map<string, BookLookupResult>();
const MAX_CACHE_ENTRIES = 500;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const title = (searchParams.get("title") ?? "").trim();
    const author = (searchParams.get("author") ?? "").trim() || null;
    const force = searchParams.get("force") === "1";

    if (!title) {
        return NextResponse.json(EMPTY_LOOKUP);
    }

    const cacheKey = `${normalize(title)}|${normalize(author ?? "")}`;
    if (!force) {
        const cached = SERVER_CACHE.get(cacheKey);
        if (cached) return NextResponse.json(cached);
    } else {
        SERVER_CACHE.delete(cacheKey);
    }

    const titleVariants = prepareTitleVariants(title);
    const { search: cleanAuthor, rawNorm: rawAuthorNorm } = prepareAuthor(author);

    let result = EMPTY_LOOKUP;

    const attempts: Array<() => Promise<BookLookupResult>> = [];

    // 1. Apple Books FR : essai avec les variantes de titre (avec puis sans auteur)
    for (const variant of titleVariants.slice(0, 2)) {
        if (cleanAuthor) {
            attempts.push(() => itunesLookup(variant, title, cleanAuthor, rawAuthorNorm));
        }
        attempts.push(() => itunesLookup(variant, title, null, rawAuthorNorm));
    }

    // 2. Open Library : recherche par titre puis recherche libre (?q=), tolérante aux coupures
    for (const variant of titleVariants.slice(0, 2)) {
        if (cleanAuthor) {
            attempts.push(() =>
                openLibraryLookup(variant, title, cleanAuthor, rawAuthorNorm, { generalQuery: true })
            );
        }
        attempts.push(() => openLibraryLookup(variant, title, null, rawAuthorNorm));
    }

    // 3. Google Books (si disponible)
    attempts.push(() => googleBooksLookup(titleVariants[0] ?? title, title, cleanAuthor));

    // 4. Recherche d'images sur internet (avec le titre/auteur complets si déjà trouvés)
    attempts.push(() =>
        duckDuckGoImageLookup(
            result.title ?? titleVariants[0] ?? title,
            result.authors[0] ?? cleanAuthor
        )
    );

    // 5. Dernier recours souple sur Open Library
    attempts.push(() =>
        openLibraryLookup(titleVariants[titleVariants.length - 1] ?? title, title, null, rawAuthorNorm, {
            lenient: true,
            generalQuery: true,
        })
    );

    for (const attempt of attempts) {
        if (result.covers.length >= 2 && result.title && result.authors.length > 0) break;
        try {
            const found = await attempt();
            result = mergeLookups(result, found);
        } catch {
            // Source indisponible ou expirée : on passe à la suivante.
        }
    }

    result = { ...result, authors: reorderAuthors(result.authors, cleanAuthor ?? author) };

    if (SERVER_CACHE.size >= MAX_CACHE_ENTRIES) {
        const firstKey = SERVER_CACHE.keys().next().value;
        if (firstKey !== undefined) SERVER_CACHE.delete(firstKey);
    }
    SERVER_CACHE.set(cacheKey, result);

    return NextResponse.json(result);
}
