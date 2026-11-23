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
    /** Ville de livraison. */
    deliveryCity?: string | null;
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

    const rawCity = text(raw.deliveryCity);
    const cleanCity =
        rawCity &&
        !/\b(?:facture|commande|livraison|colis|suivi|adresse|votre|cliquez)\b/i.test(rawCity)
            ? rawCity
            : null;

    const rawCarrier = text(raw.carrier);
    const normalizedCarrier =
        rawCarrier && /^la poste\s*\/\s*colissimo$/i.test(rawCarrier)
            ? "Colissimo"
            : rawCarrier;

    return {
        uid,
        store: text(raw.store) ?? "Colis",
        orderNumber: text(raw.orderNumber),
        carrier: normalizedCarrier,
        numbers: strings(raw.numbers),
        url: text(raw.url),
        status: text(raw.status),
        estimatedDelivery: text(raw.estimatedDelivery),
        deliveryCity: cleanCity,
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

const GENERIC_CARRIER_STORE_RE =
    /^(?:colis|la poste|colissimo|la poste\s*\/\s*colissimo|chronopost|ups|dhl|fedex|dpd|gls|mondial\s*relay|relais\s*colis|colis\s*priv[ée])$/i;

function pickPreferredStore(existingStore: string, incomingStore?: string | null): string {
    const inc = (incomingStore ?? "").trim();
    const ext = existingStore.trim();
    if (!inc || inc === "Colis") return ext || "Colis";
    if (!ext || ext === "Colis") return inc;
    const extIsCarrier = GENERIC_CARRIER_STORE_RE.test(ext);
    const incIsCarrier = GENERIC_CARRIER_STORE_RE.test(inc);
    // Ne jamais écraser un vrai nom de marchand (ex. Kapten & Son) par un transporteur (La Poste / Colissimo)
    if (!extIsCarrier && incIsCarrier) return ext;
    if (extIsCarrier && !incIsCarrier) return inc;
    return inc;
}

function mergeParcelData(
    existing: SavedParcel,
    incoming: Partial<SavedParcel> & { replaceImages?: boolean }
): SavedParcel {
    const incomingNumbers = incoming.numbers ?? [];
    const incomingImages = incoming.images ?? [];
    const incomingHistory = incoming.history ?? [];
    const replaceTarget = (incoming as { replaceHistoryTarget?: string }).replaceHistoryTarget;
    const baseExistingHistory = replaceTarget
        ? existing.history.filter((h) => h !== replaceTarget)
        : existing.history;
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
    const tExisting = existing.shippedAt ? Date.parse(existing.shippedAt) : 0;
    const tIncoming = incoming.shippedAt ? Date.parse(incoming.shippedAt) : 0;
    const incomingIsNewerOrEqual =
        !Number.isNaN(tIncoming) && (Number.isNaN(tExisting) || tIncoming >= tExisting);
    const nextEstimatedDelivery = incomingIsNewerOrEqual
        ? incoming.estimatedDelivery || existing.estimatedDelivery || null
        : existing.estimatedDelivery || incoming.estimatedDelivery || null;
    return {
        ...existing,
        store: pickPreferredStore(existing.store, incoming.store),
        orderNumber: incoming.orderNumber || existing.orderNumber || null,
        carrier: incoming.carrier || existing.carrier,
        numbers: uniqueStrings([...incomingNumbers, ...existing.numbers], 5),
        url: incoming.url || existing.url,
        status: nextStatus,
        estimatedDelivery: nextEstimatedDelivery,
        deliveryCity: incoming.deliveryCity || existing.deliveryCity || null,
        orderedAt,
        shippedAt: incomingIsNewerOrEqual
            ? incoming.shippedAt || existing.shippedAt
            : existing.shippedAt,
        subject: incoming.subject || existing.subject,
        folder: incoming.folder || existing.folder,
        folderLabel: incoming.folderLabel ?? existing.folderLabel,
        images: mergedImages,
        productTitle:
            incoming.productTitle !== undefined
                ? incoming.productTitle || existing.productTitle || null
                : existing.productTitle || null,
        history: uniqueStrings([...incomingHistory, ...baseExistingHistory], 20),
        savedAt: new Date().toISOString(),
    };
}

/** Ajoute (ou fusionne avec une commande existante) un colis, en tête de liste. */
export function addParcel(
    parcel: SavedParcel,
    options?: { replaceImages?: boolean; replaceHistoryTarget?: string }
): SavedParcel[] {
    const current = loadParcels();
    const existing = current.find((item) => isSameOrder(item, parcel));
    const merged = existing
        ? mergeParcelData(existing, {
              ...parcel,
              replaceImages: options?.replaceImages,
              replaceHistoryTarget: options?.replaceHistoryTarget,
          } as Partial<SavedParcel> & { replaceImages?: boolean; replaceHistoryTarget?: string })
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

// ----- Mémoire d'apprentissage des intitulés d'historique -----

const HISTORY_SAMPLES_KEY = "assistantPerso.trackingHistoryStyle.v1";
const MAX_HISTORY_SAMPLES = 50;

export interface HistoryLabelSample {
    store: string;
    subjectPattern: string;
    autoLabel: string;
    userLabel: string;
    savedAt: string;
}

function splitDatePrefix(entry: string): { prefix: string; label: string } {
    const cleaned = entry.trim();
    const match = cleaned.match(/^(\d{1,2}\s+[a-zA-Zéèêëàâùûîïôöç.]{2,8}\s*·\s*)(.+)$/);
    if (match) {
        return { prefix: match[1], label: match[2].trim() };
    }
    return { prefix: "", label: cleaned };
}

function normalizeSubjectPattern(subject: string): string {
    return subject
        .toLowerCase()
        .replace(/#[a-z0-9._-]+/gi, "#")
        .replace(/\b[a-z0-9._-]*\d[a-z0-9._-]*\b/gi, "#")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);
}

export function loadHistorySamples(): HistoryLabelSample[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(HISTORY_SAMPLES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (item): item is HistoryLabelSample =>
                Boolean(
                    item &&
                        typeof item === "object" &&
                        typeof (item as HistoryLabelSample).userLabel === "string" &&
                        (item as HistoryLabelSample).userLabel.trim()
                )
        );
    } catch {
        return [];
    }
}

export function learnHistoryLabel(input: {
    store: string;
    subject: string;
    autoEntry: string;
    userEntry: string;
}): void {
    if (typeof window === "undefined") return;
    const autoParts = splitDatePrefix(input.autoEntry);
    const userParts = splitDatePrefix(input.userEntry);
    if (!userParts.label || userParts.label === autoParts.label) return;

    const sample: HistoryLabelSample = {
        store: normalizeStore(input.store),
        subjectPattern: normalizeSubjectPattern(input.subject),
        autoLabel: autoParts.label.toLowerCase(),
        userLabel: userParts.label,
        savedAt: new Date().toISOString(),
    };

    const existing = loadHistorySamples().filter(
        (s) =>
            !(
                s.store === sample.store &&
                s.subjectPattern === sample.subjectPattern &&
                s.autoLabel === sample.autoLabel
            )
    );
    const next = [sample, ...existing].slice(0, MAX_HISTORY_SAMPLES);
    try {
        window.localStorage.setItem(HISTORY_SAMPLES_KEY, JSON.stringify(next));
    } catch {
        // ignore storage quota errors
    }
}

export function applyLearnedHistoryLabel(
    autoEntry: string,
    context: { store: string; subject: string }
): { value: string; learned: boolean } {
    if (!autoEntry) return { value: "", learned: false };
    const { prefix, label } = splitDatePrefix(autoEntry);
    const normStore = normalizeStore(context.store);
    const normSubj = normalizeSubjectPattern(context.subject);
    const normAuto = label.toLowerCase();

    const samples = loadHistorySamples();
    const match =
        samples.find((s) => s.store === normStore && s.subjectPattern === normSubj) ??
        samples.find((s) => s.store === normStore && s.autoLabel === normAuto) ??
        samples.find((s) => s.autoLabel === normAuto);

    if (!match) return { value: autoEntry, learned: false };
    return {
        value: prefix ? `${prefix}${match.userLabel}` : match.userLabel,
        learned: true,
    };
}

// ----- Regroupement manuel et apprentissage des groupes de commandes -----

const GROUP_OVERRIDES_KEY = "assistantPerso.orderGroupOverrides.v1";
const GROUP_RULES_KEY = "assistantPerso.orderGroupRules.v1";
const MAX_GROUP_RULES = 50;

export interface OrderGroupRule {
    fromEmail: string;
    subjectPattern: string;
    targetOrderNumber: string | null;
    targetTrackingNumber: string | null;
    targetStore: string;
    savedAt: string;
}

export function loadOrderGroupOverrides(): Record<number, string> {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(GROUP_OVERRIDES_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object") return {};
        const out: Record<number, string> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            const uid = Number(k);
            if (Number.isInteger(uid) && uid > 0 && typeof v === "string" && v.trim()) {
                out[uid] = v.trim();
            }
        }
        return out;
    } catch {
        return {};
    }
}

