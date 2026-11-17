import type { BookItem, ExpoItem, MovieItem } from "@/types";

/** Données de démarrage du module Culture (modifiables dans l'interface). */
export const initialBooks: BookItem[] = [
    {
        id: "book-1",
        title: "Dune",
        author: "Frank Herbert",
        isbn: "9780441013593",
        coverUrl: "https://covers.openlibrary.org/b/isbn/9780441013593-L.jpg",
        status: "reading",
        notes: "Relire le cycle avant la prochaine adaptation.",
    },
    {
        id: "book-2",
        title: "Sapiens",
        author: "Yuval Noah Harari",
        isbn: "9780062316097",
        coverUrl: "https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg",
        status: "owned",
    },
    {
        id: "book-3",
        title: "Les Furtifs",
        author: "Alain Damasio",
        isbn: "9782072823168",
        coverUrl: "https://covers.openlibrary.org/b/isbn/9782072823168-L.jpg",
        status: "wishlist",
    },
];

export const initialMovies: MovieItem[] = [
    {
        id: "movie-1",
        title: "Arrival",
        director: "Denis Villeneuve",
        year: "2016",
        status: "owned",
    },
    {
        id: "movie-2",
        title: "Everything Everywhere All at Once",
        director: "Daniels",
        year: "2022",
        status: "wishlist",
    },
];

export const initialExpos: ExpoItem[] = [
    {
        id: "expo-1",
        title: "Regards océaniens — photographie contemporaine",
        venue: "Centre culturel Tjibaou",
        city: "Nouméa",
        startDate: "2026-11-05",
        endDate: "2026-12-20",
        link: "https://www.adck.nc",
        notes: "Vérifier les horaires avant de partir.",
    },
    {
        id: "expo-2",
        title: "Mémoires de la Ville — archives et cartes anciennes",
        venue: "Musée de la Ville de Nouméa",
        city: "Nouméa",
        startDate: "2026-10-12",
        endDate: "2027-01-31",
        link: "",
    },
];
