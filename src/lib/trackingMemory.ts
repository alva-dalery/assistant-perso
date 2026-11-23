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
    /** Numéro de commande (ex. KS-12345), pour relier les emails d'une même commande. */
    orderNumber?: string | null;
    carrier: string | null;
    numbers: string[];
    url: string | null;
    status: string | null;
    /** Date ou créneau de livraison estimée (ex. « 19.11.2026 – 24.11.2026 »). */
    estimatedDelivery?: string | null;
    /** Date de la commande (ISO, conservée lors des mises à jour ultérieures). */
    orderedAt?: string;
    /** Date de réception de l'email d'expédition ou dernier événement (ISO). */
    shippedAt: string;
    subject: string;
    /** Dossier Gmail choisi pour le rangement. */
    folder: string;
    folderLabel?: string;
    /** Étapes de suivi lues dans l'email (de la plus récente à la plus ancienne). */
    history: string[];
    /** Visuels des produits commandés. */
    images?: string[];
    /** Intitulé du ou des produits commandés. */
    productTitle?: string | null;
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
        orderNumber: text(raw.orderNumber),
        carrier: text(raw.carrier),
        numbers: strings(raw.numbers),
        url: text(raw.url),
        status: text(raw.status),
        estimatedDelivery: text(raw.estimatedDelivery),
        orderedAt: text(raw.orderedAt) ?? text(raw.shippedAt) ?? new Date().toISOString(),
        shippedAt: text(raw.shippedAt) ?? new Date().toISOString(),
        subject: text(raw.subject) ?? "",
        folder: text(raw.folder) ?? "",
        folderLabel: text(raw.folderLabel) ?? undefined,
        history: strings(raw.history),
        images: strings(raw.images).slice(0, 4),
        productTitle: text(raw.productTitle),
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

export interface ParcelMatchCandidate {
    uid?: number;
    store?: string | null;
    orderNumber?: string | null;
    numbers?: string[];
    url?: string | null;
    shippedAt?: string;
}

