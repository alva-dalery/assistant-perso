"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    BookOpen,
    CalendarDays,
    ExternalLink,
    Film,
    Loader2,
    MapPin,
    Plus,
    Search,
    Trash2,
    X,
} from "lucide-react";
import type { BookItem, CultureStatus, ExpoItem, MovieItem } from "@/types";
import { initialBooks, initialExpos, initialMovies } from "@/lib/initialCultureData";

const STORAGE_KEY = "assistantPerso.culture.v1";

const BOOK_STATUS_LABEL: Record<CultureStatus, string> = {
    wishlist: "À lire",
    reading: "En cours",
    owned: "Ma bibliothèque",
};

const MOVIE_STATUS_LABEL: Record<CultureStatus, string> = {
    wishlist: "À voir",
    reading: "En cours",
    owned: "Ma collection",
};

const STATUS_STYLE: Record<CultureStatus, string> = {
    wishlist: "bg-sky-50 text-sky-700 border-sky-200",
    reading: "bg-teal-50 text-teal-700 border-teal-200",
    owned: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

interface StoredCulture {
    books: BookItem[];
    movies: MovieItem[];
    expos: ExpoItem[];
}

function formatDate(value: string): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function newId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Couverture avec repli élégant si l'image est absente ou cassée. */
const Cover: React.FC<{
    url?: string;
    title: string;
    className?: string;
}> = ({ url, title, className = "" }) => {
    const [broken, setBroken] = useState(false);

    return (
        <div
            className={`relative overflow-hidden bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 ${className}`}
        >
            {url && !broken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={url}
                    alt={`Couverture de ${title}`}
                    loading="lazy"
                    onError={() => setBroken(true)}
                    className="h-full w-full object-cover"
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center p-3 text-center text-[11px] font-bold leading-snug text-white/90">
                    {title}
                </div>
            )}
        </div>
    );
};

