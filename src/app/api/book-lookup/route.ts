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
    const normalizedRequested = normalize(requested);
    const normalizedCandidate = normalize(candidate);
    if (!normalizedRequested) return false;
    if (normalizedCandidate.startsWith(normalizedRequested)) return true;
    if (normalizedCandidate.includes(normalizedRequested)) return true;
    return similarity(requested, candidate) >= (lenient ? 0.34 : 0.6);
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

async function itunesLookup(title: string, author: string | null): Promise<BookLookupResult> {
    const term = [title, author].filter(Boolean).join(" ");
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

    const covers: string[] = [];
    let matched: { title: string; authors: string[] } | null = null;

    for (const item of data.results ?? []) {
        const candidate = (item.trackName ?? "").trim();
        if (!credible(title, candidate)) continue;

        if (!matched) {
            matched = {
                title: candidate.slice(0, 160),
                authors: item.artistName
                    ? item.artistName
                          .split(/[,&]/)
                          .map(normalizeAuthor)
                          .filter(Boolean)
                          .slice(0, 3)
                    : [],
            };
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
    title: string,
    author: string | null,
    lenient = false
): Promise<BookLookupResult> {
    const params = new URLSearchParams({
        title,
        limit: "3",
        fields: "title,subtitle,author_name,cover_i,isbn",
    });
    if (author) params.set("author", author);

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
                    .filter(Boolean)
                    .slice(0, 3),
            };
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

async function googleBooksLookup(title: string, author: string | null): Promise<BookLookupResult> {
    const params = new URLSearchParams({
        q: `intitle:${title}${author ? ` inauthor:${author}` : ""}`,
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
        if (!credible(title, candidate)) continue;

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

    let result = EMPTY_LOOKUP;

    const attempts: Array<() => Promise<BookLookupResult>> = [
        () => itunesLookup(title, author),
        () => openLibraryLookup(title, author),
        () => openLibraryLookup(title, null),
        () => googleBooksLookup(title, author),
        () => duckDuckGoImageLookup(title, author),
        () => openLibraryLookup(title, null, true),
    ];

    for (const attempt of attempts) {
        if (result.covers.length >= 3) break;
        try {
            const found = await attempt();
            result = mergeLookups(result, found);
        } catch {
            // Source indisponible ou expirée : on passe à la suivante.
        }
    }

    result = { ...result, authors: reorderAuthors(result.authors, author) };

    if (SERVER_CACHE.size >= MAX_CACHE_ENTRIES) {
        const firstKey = SERVER_CACHE.keys().next().value;
        if (firstKey !== undefined) SERVER_CACHE.delete(firstKey);
    }
    SERVER_CACHE.set(cacheKey, result);

    return NextResponse.json(result);
}