export function saveOrderGroupOverrides(overrides: Record<number, string>): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(GROUP_OVERRIDES_KEY, JSON.stringify(overrides));
    } catch {
        // ignore storage quota errors
    }
}

export function loadOrderGroupRules(): OrderGroupRule[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(GROUP_RULES_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (item): item is OrderGroupRule =>
                Boolean(
                    item &&
                        typeof item === "object" &&
                        typeof (item as OrderGroupRule).fromEmail === "string"
                )
        );
    } catch {
        return [];
    }
}

export function learnOrderGroupRule(input: {
    fromEmail: string;
    subject: string;
    targetOrderNumber: string | null;
    targetTrackingNumber: string | null;
    targetStore: string;
}): void {
    if (typeof window === "undefined") return;
    if (!input.targetStore && !input.targetOrderNumber && !input.targetTrackingNumber) return;

    const rule: OrderGroupRule = {
        fromEmail: input.fromEmail.trim().toLowerCase(),
        subjectPattern: normalizeSubjectPattern(input.subject),
        targetOrderNumber: input.targetOrderNumber,
        targetTrackingNumber: input.targetTrackingNumber,
        targetStore: input.targetStore,
        savedAt: new Date().toISOString(),
    };

    const existing = loadOrderGroupRules().filter(
        (r) => !(r.fromEmail === rule.fromEmail && r.subjectPattern === rule.subjectPattern)
    );
    const next = [rule, ...existing].slice(0, MAX_GROUP_RULES);
    try {
        window.localStorage.setItem(GROUP_RULES_KEY, JSON.stringify(next));
    } catch {
        // ignore storage quota errors
    }
}

