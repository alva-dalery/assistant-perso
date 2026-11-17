/**
 * Mémoire locale des colis suivis.
 *
 * Un email de suivi validé depuis le module Emails est rangé dans un dossier
 * Gmail, puis enregistré ici : le tableau de bord affiche ensuite le colis
 * (magasin, numéro, lien, statut, date) même après rechargement, sans nouvelle
 * connexion IMAP. Tout reste dans le navigateur, comme la mémoire de style.
 */

export interface SavedParcel {
    /** uid Gmail du message d'origine (sert d'identifiant unique). */
    uid: number;
    /** Nom du magasin (ou du transporteur à défaut). */
    store: string;
    carrier: string | null;
    numbers: string[];
    url: string | null;
    status: string | null;
    /** Date de réception de l'email d'expédition (ISO). */
    shippedAt: string;
    subject: string;
    /** Dossier Gmail choisi pour le rangement. */
    folder: string;
    folderLabel?: string;
    /** Étapes de suivi lues dans l'email (de la plus récente à la plus ancienne). */
    history: string[];
    savedAt: string;
}

const STORAGE_KEY = "assistantPerso.tracking.v1";
const MAX_PARCELS = 20;

/** Événement émis quand la liste change (le tableau de bord écoute). */
export const TRACKING_EVENT = "assistantperso:tracking";

function sanitize(value: unknown): SavedParcel | null {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    const uid = Number(raw.uid);
    if (!Number.isInteger(uid) || uid <= 0) return null;

    const strings = (input: unknown): string[] =>
        Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : [];

    const text = (input: unknown): string | null =>
        typeof input === "string" && input.trim() ? input.trim() : null;

    return {
        uid,
        store: text(raw.store) ?? "Colis",
        carrier: text(raw.carrier),
        numbers: strings(raw.numbers),
        url: text(raw.url),
        status: text(raw.status),
        shippedAt: text(raw.shippedAt) ?? new Date().toISOString(),
        subject: text(raw.subject) ?? "",
        folder: text(raw.folder) ?? "",
        folderLabel: text(raw.folderLabel) ?? undefined,
        history: strings(raw.history),
        savedAt: text(raw.savedAt) ?? new Date().toISOString(),
    };
}

export function loadParcels(): SavedParcel[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(sanitize)
            .filter((item): item is SavedParcel => item !== null)
            .slice(0, MAX_PARCELS);
    } catch {
        return [];
    }
}

export function saveParcels(parcels: SavedParcel[]): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parcels.slice(0, MAX_PARCELS)));
    } catch {
        // Stockage indisponible : le colis reste visible pour la session.
    }
}

export function notifyTrackingChange(): void {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(TRACKING_EVENT));
    }
}

/** Ajoute (ou met à jour) un colis, en tête de liste. */
export function addParcel(parcel: SavedParcel): SavedParcel[] {
    const rest = loadParcels().filter((item) => item.uid !== parcel.uid);
    const next = [parcel, ...rest].slice(0, MAX_PARCELS);
    saveParcels(next);
    notifyTrackingChange();
    return next;
}

export function removeParcel(uid: number): SavedParcel[] {
    const next = loadParcels().filter((item) => item.uid !== uid);
    saveParcels(next);
    notifyTrackingChange();
    return next;
}

export function updateParcel(uid: number, patch: Partial<SavedParcel>): SavedParcel[] {
    const next = loadParcels().map((item) =>
        item.uid === uid ? { ...item, ...patch } : item
    );
    saveParcels(next);
    notifyTrackingChange();
    return next;
}