function normalizeOrderNumber(value: string | null | undefined): string {
    if (!value) return "";
    return value.trim().replace(/^[#°\s]+/, "").replace(/\s+/g, "").toUpperCase();
}

function normalizeStore(value: string | null | undefined): string {
    if (!value) return "";
    return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function uniqueStrings(list: string[], max: number): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of list) {
        const cleaned = item.trim();
        if (!cleaned || seen.has(cleaned)) continue;
        seen.add(cleaned);
        out.push(cleaned);
        if (out.length >= max) break;
    }
    return out;
}

/** Détermine si un email/suivi correspond déjà à un colis suivi existant. */
export function isSameOrder(existing: SavedParcel, candidate: ParcelMatchCandidate): boolean {
    if (candidate.uid !== undefined && existing.uid === candidate.uid) {
        return true;
    }

    const normExistingOrder = normalizeOrderNumber(existing.orderNumber);
    const normCandidateOrder = normalizeOrderNumber(candidate.orderNumber);
    if (normExistingOrder && normCandidateOrder) {
        return normExistingOrder.length >= 3 && normExistingOrder === normCandidateOrder;
    }

    const existingNums = new Set(existing.numbers.map((n) => n.trim().toUpperCase()).filter(Boolean));
    const candidateNums = (candidate.numbers ?? []).map((n) => n.trim().toUpperCase()).filter(Boolean);
    if (candidateNums.some((n) => existingNums.has(n))) {
        return true;
    }

    if (existing.url && candidate.url && existing.url.trim() === candidate.url.trim()) {
        return true;
    }

    // Si le premier mail était une confirmation sans n° de suivi ni n° de commande,
    // et qu'un mail d'expédition du même marchand arrive dans les 30 jours avec un suivi.
    const existingStore = normalizeStore(existing.store);
    const candidateStore = normalizeStore(candidate.store);
    if (
        existingStore &&
        candidateStore &&
        existingStore === candidateStore &&
        existingStore !== "colis" &&
        existing.numbers.length === 0 &&
        (candidateNums.length > 0 || Boolean(candidate.url))
    ) {
        const t1 = Date.parse(existing.shippedAt);
        const t2 = candidate.shippedAt ? Date.parse(candidate.shippedAt) : Date.now();
        if (!Number.isNaN(t1) && !Number.isNaN(t2) && Math.abs(t2 - t1) <= 30 * 86_400_000) {
            return true;
        }
    }

    return false;
}

export function findMatchingParcel(candidate: ParcelMatchCandidate): SavedParcel | null {
    return loadParcels().find((item) => isSameOrder(item, candidate)) ?? null;
}

function earliestIso(a?: string, b?: string): string {
    const t1 = a ? Date.parse(a) : NaN;
    const t2 = b ? Date.parse(b) : NaN;
    if (!Number.isNaN(t1) && !Number.isNaN(t2)) return t1 <= t2 ? a! : b!;
    return a || b || new Date().toISOString();
}

function statusRank(status: string | null | undefined): number {
    if (!status) return 0;
    const s = status.toLowerCase();
    if (/livr/.test(s) && !/en cours|retard/.test(s)) return 6;
    if (/point relais|retrait/.test(s)) return 5;
    if (/en cours de livraison/.test(s)) return 5;
    if (/transit|acheminement/.test(s)) return 4;
    if (/exp[ée]di/.test(s)) return 3;
    if (/pris en charge|pr[ée]paration/.test(s)) return 2;
    if (/confirm/.test(s)) return 1;
    return 1;
}

function mergeParcelData(
    existing: SavedParcel,
    incoming: Partial<SavedParcel> & { replaceImages?: boolean }
): SavedParcel {
    const incomingNumbers = incoming.numbers ?? [];
    const incomingImages = incoming.images ?? [];
    const incomingHistory = incoming.history ?? [];
    const mergedImages = incoming.replaceImages
        ? uniqueStrings(incomingImages, 4)
        : uniqueStrings([...(existing.images ?? []), ...incomingImages], 4);
    const orderedAt = earliestIso(
        existing.orderedAt || existing.shippedAt,
        incoming.orderedAt || incoming.shippedAt
    );
    const nextStatus =
        statusRank(incoming.status) >= statusRank(existing.status)
            ? incoming.status || existing.status
            : existing.status;
    return {
        ...existing,
        store:
            incoming.store && incoming.store.trim() && incoming.store !== "Colis"
                ? incoming.store
                : existing.store,
        orderNumber: incoming.orderNumber || existing.orderNumber || null,
        carrier: incoming.carrier || existing.carrier,
        numbers: uniqueStrings([...incomingNumbers, ...existing.numbers], 5),
        url: incoming.url || existing.url,
        status: nextStatus,
        estimatedDelivery: incoming.estimatedDelivery || existing.estimatedDelivery || null,
        orderedAt,
        shippedAt: incoming.shippedAt || existing.shippedAt,
        subject: incoming.subject || existing.subject,
        folder: incoming.folder || existing.folder,
        folderLabel: incoming.folderLabel ?? existing.folderLabel,
        images: mergedImages,
        productTitle:
            incoming.productTitle !== undefined
                ? incoming.productTitle || existing.productTitle || null
                : existing.productTitle || null,
        history: uniqueStrings([...incomingHistory, ...existing.history], 20),
        savedAt: new Date().toISOString(),
    };
}

/** Ajoute (ou fusionne avec une commande existante) un colis, en tête de liste. */
export function addParcel(
    parcel: SavedParcel,
    options?: { replaceImages?: boolean }
): SavedParcel[] {
    const current = loadParcels();
    const existing = current.find((item) => isSameOrder(item, parcel));
    const merged = existing
        ? mergeParcelData(existing, { ...parcel, replaceImages: options?.replaceImages })
        : parcel;
    const rest = current.filter((item) => item.uid !== merged.uid && item !== existing);
    const next = [merged, ...rest].slice(0, MAX_PARCELS);
    saveParcels(next);
    notifyTrackingChange();
    return next;
}

/**
 * Met à jour un colis déjà suivi si un nouvel email (ex. lien de suivi reçu plus tard)
 * correspond à la même commande, sans jamais créer de doublon.
 */
export function syncExistingParcel(
    candidate: ParcelMatchCandidate & Partial<SavedParcel> & { replaceImages?: boolean }
): SavedParcel | null {
    const current = loadParcels();
    const existing = current.find((item) => isSameOrder(item, candidate));
    if (!existing) return null;

    const merged = mergeParcelData(existing, {
        ...candidate,
        // Ne pas écraser l'uid existant si l'appelant vient d'un autre email
        uid: existing.uid,
    });
    const next = current.map((item) => (item.uid === existing.uid ? merged : item));
    saveParcels(next);
    notifyTrackingChange();
    return merged;
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