export function findLearnedOrderGroupRule(input: {
    fromEmail: string;
    subject: string;
}): OrderGroupRule | null {
    const email = input.fromEmail.trim().toLowerCase();
    const subj = normalizeSubjectPattern(input.subject);
    const rules = loadOrderGroupRules();
    return (
        rules.find((r) => r.fromEmail === email && r.subjectPattern === subj) ??
        null
    );
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

// ----- Apprentissage général des modifications d'intitulés -----

export type LearnedLabelField =
    | "status"
    | "estimatedDelivery"
    | "deliveryCity"
    | "productTitle";

export interface LabelReplacementRule {
    scope: "global" | LearnedLabelField;
    from: string;
    to: string;
    wholeWord: boolean;
    savedAt: string;
}

const LABEL_REPLACEMENTS_KEY = "assistantPerso.labelReplacements.v1";
const MAX_LABEL_REPLACEMENTS = 100;

function escapeRegexLiteral(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function loadLabelReplacementRules(): LabelReplacementRule[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(LABEL_REPLACEMENTS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (item): item is LabelReplacementRule =>
                Boolean(
                    item &&
                        typeof item === "object" &&
                        typeof (item as LabelReplacementRule).from === "string" &&
                        typeof (item as LabelReplacementRule).to === "string" &&
                        (item as LabelReplacementRule).from.trim().length > 0 &&
                        (item as LabelReplacementRule).to.trim().length > 0
                )
        );
    } catch {
        return [];
    }
}

export function learnLabelEdit(input: {
    field: LearnedLabelField;
    autoValue: string | null | undefined;
    userValue: string | null | undefined;
}): void {
    if (typeof window === "undefined") return;
    const autoText = (input.autoValue ?? "").replace(/\s+/g, " ").trim();
    const userText = (input.userValue ?? "").replace(/\s+/g, " ").trim();
    if (!autoText || !userText || autoText === userText) return;

    const autoTokens = autoText.split(/(\s+)/);
    const userTokens = userText.split(/(\s+)/);

    let prefix = 0;
    while (
        prefix < autoTokens.length &&
        prefix < userTokens.length &&
        autoTokens[prefix] === userTokens[prefix]
    ) {
        prefix++;
    }

    let suffix = 0;
    while (
        suffix < autoTokens.length - prefix &&
        suffix < userTokens.length - prefix &&
        autoTokens[autoTokens.length - 1 - suffix] ===
            userTokens[userTokens.length - 1 - suffix]
    ) {
        suffix++;
    }

    const fromSpan = autoTokens
        .slice(prefix, autoTokens.length - suffix)
        .join("")
        .trim();
    const toSpan = userTokens
        .slice(prefix, userTokens.length - suffix)
        .join("")
        .trim();

    const isPartialDiff = (prefix > 0 || suffix > 0) && fromSpan.length >= 2 && toSpan.length >= 1;
    const from = isPartialDiff ? fromSpan : autoText;
    const to = isPartialDiff ? toSpan : userText;
    if (!from || !to || from === to) return;

    const rule: LabelReplacementRule = {
        scope: isPartialDiff ? "global" : input.field,
        from,
        to,
        wholeWord: isPartialDiff && !/\s/.test(from),
        savedAt: new Date().toISOString(),
    };

    const existing = loadLabelReplacementRules().filter(
        (r) => !(r.scope === rule.scope && r.from.toLowerCase() === rule.from.toLowerCase())
    );
    const next = [rule, ...existing].slice(0, MAX_LABEL_REPLACEMENTS);
    try {
        window.localStorage.setItem(LABEL_REPLACEMENTS_KEY, JSON.stringify(next));
    } catch {
        // ignore storage quota errors
    }
}

export function applyLearnedLabelEdits(
    value: string | null | undefined,
    field: LearnedLabelField
): { value: string; learned: boolean } {
    const raw = (value ?? "").trim();
    if (!raw) return { value: "", learned: false };

    const rules = loadLabelReplacementRules();
    let current = raw;
    let changed = false;

    for (const rule of rules) {
        if (rule.scope !== "global") continue;
        if (rule.wholeWord) {
            const pattern = new RegExp(
                `(?<![\\p{L}\\p{N}])${escapeRegexLiteral(rule.from)}(?![\\p{L}\\p{N}])`,
                "giu"
            );
            const next = current.replace(pattern, rule.to);
            if (next !== current) {
                current = next;
                changed = true;
            }
        } else {
            const pattern = new RegExp(escapeRegexLiteral(rule.from), "giu");
            const next = current.replace(pattern, rule.to);
            if (next !== current) {
                current = next;
                changed = true;
            }
        }
    }

    const exactFieldMatch = rules.find(
        (r) => r.scope === field && r.from.toLowerCase() === current.toLowerCase()
    );
    if (exactFieldMatch) {
        current = exactFieldMatch.to;
        changed = true;
    }

    return { value: current, learned: changed };
}