export const CultureModule: React.FC = () => {
    const [tab, setTab] = useState<"expos" | "books" | "movies">("books");
    const [books, setBooks] = useState<BookItem[]>(initialBooks);
    const [movies, setMovies] = useState<MovieItem[]>(initialMovies);
    const [expos, setExpos] = useState<ExpoItem[]>(initialExpos);

    const [bookFilter, setBookFilter] = useState<"all" | CultureStatus>("all");
    const [movieFilter, setMovieFilter] = useState<"all" | CultureStatus>("all");
    const [cityFilter, setCityFilter] = useState("");

    const [feedback, setFeedback] = useState<string | null>(null);
    const hydrated = useRef(false);

    // Formulaires
    const [showBookForm, setShowBookForm] = useState(false);
    const [bookTitle, setBookTitle] = useState("");
    const [bookAuthor, setBookAuthor] = useState("");
    const [bookIsbn, setBookIsbn] = useState("");
    const [bookCover, setBookCover] = useState("");
    const [bookStatus, setBookStatus] = useState<CultureStatus>("wishlist");
    const [bookSearching, setBookSearching] = useState(false);

    const [showMovieForm, setShowMovieForm] = useState(false);
    const [movieTitle, setMovieTitle] = useState("");
    const [movieDirector, setMovieDirector] = useState("");
    const [movieYear, setMovieYear] = useState("");
    const [movieCover, setMovieCover] = useState("");
    const [movieStatus, setMovieStatus] = useState<CultureStatus>("wishlist");
    const [movieSearching, setMovieSearching] = useState(false);

    const [showExpoForm, setShowExpoForm] = useState(false);
    const [expoTitle, setExpoTitle] = useState("");
    const [expoVenue, setExpoVenue] = useState("");
    const [expoCity, setExpoCity] = useState("Nouméa");
    const [expoStart, setExpoStart] = useState("");
    const [expoEnd, setExpoEnd] = useState("");
    const [expoLink, setExpoLink] = useState("");
    const [expoImage, setExpoImage] = useState("");

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<StoredCulture>;
                if (Array.isArray(parsed.books)) setBooks(parsed.books);
                if (Array.isArray(parsed.movies)) setMovies(parsed.movies);
                if (Array.isArray(parsed.expos)) setExpos(parsed.expos);
            }
        } catch {
            // stockage indisponible : on garde les données de démarrage
        }
        hydrated.current = true;
    }, []);

    useEffect(() => {
        if (!hydrated.current) return;
        try {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ books, movies, expos } satisfies StoredCulture)
            );
        } catch {
            // quota / navigation privée : on ignore
        }
    }, [books, movies, expos]);

    useEffect(() => {
        if (!feedback) return;
        const timer = setTimeout(() => setFeedback(null), 4500);
        return () => clearTimeout(timer);
    }, [feedback]);

    const filteredBooks = useMemo(
        () => (bookFilter === "all" ? books : books.filter((book) => book.status === bookFilter)),
        [books, bookFilter]
    );
    const filteredMovies = useMemo(
        () => (movieFilter === "all" ? movies : movies.filter((movie) => movie.status === movieFilter)),
        [movies, movieFilter]
    );
    const filteredExpos = useMemo(() => {
        const city = cityFilter.trim().toLowerCase();
        if (!city) return expos;
        return expos.filter(
            (expo) =>
                expo.city.toLowerCase().includes(city) || expo.venue.toLowerCase().includes(city)
        );
    }, [expos, cityFilter]);

    const addBook = () => {
        if (!bookTitle.trim()) {
            setFeedback("Indiquez au moins le titre du livre.");
            return;
        }
        setBooks((previous) => [
            {
                id: newId("book"),
                title: bookTitle.trim(),
                author: bookAuthor.trim(),
                isbn: bookIsbn.trim() || undefined,
                coverUrl: bookCover.trim() || undefined,
                status: bookStatus,
            },
            ...previous,
        ]);
        setBookTitle("");
        setBookAuthor("");
        setBookIsbn("");
        setBookCover("");
        setBookStatus("wishlist");
        setShowBookForm(false);
        setFeedback("Livre ajouté.");
    };

    const addMovie = () => {
        if (!movieTitle.trim()) {
            setFeedback("Indiquez au moins le titre du film.");
            return;
        }
        setMovies((previous) => [
            {
                id: newId("movie"),
                title: movieTitle.trim(),
                director: movieDirector.trim() || undefined,
                year: movieYear.trim() || undefined,
                coverUrl: movieCover.trim() || undefined,
                status: movieStatus,
            },
            ...previous,
        ]);
        setMovieTitle("");
        setMovieDirector("");
        setMovieYear("");
        setMovieCover("");
        setMovieStatus("wishlist");
        setShowMovieForm(false);
        setFeedback("Film ajouté.");
    };

    const addExpo = () => {
        if (!expoTitle.trim() || !expoCity.trim()) {
            setFeedback("Indiquez le titre et la ville de l'exposition.");
            return;
        }
        setExpos((previous) => [
            {
                id: newId("expo"),
                title: expoTitle.trim(),
                venue: expoVenue.trim(),
                city: expoCity.trim(),
                startDate: expoStart,
                endDate: expoEnd,
                link: expoLink.trim() || undefined,
                imageUrl: expoImage.trim() || undefined,
            },
            ...previous,
        ]);
        setExpoTitle("");
        setExpoVenue("");
        setExpoStart("");
        setExpoEnd("");
        setExpoLink("");
        setExpoImage("");
        setShowExpoForm(false);
        setFeedback("Exposition ajoutée.");
    };

    const lookupBook = async () => {
        const query = bookIsbn.trim()
            ? `isbn:${bookIsbn.trim()}`
            : bookTitle.trim()
                ? `intitle:${encodeURIComponent(bookTitle.trim())}`
                : "";
        if (!query) {
            setFeedback("Renseignez un titre ou un ISBN pour chercher la couverture.");
            return;
        }

        setBookSearching(true);
        try {
            const response = await fetch(
                `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`
            );
            const data = (await response.json()) as {
                items?: Array<{
                    volumeInfo?: {
                        title?: string;
                        authors?: string[];
                        imageLinks?: { thumbnail?: string; smallThumbnail?: string };
                    };
                }>;
            };
            const info = data.items?.[0]?.volumeInfo;
            const thumbnail = info?.imageLinks?.thumbnail || info?.imageLinks?.smallThumbnail;

            if (!info || !thumbnail) {
                setFeedback("Aucune couverture trouvée. Collez une URL d'image à la place.");
                return;
            }
            if (!bookAuthor.trim() && info.authors?.length) {
                setBookAuthor(info.authors.join(", "));
            }
            setBookCover(thumbnail.replace("http://", "https://").replace("&zoom=1", "&zoom=2"));
            setFeedback(`Couverture trouvée : ${info.title ?? "livre"}.`);
        } catch {
            setFeedback("Recherche indisponible. Collez l'URL de la couverture.");
        } finally {
            setBookSearching(false);
        }
    };

    const lookupMovie = async () => {
        if (!movieTitle.trim()) {
            setFeedback("Renseignez le titre du film pour chercher l'affiche.");
            return;
        }

        setMovieSearching(true);
        try {
            const response = await fetch(
                `https://itunes.apple.com/search?term=${encodeURIComponent(
                    movieTitle.trim()
                )}&media=movie&limit=1`
            );
            const data = (await response.json()) as {
                results?: Array<{
                    trackName?: string;
                    artistName?: string;
                    releaseDate?: string;
                    artworkUrl100?: string;
                }>;
            };
            const result = data.results?.[0];
            if (!result?.artworkUrl100) {
                setFeedback("Aucune affiche trouvée. Collez une URL d'image.");
                return;
            }
            setMovieCover(result.artworkUrl100.replace("100x100", "600x600"));
            if (!movieDirector.trim() && result.artistName) setMovieDirector(result.artistName);
            if (!movieYear.trim() && result.releaseDate) setMovieYear(result.releaseDate.slice(0, 4));
            setFeedback(`Affiche trouvée : ${result.trackName ?? "film"}.`);
        } catch {
            setFeedback("Recherche indisponible. Collez l'URL de l'affiche.");
        } finally {
            setMovieSearching(false);
        }
    };

    const webSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(
        `expositions ${cityFilter.trim() || "Nouméa"} ${new Date().getFullYear()}`
    )}`;

    return (
        <div className="space-y-6">
            {/* En-tête */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm">
                <div>
                    <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-indigo-600" />
                        <span>Culture</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                        Expositions près de chez vous, livres et films — rangés par couvertures.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">
                        {expos.length} exposition{expos.length > 1 ? "s" : ""}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-bold">
                        {books.length} livre{books.length > 1 ? "s" : ""}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                        {movies.length} film{movies.length > 1 ? "s" : ""}
                    </span>
                </div>
            </div>

            {feedback && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
                    {feedback}
                </div>
            )}

            {/* Onglets */}
            <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-slate-100/80 border border-slate-200/60 w-fit">
                {(
                    [
                        ["books", `Livres (${books.length})`, BookOpen],
                        ["movies", `Films (${movies.length})`, Film],
                        ["expos", `Expositions (${expos.length})`, MapPin],
                    ] as const
                ).map(([value, label, Icon]) => (
                    <button
                        key={value}
                        onClick={() => setTab(value)}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] font-bold transition-all ${tab === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                            }`}
                    >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{label}</span>
                    </button>
                ))}
            </div>

            {/* LIVRES */}
            {tab === "books" && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                            {(
                                [
                                    ["all", `Tous (${books.length})`],
                                    ["wishlist", `À lire (${books.filter((b) => b.status === "wishlist").length})`],
                                    ["reading", `En cours (${books.filter((b) => b.status === "reading").length})`],
                                    ["owned", `Ma bibliothèque (${books.filter((b) => b.status === "owned").length})`],
                                ] as const
                            ).map(([value, label]) => (
                                <button
                                    key={value}
                                    onClick={() => setBookFilter(value)}
                                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${bookFilter === value
                                            ? "bg-slate-900 text-white border-slate-900"
                                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => setShowBookForm((value) => !value)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all"
                        >
                            {showBookForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            <span>{showBookForm ? "Fermer" : "Ajouter un livre"}</span>
                        </button>
                    </div>

                    {showBookForm && (
                        <div className="p-5 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <input
                                    value={bookTitle}
                                    onChange={(event) => setBookTitle(event.target.value)}
                                    placeholder="Titre *"
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                />
                                <input
                                    value={bookAuthor}
                                    onChange={(event) => setBookAuthor(event.target.value)}
                                    placeholder="Auteur"
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                />
                                <input
                                    value={bookIsbn}
                                    onChange={(event) => setBookIsbn(event.target.value)}
                                    placeholder="ISBN (facultatif, pour la couverture)"
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                />
                                <input
                                    value={bookCover}
                                    onChange={(event) => setBookCover(event.target.value)}
                                    placeholder="URL de la couverture"
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                />
                                <select
                                    value={bookStatus}
                                    onChange={(event) => setBookStatus(event.target.value as CultureStatus)}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                >
                                    <option value="wishlist">À lire</option>
                                    <option value="reading">En cours de lecture</option>
                                    <option value="owned">Je l'ai déjà</option>
                                </select>
                                <button
                                    onClick={() => void lookupBook()}
                                    disabled={bookSearching}
                                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold hover:bg-indigo-100 disabled:opacity-60"
                                >
                                    {bookSearching ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Search className="h-3.5 w-3.5" />
                                    )}
                                    <span>Chercher la couverture</span>
                                </button>
                            </div>
                            <button
                                onClick={addBook}
                                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
                            >
                                Ajouter le livre
                            </button>
                        </div>
                    )}

                    {filteredBooks.length === 0 && (
                        <p className="text-xs text-slate-500 p-4">Aucun livre dans cette catégorie.</p>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {filteredBooks.map((book) => (
                            <div
                                key={book.id}
                                className="group rounded-2xl bg-white border border-slate-200/70 shadow-sm overflow-hidden"
                            >
                                <div className="relative">
                                    <Cover url={book.coverUrl} title={book.title} className="aspect-[2/3]" />
                                    <button
                                        onClick={() => setBooks((previous) => previous.filter((item) => item.id !== book.id))}
                                        title="Retirer ce livre"
                                        aria-label="Retirer ce livre"
                                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <div className="p-3 space-y-1.5">
                                    <p className="text-xs font-extrabold text-slate-900 leading-snug line-clamp-2">
                                        {book.title}
                                    </p>
                                    <p className="text-[11px] text-slate-500 truncate">{book.author || "Auteur inconnu"}</p>
                                    <select
                                        value={book.status}
                                        onChange={(event) =>
                                            setBooks((previous) =>
                                                previous.map((item) =>
                                                    item.id === book.id
                                                        ? { ...item, status: event.target.value as CultureStatus }
                                                        : item
                                                )
                                            )
                                        }
                                        className={`w-full text-[10px] font-bold rounded-lg border px-2 py-1 ${STATUS_STYLE[book.status]}`}
                                    >
                                        <option value="wishlist">{BOOK_STATUS_LABEL.wishlist}</option>
                                        <option value="reading">{BOOK_STATUS_LABEL.reading}</option>
                                        <option value="owned">{BOOK_STATUS_LABEL.owned}</option>
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* FILMS */}
            {tab === "movies" && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                            {(
                                [
                                    ["all", `Tous (${movies.length})`],
                                    ["wishlist", `À voir (${movies.filter((m) => m.status === "wishlist").length})`],
                                    ["reading", `En cours (${movies.filter((m) => m.status === "reading").length})`],
                                    ["owned", `Ma collection (${movies.filter((m) => m.status === "owned").length})`],
                                ] as const
                            ).map(([value, label]) => (
                                <button
                                    key={value}
                                    onClick={() => setMovieFilter(value)}
                                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${movieFilter === value
                                            ? "bg-slate-900 text-white border-slate-900"
                                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => setShowMovieForm((value) => !value)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all"
                        >
                            {showMovieForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            <span>{showMovieForm ? "Fermer" : "Ajouter un film"}</span>
                        </button>
                    </div>

                    {showMovieForm && (
                        <div className="p-5 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <input
                                    value={movieTitle}
                                    onChange={(event) => setMovieTitle(event.target.value)}
                                    placeholder="Titre *"
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                />
                                <input
                                    value={movieDirector}
                                    onChange={(event) => setMovieDirector(event.target.value)}
                                    placeholder="Réalisateur"
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                />
                                <input
                                    value={movieYear}
                                    onChange={(event) => setMovieYear(event.target.value)}
                                    placeholder="Année"
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                />
                                <input
                                    value={movieCover}
                                    onChange={(event) => setMovieCover(event.target.value)}
                                    placeholder="URL de l'affiche"
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                />
                                <select
                                    value={movieStatus}
                                    onChange={(event) => setMovieStatus(event.target.value as CultureStatus)}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                >
                                    <option value="wishlist">À voir</option>
                                    <option value="reading">En cours</option>
                                    <option value="owned">Je l'ai déjà</option>
                                </select>
                                <button
                                    onClick={() => void lookupMovie()}
                                    disabled={movieSearching}
                                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold hover:bg-indigo-100 disabled:opacity-60"
                                >
                                    {movieSearching ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Search className="h-3.5 w-3.5" />
                                    )}
                                    <span>Chercher l'affiche</span>
                                </button>
                            </div>
                            <button
                                onClick={addMovie}
                                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
                            >
                                Ajouter le film
                            </button>
                        </div>
                    )}

                    {filteredMovies.length === 0 && (
                        <p className="text-xs text-slate-500 p-4">Aucun film dans cette catégorie.</p>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {filteredMovies.map((movie) => (
                            <div
                                key={movie.id}
                                className="group rounded-2xl bg-white border border-slate-200/70 shadow-sm overflow-hidden"
                            >
                                <div className="relative">
                                    <Cover url={movie.coverUrl} title={movie.title} className="aspect-[2/3]" />
                                    <button
                                        onClick={() => setMovies((previous) => previous.filter((item) => item.id !== movie.id))}
                                        title="Retirer ce film"
                                        aria-label="Retirer ce film"
                                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <div className="p-3 space-y-1.5">
                                    <p className="text-xs font-extrabold text-slate-900 leading-snug line-clamp-2">
                                        {movie.title}
                                    </p>
                                    <p className="text-[11px] text-slate-500 truncate">
                                        {[movie.director, movie.year].filter(Boolean).join(" · ") || "Réalisateur inconnu"}
                                    </p>
                                    <select
                                        value={movie.status}
                                        onChange={(event) =>
                                            setMovies((previous) =>
                                                previous.map((item) =>
                                                    item.id === movie.id
                                                        ? { ...item, status: event.target.value as CultureStatus }
                                                        : item
                                                )
                                            )
                                        }
                                        className={`w-full text-[10px] font-bold rounded-lg border px-2 py-1 ${STATUS_STYLE[movie.status]}`}
                                    >
                                        <option value="wishlist">{MOVIE_STATUS_LABEL.wishlist}</option>
                                        <option value="reading">{MOVIE_STATUS_LABEL.reading}</option>
                                        <option value="owned">{MOVIE_STATUS_LABEL.owned}</option>
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* EXPOSITIONS */}
            {tab === "expos" && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <input
                                value={cityFilter}
                                onChange={(event) => setCityFilter(event.target.value)}
                                placeholder="Filtrer par ville ou lieu"
                                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs w-56 focus:outline-none focus:border-indigo-500"
                            />
                            <a
                                href={webSearchUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold border border-slate-200"
                            >
                                <Search className="h-3.5 w-3.5" />
                                <span>Rechercher sur le web</span>
                            </a>
                        </div>

                        <button
                            onClick={() => setShowExpoForm((value) => !value)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all"
                        >
                            {showExpoForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            <span>{showExpoForm ? "Fermer" : "Ajouter une exposition"}</span>
                        </button>
                    </div>

                    {showExpoForm && (
                        <div className="p-5 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <input
                                    value={expoTitle}
                                    onChange={(event) => setExpoTitle(event.target.value)}
                                    placeholder="Titre de l'exposition *"
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                />
                                <input
                                    value={expoVenue}
                                    onChange={(event) => setExpoVenue(event.target.value)}
                                    placeholder="Lieu (musée, galerie…)"
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                />
                                <input
                                    value={expoCity}
                                    onChange={(event) => setExpoCity(event.target.value)}
                                    placeholder="Ville *"
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="date"
                                        value={expoStart}
                                        onChange={(event) => setExpoStart(event.target.value)}
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                    />
                                    <input
                                        type="date"
                                        value={expoEnd}
                                        onChange={(event) => setExpoEnd(event.target.value)}
                                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                    />
                                </div>
                                <input
                                    value={expoLink}
                                    onChange={(event) => setExpoLink(event.target.value)}
                                    placeholder="Lien (site, billetterie)"
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                />
                                <input
                                    value={expoImage}
                                    onChange={(event) => setExpoImage(event.target.value)}
                                    placeholder="URL d'une image"
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                                />
                            </div>
                            <button
                                onClick={addExpo}
                                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
                            >
                                Ajouter l'exposition
                            </button>
                        </div>
                    )}

                    {filteredExpos.length === 0 && (
                        <p className="text-xs text-slate-500 p-4">
                            Aucune exposition enregistrée pour ce filtre. Ajoutez-en une ou lancez la recherche web.
                        </p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredExpos.map((expo) => (
                            <div
                                key={expo.id}
                                className="group rounded-2xl bg-white border border-slate-200/70 shadow-sm overflow-hidden"
                            >
                                <div className="relative">
                                    <Cover url={expo.imageUrl} title={expo.title} className="aspect-[16/9]" />
                                    <button
                                        onClick={() => setExpos((previous) => previous.filter((item) => item.id !== expo.id))}
                                        title="Retirer cette exposition"
                                        aria-label="Retirer cette exposition"
                                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <div className="p-4 space-y-1.5">
                                    <p className="text-sm font-extrabold text-slate-900 leading-snug">{expo.title}</p>
                                    <p className="text-[11px] text-slate-500 flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        <span>
                                            {[expo.venue, expo.city].filter(Boolean).join(" · ") || "Lieu à préciser"}
                                        </span>
                                    </p>
                                    <p className="text-[11px] text-slate-500 flex items-center gap-1">
                                        <CalendarDays className="h-3 w-3" />
                                        <span>
                                            {expo.startDate || expo.endDate
                                                ? `${formatDate(expo.startDate)}${expo.endDate ? ` → ${formatDate(expo.endDate)}` : ""}`
                                                : "Dates à préciser"}
                                        </span>
                                    </p>
                                    {expo.link && (
                                        <a
                                            href={expo.link}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 hover:underline"
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                            <span>Voir les détails</span>
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
