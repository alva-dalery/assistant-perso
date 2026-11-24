"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    BookOpen,
    CalendarPlus,
    CheckCircle2,
    Check,
    ChevronDown,
    Copy,
    Download,
    Droplet,
    ExternalLink,
    Eye,
    FileText,
    FolderInput,
    FolderUp,
    GripVertical,
    KeyRound,
    Library,
    Loader2,
    Mail,
    Package,
    PenLine,
    RefreshCw,
    Router,
    Save,
    Send,
    Smartphone,
    Trash2,
    Wifi,
    Zap,
} from "lucide-react";
import { computeStyleProfile, loadSamples, recordReplySample } from "@/lib/styleMemory";
import {
    addParcel,
    applyLearnedHistoryLabel,
    applyLearnedLabelEdits,
    findLearnedOrderGroupRule,
    findMatchingParcel,
    learnHistoryLabel,
    learnLabelEdit,
    learnOrderGroupRule,
    loadOrderGroupOverrides,
    saveOrderGroupOverrides,
    syncExistingParcel,
} from "@/lib/trackingMemory";
import { getAiHeaders, getLaPosteHeaders } from "@/lib/aiClient";
import {
    coverSrc,
    loadCoverOverrides,
    loadLoanDueOverrides,
    loadLoanExtensions,
    loadLoanMetaOverrides,
    loanCoverKey,
    lookupBook,
    saveCoverOverrides,
    saveLoanDueOverrides,
    saveLoanExtensions,
    saveLoanMetaOverrides,
    titleCase,
} from "@/lib/loanCovers";
import type { BookLookup, LoanMetaOverride } from "@/lib/loanCovers";

type GmailCategory =
    | "personnel"
    | "important"
    | "factures"
    | "commande"
    | "alertes"
    | "infos"
    | "kiosque"
    | "bibliotheque"
    | "newsletter"
    | "promotion";

interface GmailStatus {
    configured: boolean;
    driveConfigured?: boolean;
    email: string | null;
    inboxCount: number | null;
    imap: "ok" | "error" | "unconfigured";
    smtp: "ok" | "error" | "unconfigured";
    error?: string;
}

interface InboxMessage {
    uid: number;
    subject: string;
    fromName: string;
    fromEmail: string;
    date: string;
    seen: boolean;
    answered: boolean;
    category: GmailCategory;
    needsReply: boolean;
    reason: string;
    orderNumber?: string | null;
    trackingNumber?: string | null;
}

interface MessageDetail extends InboxMessage {
    to: string;
    cc: string;
    text: string;
    html?: string;
    summary: string;
    currentText: string;
    historyText: string;
    exchanges: number;
    attachments: string[];
    attachmentParts: PartInfo[];
    images: PartInfo[];
    messageId: string;
    inReplyTo: string;
    tracking?: TrackingInfo | null;
    loans?: BookLoan[];
}

interface ReplyDraftResponse {
    to: string;
    subject: string;
    body: string;
    intent: string;
    register: "vouvoiement" | "tutoiement";
    needsReply: boolean;
    exchanges: number;
    aiPowered?: boolean;
    aiModel?: string;
    aiWarning?: string;
    error?: string;
}

const CATEGORY_LABEL: Record<GmailCategory, string> = {
    personnel: "À répondre",
    important: "À lire",
    factures: "Factures",
    commande: "Commandes",
    alertes: "Alertes",
    infos: "À lire",
    kiosque: "Kiosque",
    bibliotheque: "Bibliothèque",
    newsletter: "Newsletter",
    promotion: "Publicité",
};

const CATEGORY_STYLE: Record<GmailCategory, string> = {
    personnel: "bg-teal-50 text-teal-700 border-teal-200",
    important: "bg-sky-50 text-sky-700 border-sky-200",
    factures: "bg-indigo-50 text-indigo-700 border-indigo-200",
    commande: "bg-violet-50 text-violet-700 border-violet-200",
    alertes: "bg-rose-50 text-rose-700 border-rose-200",
    infos: "bg-sky-50 text-sky-700 border-sky-200",
    kiosque: "bg-emerald-50 text-emerald-700 border-emerald-200",
    bibliotheque: "bg-orange-50 text-orange-700 border-orange-200",
    newsletter: "bg-slate-100 text-slate-500 border-slate-200",
    promotion: "bg-amber-50 text-amber-700 border-amber-200",
};

/** Ordre d'affichage des étiquettes modifiables. */
const CATEGORY_ORDER: GmailCategory[] = [
    "personnel",
    "infos",
    "factures",
    "commande",
    "alertes",
    "kiosque",
    "bibliotheque",
    "newsletter",
    "promotion",
];

const LABEL_STORAGE_KEY = "assistantPerso.labels.v1";

function loadLabelOverrides(): Record<number, GmailCategory> {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(LABEL_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const result: Record<number, GmailCategory> = {};
        for (const [key, value] of Object.entries(parsed)) {
            const uid = Number(key);
            if (Number.isInteger(uid) && uid > 0 && typeof value === "string" && value in CATEGORY_LABEL) {
                result[uid] = value as GmailCategory;
            }
        }
        return result;
    } catch {
        return {};
    }
}

function saveLabelOverrides(overrides: Record<number, GmailCategory>) {
    try {
        window.localStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify(overrides));
    } catch {
        // Stockage indisponible : l'étiquette reste valable pour la session.
    }
}

/** Applique une étiquette choisie à la main (prioritaire sur le tri automatique). */
function applyLabelOverride<T extends InboxMessage>(message: T, category?: GmailCategory): T {
    if (!category) return message;
    return {
        ...message,
        category,
        needsReply: message.answered ? false : category === "personnel",
        reason: "Étiquette choisie manuellement",
    };
}

type Filter =
    | "reply"
    | "read"
    | "factures"
    | "commande"
    | "alertes"
    | "kiosque"
    | "bibliotheque"
    | "later"
    | "all";

const PAGE_SIZE = 80;
const MAX_MESSAGES = 2000;
const INBOX_CACHE_KEY = "assistantPerso.inboxCache.v1";
const DETAIL_CACHE_KEY = "assistantPerso.detailCache.v2";
const INVOICE_BATCH_CHUNK = 5;

function formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/** « aujourd'hui », « hier », « il y a 2 jours »… */
function formatRelative(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";

    const startOfDay = (value: Date) =>
        new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
    const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);

    if (days <= 0) return "aujourd'hui";
    if (days === 1) return "hier";
    if (days < 7) return `il y a ${days} jours`;
    if (days < 31) {
        const weeks = Math.floor(days / 7);
        return `il y a ${weeks} semaine${weeks > 1 ? "s" : ""}`;
    }
    if (days < 365) {
        const months = Math.floor(days / 30);
        return `il y a ${months} mois`;
    }
    const years = Math.floor(days / 365);
    return `il y a ${years} an${years > 1 ? "s" : ""}`;
}

/** « 12 déc. 2026 » à partir d'une date ISO (AAAA-MM-JJ). */
function formatShortDate(iso: string): string {
    const date = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/** Urgence d'une date de retour : en retard, proche (7 jours) ou normale. */
function dueTone(iso: string | null): "overdue" | "soon" | "normal" {
    if (!iso) return "normal";
    const due = new Date(`${iso}T23:59:59`).getTime();
    if (Number.isNaN(due)) return "normal";
    const days = Math.ceil((due - Date.now()) / 86_400_000);
    if (days < 0) return "overdue";
    if (days <= 7) return "soon";
    return "normal";
}

function addDaysIso(iso: string | null, days: number): string | null {
    if (!iso) return null;
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    date.setDate(date.getDate() + days);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

interface LoanCardProps {
    loan: BookLoan;
    /** Lien choisi à la main, s'il existe. */
    override?: string;
    onSaveCover: (url: string | null) => void;
    /** Titre / auteur modifiés à la main. */
    metaOverride?: LoanMetaOverride;
    onSaveMeta: (meta: LoanMetaOverride | null) => void;
    /** Date de retour effective (originale, prolongée ou modifiée à la main). */
    effectiveDueDate: string | null;
    /** Indique si une date manuelle ou prolongée remplace celle du mail. */
    hasDueOverride?: boolean;
    onSaveDueDate?: (iso: string | null) => void;
    /** Indique si le prêt a déjà été prolongé de 3 semaines. */
    extended?: boolean;
    onExtend?: () => void;
    selected?: boolean;
    onToggleSelect?: () => void;
}

const LoanCard: React.FC<LoanCardProps> = ({
    loan,
    override,
    onSaveCover,
    metaOverride,
    onSaveMeta,
    effectiveDueDate,
    hasDueOverride = false,
    onSaveDueDate,
    extended = false,
    onExtend,
    selected = false,
    onToggleSelect,
}) => {
    const [lookup, setLookup] = useState<BookLookup | null>(null);
    const [coverIndex, setCoverIndex] = useState(0);
    const [attempt, setAttempt] = useState(0);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(override ?? "");
    const [titleDraft, setTitleDraft] = useState(metaOverride?.title ?? "");
    const [authorDraft, setAuthorDraft] = useState(metaOverride?.author ?? "");
    const [editingDate, setEditingDate] = useState(false);
    const [dateDraft, setDateDraft] = useState(effectiveDueDate ?? "");

    useEffect(() => {
        let cancelled = false;
        setLookup(null);
        setCoverIndex(0);
        void (async () => {
            const found = await lookupBook(loan.title, loan.author, { force: attempt > 0 });
            if (!cancelled) setLookup(found);
        })();
        return () => {
            cancelled = true;
        };
    }, [loan.title, loan.author, attempt]);

    useEffect(() => {
        setDraft(override ?? "");
    }, [override]);

    useEffect(() => {
        setDateDraft(effectiveDueDate ?? "");
    }, [effectiveDueDate]);

    const autoTitle = lookup?.title ?? titleCase(loan.title);
    const autoAuthor =
        lookup && lookup.authors.length > 0
            ? lookup.authors.join(", ")
            : loan.author
              ? titleCase(loan.author)
              : null;
    const displayTitle = metaOverride?.title ?? autoTitle;
    const displayAuthor = metaOverride?.author ?? autoAuthor;

    useEffect(() => {
        setTitleDraft(metaOverride?.title ?? autoTitle);
        setAuthorDraft(metaOverride?.author ?? autoAuthor ?? "");
    }, [metaOverride?.title, metaOverride?.author, autoTitle, autoAuthor]);
    const rawCover = override ?? lookup?.covers[coverIndex] ?? null;
    const coverUrl = coverSrc(rawCover);
    const searching = lookup === null && !override;
    const tone = dueTone(effectiveDueDate);

    return (
        <div
            className={`rounded-xl bg-white overflow-hidden flex flex-col transition-all ${
                selected
                    ? "border-2 border-amber-500 ring-2 ring-amber-200/70"
                    : "border border-amber-200/70"
            }`}
        >
            <div className="relative aspect-[2/3] bg-slate-100 overflow-hidden">
                {onToggleSelect && (
                    <button
                        type="button"
                        onClick={onToggleSelect}
                        aria-label={selected ? `Désélectionner ${displayTitle}` : `Sélectionner ${displayTitle}`}
                        className={`absolute top-1.5 left-1.5 z-10 h-5 w-5 rounded-md border flex items-center justify-center shadow-sm transition-all ${
                            selected
                                ? "bg-amber-600 border-amber-600 text-white"
                                : "bg-white/90 border-slate-300 text-transparent hover:border-amber-500"
                        }`}
                    >
                        <Check className="h-3 w-3" />
                    </button>
                )}
                {coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={coverUrl}
                        alt={`Couverture de ${displayTitle}`}
                        className="h-full w-full object-cover"
                        onError={() => {
                            if (!override) setCoverIndex((index) => index + 1);
                        }}
                    />
                ) : (
                    <div className="h-full w-full flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400 p-2 text-center">
                        {searching ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <BookOpen className="h-5 w-5" />
                        )}
                        <span className="text-[8px] font-bold leading-tight line-clamp-3">
                            {displayTitle}
                        </span>
                        {!searching && (
                            <button
                                type="button"
                                onClick={() => setAttempt((value) => value + 1)}
                                className="text-[8px] font-bold text-amber-700 underline"
                            >
                                Rechercher
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="p-2 flex-1 flex flex-col justify-between gap-1.5">
                <div className="space-y-0.5">
                    <p className="text-[11px] font-bold text-slate-800 leading-tight line-clamp-2">
                        {displayTitle}
                    </p>
                    {displayAuthor && (
                        <p className="text-[9px] text-slate-500 truncate">{displayAuthor}</p>
                    )}
                </div>
                {editingDate && onSaveDueDate ? (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (dateDraft) onSaveDueDate(dateDraft);
                            setEditingDate(false);
                        }}
                        className="pt-1 space-y-1"
                    >
                        <input
                            type="date"
                            value={dateDraft}
                            onChange={(event) => setDateDraft(event.target.value)}
                            aria-label={`Date de retour de ${displayTitle}`}
                            className="w-full rounded border border-slate-200 px-1 py-0.5 text-[9px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-300"
                        />
                        <div className="flex items-center gap-1">
                            <button
                                type="submit"
                                className="px-1.5 py-0.5 rounded bg-amber-600 text-white text-[8px] font-bold hover:bg-amber-700"
                            >
                                OK
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditingDate(false)}
                                className="px-1.5 py-0.5 rounded text-slate-500 text-[8px] font-bold hover:bg-slate-100"
                            >
                                Annuler
                            </button>
                            {hasDueOverride && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onSaveDueDate(null);
                                        setEditingDate(false);
                                    }}
                                    className="ml-auto text-[8px] font-bold text-amber-700 hover:underline"
                                >
                                    Auto
                                </button>
                            )}
                        </div>
                    </form>
                ) : effectiveDueDate ? (
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => onSaveDueDate && setEditingDate(true)}
                            title="Modifier la date de retour"
                            className={`inline-flex items-center gap-1 text-right text-[9px] font-bold hover:underline ${
                                tone === "overdue"
                                    ? "text-rose-600"
                                    : tone === "soon"
                                      ? "text-amber-700"
                                      : "text-slate-500"
                            }`}
                        >
                            <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                            <span>{formatShortDate(effectiveDueDate)}</span>
                        </button>
                    </div>
                ) : loan.dueLabel ? (
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => onSaveDueDate && setEditingDate(true)}
                            title="Définir une date de retour"
                            className="inline-flex items-center gap-1 text-right text-[9px] font-bold text-slate-500 hover:underline"
                        >
                            <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                            <span>{loan.dueLabel}</span>
                        </button>
                    </div>
                ) : null}
            </div>

            {editing ? (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSaveCover(draft.trim() ? draft.trim() : null);
                        const nextTitle = titleDraft.trim();
                        const nextAuthor = authorDraft.trim();
                        const titleChanged = nextTitle && nextTitle !== autoTitle;
                        const authorChanged = nextAuthor && nextAuthor !== (autoAuthor ?? "");
                        onSaveMeta(
                            titleChanged || authorChanged
                                ? {
                                      ...(titleChanged ? { title: nextTitle } : {}),
                                      ...(authorChanged ? { author: nextAuthor } : {}),
                                  }
                                : null
                        );
                        setEditing(false);
                    }}
                    className="p-2 border-t border-amber-200/70 space-y-1.5"
                >
                    <input
                        autoFocus
                        value={titleDraft}
                        onChange={(event) => setTitleDraft(event.target.value)}
                        placeholder="Titre du livre"
                        aria-label="Titre du livre"
                        className="w-full rounded-lg border border-slate-200 px-1.5 py-1 text-[9px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-100"
                    />
                    <input
                        value={authorDraft}
                        onChange={(event) => setAuthorDraft(event.target.value)}
                        placeholder="Auteur(s)"
                        aria-label="Auteur du livre"
                        className="w-full rounded-lg border border-slate-200 px-1.5 py-1 text-[9px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-100"
                    />
                    <input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="https://…/couverture.jpg"
                        inputMode="url"
                        aria-label={`Lien de l'image de ${displayTitle}`}
                        className="w-full rounded-lg border border-slate-200 px-1.5 py-1 text-[9px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-100"
                    />
                    <div className="flex items-center gap-1">
                        <button
                            type="submit"
                            className="px-2 py-1 rounded-lg bg-amber-600 text-white text-[9px] font-bold hover:bg-amber-700 transition-all"
                        >
                            Enregistrer
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditing(false)}
                            className="px-2 py-1 rounded-lg text-slate-500 text-[9px] font-bold hover:bg-slate-100 transition-all"
                        >
                            Annuler
                        </button>
                        {(override || metaOverride) && (
                            <button
                                type="button"
                                onClick={() => {
                                    onSaveCover(null);
                                    onSaveMeta(null);
                                    setEditing(false);
                                }}
                                className="ml-auto text-[9px] font-bold text-amber-700 hover:underline"
                            >
                                Auto
                            </button>
                        )}
                    </div>
                </form>
            ) : (
                <div className="p-1.5 flex items-center gap-1.5 border-t border-amber-200/70">
                    {!extended && effectiveDueDate && onExtend && (
                        <button
                            type="button"
                            onClick={onExtend}
                            title="Prolonger de 3 semaines (+21 jours)"
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold text-emerald-700 hover:bg-emerald-50 transition-all"
                        >
                            <CalendarPlus className="h-3 w-3" />
                            <span>Prolonger</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setEditing(true)}
                        title="Modifier le titre, l'auteur ou la couverture"
                        aria-label={`Modifier ${displayTitle}`}
                        className="ml-auto p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-all"
                    >
                        <PenLine className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}
        </div>
    );
};

interface PartInfo {
    part: string;
    filename: string;
    type: string;
    size: number | null;
    inline: boolean;
}

interface FolderSuggestion {
    path: string;
    label: string;
    score: number;
    reason: string;
}

interface BookLoan {
    title: string;
    author: string | null;
    dueDate: string | null;
    dueLabel: string | null;
}

interface TrackingInfo {
    store?: string | null;
    orderNumber?: string | null;
    carrier: string | null;
    numbers: string[];
    status: string | null;
    estimatedDelivery: string | null;
    deliveryCity?: string | null;
    history?: string[];
    url: string | null;
    images?: string[];
    productTitle?: string | null;
    imageLabels?: Record<string, string>;
}

function resolveSelectedProductTitle(
    tracking: TrackingInfo,
    selectedImages: string[]
): string | null {
    const labels = tracking.imageLabels;
    if (labels && selectedImages.length > 0) {
        const picked = Array.from(
            new Set(selectedImages.map((u) => labels[u]).filter((v): v is string => Boolean(v)))
        );
        if (picked.length > 0) return picked.slice(0, 2).join(" · ");
    }
    return tracking.productTitle ?? null;
}

interface InvoiceFile {
    part: string;
    original: string;
    proposed: string;
    type: string;
}

interface InvoiceProposal {
    provider: string;
    providerLabel: string;
    period: string;
    invoiceDate: string;
    /** Montant total lu dans le PDF (ex. « 27 350 XPF »). */
    amount?: string | null;
    link?: string;
    files: InvoiceFile[];
}

type InvoiceRowStatus = "pending" | "ready" | "empty" | "error";

interface InvoiceRow {
    uid: number;
    subject: string;
    fromName: string;
    date: string;
    proposal: InvoiceProposal | null;
    name: string;
    selected: boolean;
    status: InvoiceRowStatus;
    error?: string;
}

/** Vignette de facture : une icône par fournisseur (aucun logo externe). */
const INVOICE_ICONS: Record<
    string,
    { Icon: React.ComponentType<{ className?: string }>; color: string; label: string }
> = {
    // Lagoon : box internet
    lagoon: { Icon: Router, color: "bg-sky-600", label: "Lagoon — box internet" },
    // EEC Engie : électricité
    eec: { Icon: Zap, color: "bg-blue-700", label: "EEC Engie — électricité" },
    // Calédonienne des eaux : goutte d'eau
    cde: { Icon: Droplet, color: "bg-cyan-600", label: "Calédonienne des eaux" },
    // OPT.nc Internet
    "opt-internet": { Icon: Wifi, color: "bg-emerald-600", label: "OPT.nc Internet" },
    // OPT.nc Mobile
    "opt-mobile": { Icon: Smartphone, color: "bg-orange-500", label: "OPT.nc Mobile" },
};

const ProviderLogo: React.FC<{ provider: string; className?: string }> = ({
    provider,
    className = "",
}) => {
    const meta = INVOICE_ICONS[provider] ?? {
        Icon: FileText,
        color: "bg-slate-600",
        label: "Facture",
    };
    const Icon = meta.Icon;

    return (
        <span
            role="img"
            aria-label={meta.label}
            title={meta.label}
            className={`inline-flex items-center justify-center rounded-lg text-white shrink-0 ${meta.color} ${className}`}
        >
            <Icon className="h-1/2 w-1/2" />
        </span>
    );
};

interface LabelMenuProps {
    value: GmailCategory;
    /** Étiquette choisie à la main (absente = tri automatique). */
    override?: GmailCategory;
    onSelect: (value: "auto" | GmailCategory) => void;
    className?: string;
    /** Aligne le menu à droite (bord droit du bouton). */
    align?: "left" | "right";
}

/** Pastille d'étiquette cliquable avec flèche pour changer la catégorie de l'email. */
const LabelMenu: React.FC<LabelMenuProps> = ({
    value,
    override,
    onSelect,
    className = "",
    align = "right",
}) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handlePointer = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", handlePointer);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handlePointer);
            document.removeEventListener("keydown", handleKey);
        };
    }, [open]);

    const choose = (next: "auto" | GmailCategory) => {
        setOpen(false);
        onSelect(next);
    };

    return (
        <div ref={containerRef} className={`relative inline-flex items-center shrink-0 ${className}`}>
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    setOpen((current) => !current);
                }}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`Changer l'étiquette (${CATEGORY_LABEL[value]})`}
                title="Changer l'étiquette"
                className={`inline-flex items-center gap-1 text-[9px] pl-2 pr-1.5 py-0.5 rounded-full border font-bold transition-all hover:brightness-95 ${CATEGORY_STYLE[value]} ${
                    override ? "ring-1 ring-teal-500/40" : ""
                }`}
            >
                <span>{CATEGORY_LABEL[value]}</span>
                <ChevronDown
                    className={`h-2.5 w-2.5 shrink-0 transition-transform ${
                        open ? "rotate-180" : ""
                    }`}
                />
            </button>

            {open && (
                <div
                    role="menu"
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    className={`absolute top-full z-40 mt-1.5 w-44 rounded-xl border border-slate-200 bg-white shadow-xl p-1 ${
                        align === "right" ? "right-0" : "left-0"
                    }`}
                >
                    {CATEGORY_ORDER.map((category) => (
                        <button
                            key={category}
                            type="button"
                            role="menuitem"
                            onClick={() => choose(category)}
                            className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-left hover:bg-slate-100 ${
                                category === value ? "text-teal-700" : "text-slate-700"
                            }`}
                        >
                            <span>{CATEGORY_LABEL[category]}</span>
                            {category === value && <Check className="h-3.5 w-3.5" />}
                        </button>
                    ))}
                    <div className="my-1 h-px bg-slate-100" />
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => choose("auto")}
                        className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-left text-slate-700 hover:bg-slate-100"
                    >
                        <span>Automatique</span>
                        {!override && <Check className="h-3.5 w-3.5" />}
                    </button>
                </div>
            )}
        </div>
    );
};

function attachmentUrl(uid: number, file: PartInfo): string {
    const params = new URLSearchParams({
        uid: String(uid),
        part: file.part,
        type: file.type,
        name: file.filename,
    });
    return `/api/gmail/attachment?${params.toString()}`;
}

function invoiceFileUrl(uid: number, proposal: InvoiceProposal, file: InvoiceFile): string {
    if (file.part) {
        return attachmentUrl(uid, {
            part: file.part,
            filename: file.proposed,
            type: "application/pdf",
            size: null,
            inline: false,
        });
    }
    if (proposal.link) {
        return `/api/gmail/invoice/download?url=${encodeURIComponent(proposal.link)}`;
    }
    return "";
}

function replySubject(subject: string): string {
    return /^re\s*:/i.test(subject) ? subject : `Re: ${subject}`;
}

function isLater(category: GmailCategory): boolean {
    return category === "newsletter" || category === "promotion";
}

/** Résumé court pour la lecture rapide, sans perdre la fin de phrase. */
function summarize(text: string, max = 280): string {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max);
    const lastStop = Math.max(
        cut.lastIndexOf(". "),
        cut.lastIndexOf("! "),
        cut.lastIndexOf("? ")
    );
    return lastStop > 80 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}

interface InboxSessionCache {
    status: GmailStatus | null;
    messages: InboxMessage[];
    total: number;
    limit: number;
    folders: { path: string; label: string; kind: string }[];
    rawLabels: Record<number, { category: GmailCategory; needsReply: boolean; reason: string }>;
    filter: Filter;
    detail: MessageDetail | null;
    loadedAt: number;
}

/** Cache en mémoire de session pour éviter de recharger toute la boîte IMAP à chaque changement d'onglet. */
let inboxSessionCache: InboxSessionCache | null = null;

/** Cache des messages complets déjà ouverts ou préchargés (évite l'attente IMAP entre deux emails). */
const detailSessionCache = new Map<number, MessageDetail>();
const inflightDetailFetches = new Map<number, Promise<MessageDetail | null>>();

interface GmailInboxProps {
    /** Ligne de signature utilisée dans les brouillons (ex. « Bien cordialement, Alva DALERY »). */
    signature?: string;
    /** Directives stylistiques configurées par l'utilisateur. */
    writingStyle?: string;
}

export const GmailInbox: React.FC<GmailInboxProps> = ({
    signature = "",
    writingStyle = "",
}) => {
    const [status, setStatus] = useState<GmailStatus | null>(() => inboxSessionCache?.status ?? null);
    const [messages, setMessages] = useState<InboxMessage[]>(
        () => inboxSessionCache?.messages ?? []
    );
    const [total, setTotal] = useState(() => inboxSessionCache?.total ?? 0);
    const [limit, setLimit] = useState(() => inboxSessionCache?.limit ?? PAGE_SIZE);
    const [loading, setLoading] = useState(
        () => !(inboxSessionCache?.status?.configured && inboxSessionCache.messages.length > 0)
    );
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>(() => inboxSessionCache?.filter ?? "reply");

    const [detail, setDetail] = useState<MessageDetail | null>(() => {
        if (!inboxSessionCache?.detail) return null;
        const stillExists = inboxSessionCache.messages.some(
            (m) => m.uid === inboxSessionCache?.detail?.uid
        );
        return stillExists ? inboxSessionCache.detail : null;
    });
    const [expanded, setExpanded] = useState(true);
    const [viewMode, setViewMode] = useState<"html" | "text">("html");
    const [iframeHeight, setIframeHeight] = useState(320);
    const iframeObserverRef = useRef<ResizeObserver | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [reply, setReply] = useState("");
    const [forceReply, setForceReply] = useState(false);
    const [draftSubject, setDraftSubject] = useState<string | null>(null);
    const [draftIntent, setDraftIntent] = useState<string | null>(null);
    const [draftRegister, setDraftRegister] = useState<"vouvoiement" | "tutoiement" | null>(null);
    const [draftAiPowered, setDraftAiPowered] = useState<boolean | null>(null);
    const [draftInstruction, setDraftInstruction] = useState("");
    const [drafting, setDrafting] = useState(false);
    const [resolvingTracking, setResolvingTracking] = useState(false);
    const [fetchingHistory, setFetchingHistory] = useState(false);
    const [trackingResolveNote, setTrackingResolveNote] = useState<string | null>(null);
    const [editingTracking, setEditingTracking] = useState(false);
    const [manualTrackingNumber, setManualTrackingNumber] = useState("");
    const [manualTrackingCarrier, setManualTrackingCarrier] = useState("");
    const [editingStatus, setEditingStatus] = useState(false);
    const [manualStatus, setManualStatus] = useState("");
    const [editingEstimatedDelivery, setEditingEstimatedDelivery] = useState(false);
    const [manualEstimatedDelivery, setManualEstimatedDelivery] = useState("");
    const [editingDeliveryCity, setEditingDeliveryCity] = useState(false);
    const [manualDeliveryCity, setManualDeliveryCity] = useState("");
    const [selectedTrackingImages, setSelectedTrackingImages] = useState<string[]>([]);
    const [manualProductTitle, setManualProductTitle] = useState("");
    const [productTitleEdited, setProductTitleEdited] = useState(false);
    const [manualHistoryEntry, setManualHistoryEntry] = useState("");
    const [autoHistoryEntry, setAutoHistoryEntry] = useState("");
    const [historyEntryLearned, setHistoryEntryLearned] = useState(false);
    const [detailCacheVersion, setDetailCacheVersion] = useState(0);
    const [orderGroupOverrides, setOrderGroupOverrides] = useState<Record<number, string>>(() =>
        loadOrderGroupOverrides()
    );
    const [collapsedOrderGroups, setCollapsedOrderGroups] = useState<Record<string, boolean>>({});
    const [draggingOrderUid, setDraggingOrderUid] = useState<number | null>(null);
    const [dragOverGroupKey, setDragOverGroupKey] = useState<string | null>(null);
    const [sending, setSending] = useState<"draft" | "send" | null>(null);
    const autoOpenedRef = useRef(Boolean(inboxSessionCache?.messages.length));
    const [folders, setFolders] = useState<{ path: string; label: string; kind: string }[]>(
        () => inboxSessionCache?.folders ?? []
    );
    const [folderTarget, setFolderTarget] = useState("");
    const [moving, setMoving] = useState(false);
    const [styleSamples, setStyleSamples] = useState(0);
    const [suggestedFolders, setSuggestedFolders] = useState<FolderSuggestion[]>([]);
    const [suggesting, setSuggesting] = useState(false);
    const [suggestMeta, setSuggestMeta] = useState<{
        scanned: number;
        withSender: number;
        errors: number;
    } | null>(null);
    const [suggestProgress, setSuggestProgress] = useState<{
        processed: number;
        total: number;
    } | null>(null);
    const [suggestError, setSuggestError] = useState<string | null>(null);
    const [invoiceProposal, setInvoiceProposal] = useState<InvoiceProposal | null>(null);
    const [invoiceNames, setInvoiceNames] = useState<Record<string, string>>({});
    const [invoiceLoading, setInvoiceLoading] = useState(false);
    const [invoiceWorking, setInvoiceWorking] = useState(false);
    const [invoiceError, setInvoiceError] = useState<string | null>(null);
    const [invoicePreviewOk, setInvoicePreviewOk] = useState<boolean | null>(null);
    const [invoiceRows, setInvoiceRows] = useState<Record<number, InvoiceRow>>({});
    const [invoiceBatchLoading, setInvoiceBatchLoading] = useState(false);
    const [invoiceBatchWorking, setInvoiceBatchWorking] = useState(false);
    const [invoiceBatchMessage, setInvoiceBatchMessage] = useState<string | null>(null);
    const invoiceRequestedRef = useRef<Set<number>>(new Set());
    const mountedRef = useRef(true);
    const [labelOverrides, setLabelOverrides] = useState<Record<number, GmailCategory>>({});
    const [commandFolder, setCommandFolder] = useState("");
    const [commandSaving, setCommandSaving] = useState(false);
    const [coverOverrides, setCoverOverrides] = useState<Record<string, string>>({});
    const [loanMetaOverrides, setLoanMetaOverrides] = useState<Record<string, LoanMetaOverride>>({});
    const [loanExtensions, setLoanExtensions] = useState<Record<string, boolean>>({});
    const [loanDueOverrides, setLoanDueOverrides] = useState<Record<string, string>>({});
    const [selectedLoans, setSelectedLoans] = useState<Record<string, boolean>>({});
    const [bulkDueDate, setBulkDueDate] = useState("");
    /** Étiquettes renvoyées par le serveur, pour pouvoir revenir en « Automatique ». */
    const rawLabelsRef = useRef<
        Record<number, { category: GmailCategory; needsReply: boolean; reason: string }>
    >(inboxSessionCache?.rawLabels ?? {});

    const load = useCallback(
        async (requestedLimit: number) => {
            // Hydrate instantanément depuis le cache local si la liste est encore vide
            if (typeof window !== "undefined") {
                try {
                    const cachedRaw = window.localStorage.getItem(INBOX_CACHE_KEY);
                    if (cachedRaw) {
                        const cached = JSON.parse(cachedRaw) as {
                            messages?: InboxMessage[];
                            total?: number;
                            status?: GmailStatus;
                        };
                        if (cached.messages?.length && !inboxSessionCache?.messages?.length) {
                            setMessages(cached.messages);
                            if (typeof cached.total === "number") setTotal(cached.total);
                            if (cached.status) setStatus(cached.status);
                            setLoading(false);
                        }
                    }
                } catch {
                    // Cache local ignoré s'il est invalide.
                }
            }

            setLoading((prev) => (inboxSessionCache?.messages?.length ? false : prev));
            setError(null);
            try {
                const [statusResponse, messagesResponse] = await Promise.all([
                    fetch("/api/gmail/status", {
                        cache: "no-store",
                        credentials: "same-origin",
                    }),
                    fetch(`/api/gmail/messages?limit=${requestedLimit}`, {
                        cache: "no-store",
                        credentials: "same-origin",
                    }),
                ]);
                const statusData = (await statusResponse.json()) as GmailStatus;
                setStatus(statusData);

                if (!statusData.configured) {
                    setMessages([]);
                    setTotal(0);
                    return;
                }
                if (statusData.error) {
                    setError(statusData.error);
                    return;
                }

                const messagesData = (await messagesResponse.json()) as {
                    messages?: InboxMessage[];
                    total?: number;
                    error?: string;
                };
                if (!messagesResponse.ok) {
                    setError(messagesData.error ?? "Impossible de lire la boîte de réception.");
                    return;
                }
                const incoming = messagesData.messages ?? [];
                const totalAvailable = messagesData.total ?? 0;
                const overrides = loadLabelOverrides();
                rawLabelsRef.current = Object.fromEntries(
                    incoming.map((message) => [
                        message.uid,
                        {
                            category: message.category,
                            needsReply: message.needsReply,
                            reason: message.reason,
                        },
                    ])
                );
                const labelled = incoming.map((message) =>
                    applyLabelOverride(message, overrides[message.uid])
                );
                setLabelOverrides(overrides);
                setMessages(labelled);
                setTotal(totalAvailable);
                if (typeof window !== "undefined") {
                    try {
                        window.localStorage.setItem(
                            INBOX_CACHE_KEY,
                            JSON.stringify({
                                status: statusData,
                                messages: labelled.slice(0, PAGE_SIZE),
                                total: totalAvailable,
                            })
                        );
                    } catch {
                        // Quota dépassé : on continue sans cache disque.
                    }
                }

                // Première ouverture : on sélectionne directement l'email le plus ancien
                // (en bas de la liste triée du plus récent au plus ancien) et on précharge
                // les 2 suivants sans saturer les connexions IMAP.
                if (!autoOpenedRef.current) {
                    const replyPool = labelled.filter((message) => message.needsReply);
                    const activePool = replyPool.length > 0 ? replyPool : labelled;
                    const oldestTarget = activePool[activePool.length - 1];
                    if (oldestTarget) {
                        autoOpenedRef.current = true;
                        void openMessage(oldestTarget.uid);
                    }
                }
            } catch {
                setError("Connexion à l'API impossible. Vérifiez votre connexion réseau.");
            } finally {
                setLoading(false);
            }
        },
        []
    );

    useEffect(() => {
        if (!status) return;
        inboxSessionCache = {
            status,
            messages,
            total,
            limit,
            folders,
            rawLabels: rawLabelsRef.current,
            filter,
            detail,
            loadedAt: inboxSessionCache?.loadedAt ?? Date.now(),
        };
    }, [status, messages, total, limit, folders, filter, detail]);

    useEffect(() => {
        const hasCachedMessages = Boolean(
            inboxSessionCache?.status?.configured && inboxSessionCache.messages.length > 0
        );
        if (!hasCachedMessages) {
            void load(limit);
        }
        // Le chargement initial suffit : « Rafraîchir » relance explicitement.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!feedback) return;
        const timer = setTimeout(() => setFeedback(null), 5000);
        return () => clearTimeout(timer);
    }, [feedback]);

    useEffect(() => {
        if (!status?.configured || folders.length > 0) return;
        let cancelled = false;
        (async () => {
            try {
                const response = await fetch("/api/gmail/folders", {
                    cache: "no-store",
                    credentials: "same-origin",
                });
                const data = (await response.json()) as {
                    folders?: { path: string; label: string; kind: string }[];
                };
                if (!cancelled) setFolders(data.folders ?? []);
            } catch {
                if (!cancelled) setFolders([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [status?.configured]);

    useEffect(() => {
        setStyleSamples(loadSamples().length);
        setCoverOverrides(loadCoverOverrides());
        setLoanMetaOverrides(loadLoanMetaOverrides());
        setLoanExtensions(loadLoanExtensions());
        setLoanDueOverrides(loadLoanDueOverrides());
    }, []);

    // Dossier proposé pour ranger une commande : « Commandes et factures » ou « Commandes/factures » en priorité.
    const defaultCommandFolder = useMemo(() => {
        if (folders.length === 0) return "";
        const score = (folder: { path: string; label: string }) => {
            const value = `${folder.label} ${folder.path}`
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
            const hasCmd = /commande/.test(value);
            const hasFac = /facture/.test(value);
            if (hasCmd && hasFac) {
                // Préférer le dossier principal « Commandes et factures » aux sous-dossiers
                return folder.label.includes("/") ? 3 : 4;
            }
            if (hasCmd) return 2;
            if (hasFac) return 1;
            return 0;
        };
        const best = [...folders].sort((a, b) => score(b) - score(a))[0];
        return best && score(best) > 0 ? best.path : "";
    }, [folders]);

    useEffect(() => {
        if (!detail) return;
        if (detail.tracking || detail.category === "commande") {
            if (!commandFolder || !folders.some((folder) => folder.path === commandFolder)) {
                setCommandFolder(defaultCommandFolder);
            }
            if (!detail.tracking && !folderTarget && defaultCommandFolder) {
                setFolderTarget(defaultCommandFolder);
            }
        }
    }, [detail, folders, commandFolder, folderTarget, defaultCommandFolder]);

    const toReply = useMemo(() => messages.filter((message) => message.needsReply), [messages]);
    const toRead = useMemo(
        () =>
            messages.filter(
                (message) => message.category === "important" || message.category === "infos"
            ),
        [messages]
    );
    const factures = useMemo(
        () => messages.filter((message) => message.category === "factures"),
        [messages]
    );
    const commandes = useMemo(
        () => messages.filter((message) => message.category === "commande"),
        [messages]
    );
    const alertes = useMemo(
        () => messages.filter((message) => message.category === "alertes"),
        [messages]
    );
    const kiosque = useMemo(
        () => messages.filter((message) => message.category === "kiosque"),
        [messages]
    );
    const bibliotheques = useMemo(
        () => messages.filter((message) => message.category === "bibliotheque"),
        [messages]
    );
    const later = useMemo(() => messages.filter((message) => isLater(message.category)), [messages]);

    const visibleMessages =
        filter === "reply"
            ? toReply
            : filter === "read"
                ? toRead
                : filter === "factures"
                    ? factures
                    : filter === "commande"
                        ? commandes
                        : filter === "alertes"
                            ? alertes
                            : filter === "kiosque"
                                ? kiosque
                                : filter === "bibliotheque"
                                    ? bibliotheques
                                    : filter === "later"
                                        ? later
                                        : messages;

    const commandeGroups = useMemo(() => {
        if (filter !== "commande") return [];
        const groups = new Map<
            string,
            {
                key: string;
                storeName: string;
                productTitle: string | null;
                orderNumber: string | null;
                trackingNumber: string | null;
                items: InboxMessage[];
            }
        >();

        const normSender = (v: string | null | undefined) =>
            v ? v.trim().toLowerCase().replace(/\s+/g, " ") : "";
        const normOrder = (v: string | null | undefined) =>
            v ? v.trim().replace(/^[#°\s]+/, "").toUpperCase() : "";
        const normTrack = (v: string | null | undefined) =>
            v ? v.trim().toUpperCase() : "";
        const isGenericCarrier = (name: string) =>
            /\b(?:la poste|colissimo|chronopost|ups|dhl|fedex|dpd|gls|mondial\s*relay|relais\s*colis|colis\s*priv[ée]|cainiao|parcellab|sendcloud)\b/i.test(
                name.trim()
            ) || /^colis$/i.test(name.trim());

        const extractMerchantFromCarrierText = (subject: string, text: string): string | null => {
            const combined = `${subject}\n${text.slice(0, 1200)}`;
            const m = combined.match(
                /(?:exp[ée]di[ée]\s+par|exp[ée]diteur\s*[:\-]|commande\s+(?:chez|sur|aupr[èe]s\s+de)|votre\s+colis\s+(?:chez|de))\s+([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ0-9&'’ -]{2,35}?)(?=\s*(?:est|a\s+[ée]t[ée]|vous|va|arrive|sera|\.|,|\n|$))/i
            );
            const candidate = m?.[1]?.trim();
            if (!candidate || isGenericCarrier(candidate)) return null;
            if (/^(?:votre|mon|notre|client|colis|commande|livraison)$/i.test(candidate)) return null;
            return candidate;
        };

        // Passe 1 : recenser les marchands (non-transporteurs) et relier n° de commande / n° de suivi -> marchand
        const knownMerchants = new Set<string>();
        const orderToMerchant = new Map<string, string>();
        const trackToMerchant = new Map<string, string>();
        const urlToMerchant = new Map<string, string>();

        for (const msg of visibleMessages) {
            const cached = detailSessionCache.get(msg.uid);
            const rawOrder = normOrder(cached?.tracking?.orderNumber ?? msg.orderNumber);
            const tNums = Array.from(
                new Set(
                    [
                        ...(cached?.tracking?.numbers ?? []),
                        ...(msg.trackingNumber ? [msg.trackingNumber] : []),
                    ]
                        .map(normTrack)
                        .filter(Boolean)
                )
            );
            const tUrl = cached?.tracking?.url?.trim() || "";
            const matchedParcel = findMatchingParcel({
                uid: msg.uid,
                orderNumber: rawOrder || null,
                numbers: tNums,
                url: tUrl || null,
            });
            const candidateStore =
                (matchedParcel?.store && !isGenericCarrier(matchedParcel.store)
                    ? matchedParcel.store
                    : null) ||
                (cached?.tracking?.store && !isGenericCarrier(cached.tracking.store)
                    ? cached.tracking.store.trim()
                    : null) ||
                (!isGenericCarrier(msg.fromName) ? msg.fromName.trim() : null);

            if (candidateStore) {
                knownMerchants.add(candidateStore);
                if (rawOrder && !orderToMerchant.has(rawOrder)) {
                    orderToMerchant.set(rawOrder, candidateStore);
                }
                for (const tn of tNums) {
                    if (!trackToMerchant.has(tn)) trackToMerchant.set(tn, candidateStore);
                }
                if (tUrl && !urlToMerchant.has(tUrl)) {
                    urlToMerchant.set(tUrl, candidateStore);
                }
            }
        }

        // Passe 2 : assigner chaque email au groupe de son site marchand (jamais au transporteur si le marchand est connu)
        for (const msg of visibleMessages) {
            const cached = detailSessionCache.get(msg.uid);
            const rawOrder = cached?.tracking?.orderNumber ?? msg.orderNumber ?? null;
            const oNum = normOrder(rawOrder);
            const tNums = Array.from(
                new Set(
                    [
                        ...(cached?.tracking?.numbers ?? []),
                        ...(msg.trackingNumber ? [msg.trackingNumber] : []),
                    ]
                        .map(normTrack)
                        .filter(Boolean)
                )
            );
            const tUrl = cached?.tracking?.url?.trim() || "";
            const matchedParcel = findMatchingParcel({
                uid: msg.uid,
                orderNumber: oNum || null,
                numbers: tNums,
                url: tUrl || null,
            });

            let merchantName =
                (matchedParcel?.store && !isGenericCarrier(matchedParcel.store)
                    ? matchedParcel.store
                    : null) ||
                (oNum ? orderToMerchant.get(oNum) : undefined) ||
                tNums.map((tn) => trackToMerchant.get(tn)).find(Boolean) ||
                (tUrl ? urlToMerchant.get(tUrl) : undefined) ||
                (cached?.tracking?.store && !isGenericCarrier(cached.tracking.store)
                    ? cached.tracking.store.trim()
                    : null) ||
                (!isGenericCarrier(msg.fromName) ? msg.fromName.trim() : null);

            // Si l'email vient d'un transporteur (ex. Colissimo), vérifier si l'objet ou le corps cite un marchand connu ou mentionne l'expéditeur
            if (!merchantName) {
                const haystack = `${msg.subject}\n${cached?.text ?? ""}`.toLowerCase();
                merchantName =
                    Array.from(knownMerchants).find((m) => haystack.includes(m.toLowerCase())) ??
                    extractMerchantFromCarrierText(msg.subject, cached?.text ?? "") ??
                    null;
            }

            const fallbackSender =
                msg.fromName?.trim() || msg.fromEmail?.trim() || "Expéditeur inconnu";
            const resolvedStore = merchantName || fallbackSender;
            const norm = normSender(resolvedStore);

            const manualOverride = orderGroupOverrides[msg.uid];
            const learnedRule = !manualOverride
                ? findLearnedOrderGroupRule({ fromEmail: msg.fromEmail, subject: msg.subject })
                : null;
            const learnedStore =
                learnedRule?.targetStore && !isGenericCarrier(learnedRule.targetStore)
                    ? learnedRule.targetStore
                    : null;

            const key =
                manualOverride ||
                (learnedStore ? `sender:${normSender(learnedStore)}` : undefined) ||
                (norm ? `sender:${norm}` : `uid:${msg.uid}`);

            const candidateProduct =
                (detail?.uid === msg.uid && manualProductTitle.trim()
                    ? manualProductTitle.trim()
                    : null) ||
                matchedParcel?.productTitle ||
                cached?.tracking?.productTitle ||
                null;

            const existing = groups.get(key);
            if (existing) {
                existing.items.push(msg);
                if (!existing.orderNumber && rawOrder) existing.orderNumber = rawOrder;
                if (!existing.trackingNumber && tNums[0]) existing.trackingNumber = tNums[0];
                if (isGenericCarrier(existing.storeName) && !isGenericCarrier(resolvedStore)) {
                    existing.storeName = resolvedStore;
                }
                if (!existing.productTitle && candidateProduct) {
                    existing.productTitle = candidateProduct;
                }
            } else {
                groups.set(key, {
                    key,
                    storeName: learnedStore || resolvedStore,
                    productTitle: candidateProduct,
                    orderNumber: rawOrder ?? matchedParcel?.orderNumber ?? null,
                    trackingNumber: tNums[0] ?? matchedParcel?.numbers[0] ?? null,
                    items: [msg],
                });
            }
        }

        // Passe 3 : résoudre l'intitulé du produit en priorité depuis le mail le plus ancien du groupe
        for (const group of groups.values()) {
            const byOldest = [...group.items].sort((a, b) =>
                a.date < b.date ? -1 : a.date > b.date ? 1 : 0
            );
            let resolvedTitle: string | null = null;
            for (const item of byOldest) {
                const cached = detailSessionCache.get(item.uid);
                const matched = findMatchingParcel({
                    uid: item.uid,
                    orderNumber: cached?.tracking?.orderNumber ?? item.orderNumber ?? null,
                    numbers:
                        cached?.tracking?.numbers ??
                        (item.trackingNumber ? [item.trackingNumber] : []),
                    url: cached?.tracking?.url ?? null,
                });
                const candidate =
                    (detail?.uid === item.uid && manualProductTitle.trim()
                        ? manualProductTitle.trim()
                        : null) ||
                    matched?.productTitle ||
                    cached?.tracking?.productTitle ||
                    null;
                if (candidate) {
                    resolvedTitle = candidate;
                    break;
                }
            }
            if (resolvedTitle) {
                group.productTitle = resolvedTitle;
            }
        }

        return Array.from(groups.values());
    }, [filter, visibleMessages, detail, detailCacheVersion, orderGroupOverrides, manualProductTitle]);

    function moveMessageToOrderGroup(msg: InboxMessage, targetKey: string) {
        const nextOverrides = { ...orderGroupOverrides, [msg.uid]: targetKey };
        setOrderGroupOverrides(nextOverrides);
        saveOrderGroupOverrides(nextOverrides);

        const targetGroup = commandeGroups.find((g) => g.key === targetKey);
        if (targetGroup) {
            learnOrderGroupRule({
                fromEmail: msg.fromEmail,
                subject: msg.subject,
                targetOrderNumber: targetGroup.orderNumber,
                targetTrackingNumber: targetGroup.trackingNumber,
                targetStore: targetGroup.storeName,
            });
            setFeedback(`Email déplacé vers « ${targetGroup.storeName} » (mémorisé).`);
        } else {
            setFeedback("Email séparé dans un nouveau groupe.");
        }
    }

    const invoiceRowList = useMemo(
        () =>
            factures
                .map((message) => invoiceRows[message.uid])
                .filter((row): row is InvoiceRow => Boolean(row)),
        [factures, invoiceRows]
    );
    const selectableInvoiceRows = useMemo(
        () => invoiceRowList.filter((row) => row.status === "ready"),
        [invoiceRowList]
    );
    const selectedInvoiceRows = useMemo(
        () => invoiceRowList.filter((row) => row.selected && row.status === "ready"),
        [invoiceRowList]
    );
    const allInvoicesSelected =
        selectableInvoiceRows.length > 0 && selectableInvoiceRows.every((row) => row.selected);

    const messagesForFilter = (value: Filter) => {
        switch (value) {
            case "reply":
                return toReply;
            case "read":
                return toRead;
            case "factures":
                return factures;
            case "commande":
                return commandes;
            case "alertes":
                return alertes;
            case "kiosque":
                return kiosque;
            case "bibliotheque":
                return bibliotheques;
            case "later":
                return later;
            default:
                return messages;
        }
    };

    const changeFilter = (value: Filter) => {
        setFilter(value);
        setInvoiceProposal(null);
        setInvoiceError(null);
        setInvoicePreviewOk(null);
        setInvoiceBatchMessage(null);
        // L'onglet Factures est un écran de traitement en lot : on n'ouvre aucun
        // email, les noms des PDF se chargent en arrière-plan.
        if (value === "factures") {
            setDetail(null);
            setExpanded(false);
            return;
        }
        const list = messagesForFilter(value);
        if (list.length > 0) {
            const oldest = list[list.length - 1];
            void openMessage(oldest.uid);
            const nextOldestToNewest = list
                .slice(Math.max(0, list.length - 7), list.length - 1)
                .reverse()
                .map((m) => m.uid);
            void prefetchUids(nextOldestToNewest);
        } else {
            setDetail(null);
        }
    };

    async function fetchMessageDetail(uid: number): Promise<MessageDetail | null> {
        let cached = detailSessionCache.get(uid);
        if (!cached && typeof window !== "undefined") {
            try {
                const raw = window.sessionStorage.getItem(DETAIL_CACHE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw) as Record<string, MessageDetail>;
                    if (parsed[String(uid)]) {
                        cached = parsed[String(uid)];
                        detailSessionCache.set(uid, cached);
                    }
                }
            } catch {
                // Cache session indisponible.
            }
        }
        if (cached) return cached;

        const existingInflight = inflightDetailFetches.get(uid);
        if (existingInflight) return existingInflight;

        const promise = (async (): Promise<MessageDetail | null> => {
            try {
                const response = await fetch(`/api/gmail/message?uid=${uid}`, {
                    cache: "no-store",
                    credentials: "same-origin",
                });
                const data = (await response.json()) as MessageDetail & { error?: string };
                if (!response.ok) return null;
                detailSessionCache.set(uid, data);
                if (detailSessionCache.size > 40) {
                    const oldestKey = detailSessionCache.keys().next().value;
                    if (oldestKey !== undefined) detailSessionCache.delete(oldestKey);
                }
                if (typeof window !== "undefined") {
                    try {
                        const entries = Array.from(detailSessionCache.entries()).slice(-15);
                        window.sessionStorage.setItem(
                            DETAIL_CACHE_KEY,
                            JSON.stringify(Object.fromEntries(entries))
                        );
                    } catch {
                        // Quota sessionStorage dépassé : on conserve le cache mémoire.
                    }
                }
                setDetailCacheVersion((v) => v + 1);
                return data;
            } catch {
                return null;
            } finally {
                inflightDetailFetches.delete(uid);
            }
        })();

        inflightDetailFetches.set(uid, promise);
        return promise;
    }

    async function prefetchUids(uids: number[], concurrency = 1) {
        const pending = uids.filter(
            (id) => !detailSessionCache.has(id) && !inflightDetailFetches.has(id)
        );
        if (pending.length === 0) return;
        let cursor = 0;
        const worker = async () => {
            while (cursor < pending.length) {
                const nextId = pending[cursor++];
                await fetchMessageDetail(nextId);
            }
        };
        const workers = Array.from({ length: Math.min(concurrency, pending.length) }, () =>
            worker()
        );
        await Promise.all(workers);
    }

    function prefetchNextMessages(_currentUid: number) {
        // Désactivé pour éviter de multiplier les connexions IMAP simultanées vers Gmail.
    }

    async function openMessage(uid: number) {
        const cached = detailSessionCache.get(uid);
        setLoadingDetail(!cached);
        if (!cached) setDetail(null);
        setExpanded(true);
        setViewMode("html");
        setIframeHeight(320);
        setForceReply(false);
        setFolderTarget("");
        setReply("");
        setDraftSubject(null);
        setDraftIntent(null);
        setDraftRegister(null);
        setDraftAiPowered(null);
        setDraftInstruction("");
        setCommandFolder("");
        setTrackingResolveNote(null);
        setEditingTracking(false);
        setManualTrackingNumber("");
        setManualTrackingCarrier("");
        setEditingStatus(false);
        setManualStatus("");
        setEditingEstimatedDelivery(false);
        setManualEstimatedDelivery("");
        setEditingDeliveryCity(false);
        setManualDeliveryCity("");
        setManualHistoryEntry("");
        setAutoHistoryEntry("");
        setHistoryEntryLearned(false);
        try {
            const data = cached ?? (await fetchMessageDetail(uid));
            if (!data) {
                setError("Impossible d'ouvrir ce message.");
                return;
            }
            const labelled = applyLabelOverride(data, labelOverrides[data.uid]);
            setDetail(labelled);
            prefetchNextMessages(uid);
            if (labelled.tracking) {
                setManualTrackingNumber(labelled.tracking.numbers[0] ?? "");
                setManualTrackingCarrier(labelled.tracking.carrier ?? "");
                const emailImages = labelled.tracking.images ?? [];
                const existingMatch = findMatchingParcel({
                    uid: labelled.uid,
                    store:
                        labelled.tracking.store?.trim() ||
                        labelled.fromName ||
                        labelled.tracking.carrier ||
                        "Colis",
                    orderNumber: labelled.tracking.orderNumber ?? null,
                    numbers: labelled.tracking.numbers,
                    url: labelled.tracking.url,
                    shippedAt: labelled.date,
                });
                const preservedImages =
                    existingMatch?.images && existingMatch.images.length > 0
                        ? emailImages.filter((u) => existingMatch.images!.includes(u))
                        : [];
                setSelectedTrackingImages(preservedImages);
                const learnedTitle = applyLearnedLabelEdits(
                    labelled.tracking.productTitle,
                    "productTitle"
                ).value;
                setManualProductTitle(
                    existingMatch?.productTitle || learnedTitle || ""
                );
                setProductTitleEdited(false);
                const storeNameForHistory =
                    labelled.tracking.store?.trim() ||
                    labelled.fromName ||
                    labelled.tracking.carrier ||
                    "Colis";
                const rawHistoryEntry = labelled.tracking.history?.[0] ?? "";
                const learnedSuggestion = applyLearnedHistoryLabel(rawHistoryEntry, {
                    store: storeNameForHistory,
                    subject: labelled.subject,
                });
                setAutoHistoryEntry(rawHistoryEntry);
                setManualHistoryEntry(learnedSuggestion.value);
                setHistoryEntryLearned(learnedSuggestion.learned);
                const strippedLearnedStatus = learnedSuggestion.value.replace(
                    /^\d{1,2}\s+[a-zA-Zéèêëàâùûîïôöç.]{2,8}\s*·\s*/,
                    ""
                );
                const baseStatus = learnedSuggestion.learned
                    ? strippedLearnedStatus
                    : (labelled.tracking.status ?? "");
                setManualStatus(applyLearnedLabelEdits(baseStatus, "status").value);
                setManualEstimatedDelivery(
                    applyLearnedLabelEdits(
                        labelled.tracking.estimatedDelivery ?? existingMatch?.estimatedDelivery ?? "",
                        "estimatedDelivery"
                    ).value
                );
                setManualDeliveryCity(
                    applyLearnedLabelEdits(
                        labelled.tracking.deliveryCity ?? existingMatch?.deliveryCity ?? "",
                        "deliveryCity"
                    ).value
                );
                const mergedInitialHistory = learnedSuggestion.value
                    ? [learnedSuggestion.value, ...(labelled.tracking.history?.slice(1) ?? [])]
                    : (labelled.tracking.history ?? []);
                // Si cette commande existe déjà dans le tableau de bord, on la met à jour
                // automatiquement avec les nouvelles infos (lien de suivi, numéro, statut).
                syncExistingParcel({
                    uid: labelled.uid,
                    store: storeNameForHistory,
                    orderNumber: labelled.tracking.orderNumber ?? null,
                    carrier: labelled.tracking.carrier,
                    numbers: labelled.tracking.numbers,
                    url: labelled.tracking.url,
                    status: labelled.tracking.status,
                    estimatedDelivery: labelled.tracking.estimatedDelivery ?? null,
                    deliveryCity: labelled.tracking.deliveryCity ?? null,
                    shippedAt: labelled.date,
                    subject: labelled.subject,
                    history: mergedInitialHistory,
                    productTitle: existingMatch?.productTitle || labelled.tracking.productTitle || null,
                });
                if (labelled.tracking.url && labelled.tracking.numbers.length === 0) {
                    void resolveTrackingFromUrl(labelled.uid, labelled.tracking.url);
                }
            }
            // Pas de suggestion de dossier pour une commande (dossier présélectionné)
            // ni pour le Kiosque (lecture seule, pas de rangement automatique).
            if (labelled.category !== "commande" && labelled.category !== "kiosque") {
                void suggestFolderFor(data.uid);
            }
            setInvoiceProposal(null);
            setInvoiceNames({});
            setInvoiceError(null);
            setInvoicePreviewOk(null);
            if (labelled.category === "factures") {
                void loadInvoice(data.uid);
            }
            // Proposition immédiate : dès qu'un email attend une réponse, on rédige.
            if (labelled.needsReply) {
                void generateDraft(labelled);
            }
        } catch {
            setError("Impossible de charger le message.");
        } finally {
            setLoadingDetail(false);
        }
    }

    async function resolveTrackingFromUrl(uid: number, url: string) {
        setResolvingTracking(true);
        setTrackingResolveNote(null);
        try {
            const res = await fetch("/api/gmail/tracking-resolve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ url }),
            });
            const data = (await res.json()) as {
                resolved?: boolean;
                numbers?: string[];
                carrier?: string | null;
                status?: string | null;
                directCarrierUrl?: string | null;
                note?: string;
            };
            if (!res.ok) return;

            if (data.resolved && Array.isArray(data.numbers) && data.numbers.length > 0) {
                setDetail((prev) => {
                    if (!prev || prev.uid !== uid || !prev.tracking) return prev;
                    const mergedNumbers = Array.from(
                        new Set([...data.numbers!, ...prev.tracking.numbers])
                    );
                    const nextTracking: TrackingInfo = {
                        ...prev.tracking,
                        numbers: mergedNumbers,
                        carrier: data.carrier || prev.tracking.carrier,
                        status: data.status || prev.tracking.status,
                        url: data.directCarrierUrl || prev.tracking.url,
                    };
                    syncExistingParcel({
                        uid: prev.uid,
                        store: nextTracking.store?.trim() || prev.fromName || nextTracking.carrier || "Colis",
                        orderNumber: nextTracking.orderNumber ?? null,
                        carrier: nextTracking.carrier,
                        numbers: nextTracking.numbers,
                        url: nextTracking.url,
                        status: nextTracking.status,
                        shippedAt: prev.date,
                    });
                    return {
                        ...prev,
                        tracking: nextTracking,
                    };
                });
                setManualTrackingNumber(data.numbers[0] ?? "");
                if (data.carrier) setManualTrackingCarrier(data.carrier);
            } else if (data.note) {
                setTrackingResolveNote(data.note);
            }
        } catch {
            // silent fallback
        } finally {
            setResolvingTracking(false);
        }
    }

    function applyManualTracking() {
        const cleanedNum = manualTrackingNumber.trim().toUpperCase();
        const cleanedCarrier = manualTrackingCarrier.trim();
        setDetail((prev) => {
            if (!prev || !prev.tracking) return prev;
            const nextNumbers = cleanedNum
                ? Array.from(new Set([cleanedNum, ...prev.tracking.numbers.filter((n) => n !== cleanedNum)]))
                : prev.tracking.numbers;
            const isColissimo =
                /colissimo|la poste/i.test(cleanedCarrier) ||
                /^[689][A-Z][0-9A-Z]{11,13}$/.test(cleanedNum) ||
                /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(cleanedNum);
            const nextCarrier = cleanedCarrier || (isColissimo ? "Colissimo" : prev.tracking.carrier);
            const nextUrl =
                cleanedNum && isColissimo
                    ? `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(cleanedNum)}`
                    : prev.tracking.url;
            const nextTracking: TrackingInfo = {
                ...prev.tracking,
                numbers: nextNumbers,
                carrier: nextCarrier,
                url: nextUrl,
            };
            syncExistingParcel({
                uid: prev.uid,
                store: nextTracking.store?.trim() || prev.fromName || nextTracking.carrier || "Colis",
                orderNumber: nextTracking.orderNumber ?? null,
                carrier: nextTracking.carrier,
                numbers: nextTracking.numbers,
                url: nextTracking.url,
                shippedAt: prev.date,
            });
            return {
                ...prev,
                tracking: nextTracking,
            };
        });
        setEditingTracking(false);
        setTrackingResolveNote(null);
    }

    async function fetchTrackingHistory(uid: number, trackingNumber: string) {
        if (!trackingNumber || fetchingHistory) return;
        setFetchingHistory(true);
        setTrackingResolveNote(null);
        try {
            const res = await fetch("/api/gmail/tracking-history", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getLaPosteHeaders(),
                },
                credentials: "same-origin",
                body: JSON.stringify({ trackingNumber }),
            });
            const data = (await res.json()) as {
                ok?: boolean;
                status?: string | null;
                history?: string[];
                note?: string;
                error?: string;
            };
            if (!res.ok) {
                setTrackingResolveNote(data.error || "Impossible de récupérer l'historique Ship24.");
                return;
            }
            if (Array.isArray(data.history) && data.history.length > 0) {
                setDetail((prev) => {
                    if (!prev || prev.uid !== uid || !prev.tracking) return prev;
                    const nextTracking: TrackingInfo = {
                        ...prev.tracking,
                        status: data.status || prev.tracking.status,
                        history: data.history!,
                    };
                    syncExistingParcel({
                        uid: prev.uid,
                        store: nextTracking.store?.trim() || prev.fromName || nextTracking.carrier || "Colis",
                        orderNumber: nextTracking.orderNumber ?? null,
                        carrier: nextTracking.carrier,
                        numbers: nextTracking.numbers,
                        url: nextTracking.url,
                        status: nextTracking.status,
                        history: nextTracking.history ?? [],
                        shippedAt: prev.date,
                    });
                    return {
                        ...prev,
                        tracking: nextTracking,
                    };
                });
            } else if (data.note) {
                setTrackingResolveNote(data.note);
            }
        } catch {
            setTrackingResolveNote("Erreur réseau lors de l'appel à Ship24.");
        } finally {
            setFetchingHistory(false);
        }
    }

    async function generateDraft(target: MessageDetail | null = detail) {
        if (!target) return;
        setDrafting(true);
        setFeedback(null);
        try {
            const response = await fetch("/api/gmail/reply-draft", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...getAiHeaders(),
                },
                credentials: "same-origin",
                body: JSON.stringify({
                    uid: target.uid,
                    signature,
                    writingStyle,
                    instruction: draftInstruction.trim() || undefined,
                    style: computeStyleProfile(),
                }),
            });
            const data = (await response.json()) as ReplyDraftResponse;
            if (!response.ok) {
                setFeedback(data.error ?? "Impossible de rédiger la réponse.");
                return;
            }
            setReply(data.body);
            setDraftSubject(data.subject);
            setDraftIntent(data.intent);
            setDraftRegister(data.register);
            setDraftAiPowered(Boolean(data.aiPowered));
            const modeNote = data.aiPowered ? "DeepSeek IA" : "Mode règles local";
            const warningNote = data.aiWarning ? ` · ${data.aiWarning}` : "";
            setFeedback(
                data.needsReply
                    ? `Proposition prête (${modeNote}, ${data.intent}, ${data.register}, ${
                          data.exchanges ?? 1
                      } échange(s) analysé(s))${warningNote}. Relisez, ajustez, puis validez.`
                    : `Diffusion probable (${target.reason}) : à vérifier avant d'envoyer.`
            );
        } catch {
            setFeedback("Impossible de joindre le serveur.");
        } finally {
            setDrafting(false);
        }
    }

    async function suggestFolderFor(uid: number, refresh = false) {
        const target = detail && detail.uid === uid ? detail : null;
        setSuggesting(true);
        setSuggestedFolders([]);
        setSuggestError(null);
        setSuggestMeta(null);
        setSuggestProgress({ processed: 0, total: 0 });

        try {
            let offset = 0;
            let totalLabels = 0;
            let processedLabels = 0;
            let withSender = 0;
            let errors = 0;
            let guard = 0;
            const merged = new Map<string, FolderSuggestion>();

            // Boucle sur tous les lots : plus de plafond de dossiers.
            while (guard < 200) {
                guard += 1;
                const url = new URL("/api/gmail/suggest-folder", window.location.origin);
                url.searchParams.set("uid", String(uid));
                if (target) {
                    url.searchParams.set("sender", target.fromEmail);
                    url.searchParams.set("name", target.fromName);
                    url.searchParams.set("subject", target.subject);
                }
                url.searchParams.set("offset", String(offset));
                url.searchParams.set("batch", "15");
                if (refresh) url.searchParams.set("refresh", "1");

                const response = await fetch(url.toString(), {
                    cache: "no-store",
                    credentials: "same-origin",
                });
                const data = (await response.json()) as {
                    suggestions?: FolderSuggestion[];
                    scanned?: number;
                    processed?: number;
                    withSender?: number;
                    errors?: number;
                    nextOffset?: number | null;
                    error?: string;
                };

                if (!response.ok) {
                    setSuggestError(data.error ?? "La recherche de dossier a échoué.");
                    return;
                }

                totalLabels = data.scanned ?? totalLabels;
                const batchProcessed = data.processed ?? 0;
                processedLabels += batchProcessed;
                withSender += data.withSender ?? 0;
                errors += data.errors ?? 0;

                for (const suggestion of data.suggestions ?? []) {
                    const previous = merged.get(suggestion.path);
                    if (!previous || suggestion.score > previous.score) {
                        merged.set(suggestion.path, suggestion);
                    }
                }

                setSuggestProgress({ processed: processedLabels, total: totalLabels });
                setSuggestMeta({ scanned: totalLabels, withSender, errors });

                if (data.nextOffset == null) break;
                offset = data.nextOffset;
            }

            const list = [...merged.values()]
                .sort((a, b) => b.score - a.score)
                .slice(0, 5);

            setSuggestedFolders(list);
            if (list.length > 0) {
                setFolderTarget((current) => current || list[0].path);
            }
        } catch {
            setSuggestError("Impossible de joindre la recherche de dossier.");
        } finally {
            setSuggesting(false);
            setSuggestProgress(null);
        }
    }

    async function loadInvoice(uid: number) {
        setInvoiceLoading(true);
        setInvoiceError(null);
        try {
            const response = await fetch(`/api/gmail/invoice?uid=${uid}`, {
                cache: "no-store",
                credentials: "same-origin",
            });
            const data = (await response.json()) as {
                proposal?: InvoiceProposal | null;
                error?: string;
            };
            if (!response.ok) {
                setInvoiceError(data.error ?? "Analyse de la facture impossible.");
                return;
            }
            if (data.proposal) {
                setInvoiceProposal(data.proposal);
                setInvoiceNames(
                    Object.fromEntries(
                        data.proposal.files.map((file) => [file.part, file.proposed])
                    )
                );

                // Facture uniquement accessible par lien : on vérifie que le PDF
                // est réellement récupérable avant d'afficher un aperçu cassé.
                const first = data.proposal.files[0];
                if (data.proposal.link && first && !first.part) {
                    const check = await fetch(
                        `/api/gmail/invoice/download?check=1&url=${encodeURIComponent(
                            data.proposal.link
                        )}`,
                        { cache: "no-store", credentials: "same-origin" }
                    );
                    const result = (await check.json()) as { ok?: boolean; error?: string };
                    setInvoicePreviewOk(Boolean(result.ok));
                    if (!result.ok) {
                        setInvoiceError(
                            result.error ??
                                "La facture n'a pas pu être chargée depuis le lien du fournisseur."
                        );
                    }
                } else {
                    setInvoicePreviewOk(true);
                }
            }
        } catch {
            setInvoiceError("Impossible de joindre l'analyse de facture.");
        } finally {
            setInvoiceLoading(false);
        }
    }

    async function fileInvoiceToDrive(
        uid: number,
        proposal: InvoiceProposal,
        files: Array<{ part?: string; url?: string; fileName: string }>
    ) {
        const response = await fetch("/api/gmail/invoice/drive", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
                uid,
                provider: proposal.provider,
                period: proposal.period,
                files,
            }),
        });
        const data = (await response.json()) as { ok?: boolean; error?: string };
        if (!response.ok || !data.ok) {
            throw new Error(data.error ?? "Rangement sur Google Drive impossible.");
        }
    }

    async function downloadInvoice() {
        if (!invoiceProposal || !detail) return;
        const target = detail;
        setInvoiceWorking(true);
        setInvoiceError(null);
        const useDrive = Boolean(status?.driveConfigured);

        try {
            if (useDrive) {
                await fileInvoiceToDrive(
                    target.uid,
                    invoiceProposal,
                    invoiceProposal.files.map((file) => ({
                        part: file.part || undefined,
                        url: !file.part ? (invoiceProposal.link ?? file.original) : undefined,
                        fileName:
                            (invoiceNames[file.part] ?? file.proposed).trim() || file.proposed,
                    }))
                );
            } else {
                for (const file of invoiceProposal.files) {
                    const fileName =
                        (invoiceNames[file.part] ?? file.proposed).trim() || file.proposed;
                    const url = file.part
                        ? `/api/gmail/attachment?uid=${target.uid}&part=${encodeURIComponent(
                              file.part
                          )}&type=${encodeURIComponent("application/pdf")}&name=${encodeURIComponent(
                              fileName
                          )}`
                        : `/api/gmail/invoice/download?url=${encodeURIComponent(
                              invoiceProposal.link ?? file.original
                          )}`;

                    const response = await fetch(url, { credentials: "same-origin" });
                    if (!response.ok) {
                        let detail = "";
                        try {
                            const payload = (await response.json()) as { error?: string };
                            detail = payload.error ?? "";
                        } catch {
                            detail = "";
                        }
                        throw new Error(detail || "Téléchargement du PDF impossible.");
                    }

                    const blob = await response.blob();
                    const objectUrl = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = objectUrl;
                    anchor.download = fileName;
                    document.body.appendChild(anchor);
                    anchor.click();
                    anchor.remove();
                    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
                }
            }

            const deletion = await fetch("/api/gmail/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ uid: target.uid }),
            });
            const deletionData = (await deletion.json()) as { error?: string };
            if (!deletion.ok) {
                setInvoiceError(
                    deletionData.error ??
                        (useDrive
                            ? "Rangée sur Drive, mais suppression du mail impossible."
                            : "PDF téléchargé, mais suppression du mail impossible.")
                );
                return;
            }

            setMessages((previous) => previous.filter((item) => item.uid !== target.uid));
            setTotal((previous) => Math.max(0, previous - 1));
            openNextInListOrClear(target.uid);
            setFeedback(
                useDrive
                    ? "Facture rangée sur Google Drive et email supprimé."
                    : "Facture téléchargée et email supprimé."
            );
        } catch (error) {
            setInvoiceError(
                error instanceof Error
                    ? error.message
                    : useDrive
                      ? "Rangement sur Drive impossible."
                      : "Téléchargement impossible."
            );
        } finally {
            setInvoiceWorking(false);
        }
    }

    // Quand on est sur l'onglet Commandes, précharger tous les mails de commande
    // pour lire leur n° de commande, n° de suivi et lien afin de bien les regrouper.
    useEffect(() => {
        if (filter !== "commande" || commandes.length === 0) return;
        // Précharger en commençant par les plus anciens (qui contiennent les confirmations de commande)
        const oldestFirstUids = [...commandes].reverse().map((m) => m.uid);
        void prefetchUids(oldestFirstUids, 3);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter, commandes.length]);

    // ----- Onglet Factures : analyse en lot, sans ouvrir chaque email -----
    useEffect(() => {
        mountedRef.current = true;
        if (filter !== "factures") return;

        const pending = factures.filter(
            (message) => !invoiceRequestedRef.current.has(message.uid)
        );
        if (pending.length === 0) return;

        pending.forEach((message) => invoiceRequestedRef.current.add(message.uid));
        setInvoiceRows((previous) => {
            const next = { ...previous };
            pending.forEach((message) => {
                next[message.uid] = {
                    uid: message.uid,
                    subject: message.subject,
                    fromName: message.fromName,
                    date: message.date,
                    proposal: null,
                    name: "",
                    selected: false,
                    status: "pending",
                };
            });
            return next;
        });

        void (async () => {
            setInvoiceBatchLoading(true);
            for (let start = 0; start < pending.length; start += INVOICE_BATCH_CHUNK) {
                const chunk = pending.slice(start, start + INVOICE_BATCH_CHUNK);
                try {
                    const response = await fetch("/api/gmail/invoices", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "same-origin",
                        body: JSON.stringify({ uids: chunk.map((message) => message.uid) }),
                    });
                    const data = (await response.json()) as {
                        items?: { uid: number; proposal: InvoiceProposal | null; error?: string }[];
                        error?: string;
                    };
                    if (!mountedRef.current) return;

                    if (!response.ok) {
                        const reason = data.error ?? "Analyse de la facture impossible.";
                        setInvoiceRows((previous) => {
                            const next = { ...previous };
                            chunk.forEach((message) => {
                                const current = next[message.uid];
                                if (current) {
                                    next[message.uid] = {
                                        ...current,
                                        status: "error",
                                        error: reason,
                                    };
                                }
                            });
                            return next;
                        });
                        continue;
                    }

                    setInvoiceRows((previous) => {
                        const next = { ...previous };
                        (data.items ?? []).forEach((item) => {
                            const current = next[item.uid];
                            if (!current) return;
                            next[item.uid] = item.proposal
                                ? {
                                    ...current,
                                    proposal: item.proposal,
                                    name: item.proposal.files[0]?.proposed ?? "",
                                    selected: true,
                                    status: "ready",
                                    error: undefined,
                                }
                                : {
                                    ...current,
                                    proposal: null,
                                    name: "",
                                    selected: false,
                                    status: "empty",
                                    error: item.error,
                                };
                        });
                        return next;
                    });
                } catch {
                    if (!mountedRef.current) return;
                    setInvoiceRows((previous) => {
                        const next = { ...previous };
                        chunk.forEach((message) => {
                            const current = next[message.uid];
                            if (current) {
                                next[message.uid] = {
                                    ...current,
                                    status: "error",
                                    error: "Connexion interrompue pendant l'analyse.",
                                };
                            }
                        });
                        return next;
                    });
                }
            }
            if (mountedRef.current) setInvoiceBatchLoading(false);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter, factures]);

    useEffect(
        () => () => {
            mountedRef.current = false;
        },
        []
    );

    function toggleInvoiceRow(uid: number, selected: boolean) {
        setInvoiceRows((previous) => {
            const current = previous[uid];
            if (!current) return previous;
            return { ...previous, [uid]: { ...current, selected } };
        });
    }

    function renameInvoiceRow(uid: number, name: string) {
        setInvoiceRows((previous) => {
            const current = previous[uid];
            if (!current) return previous;
            return { ...previous, [uid]: { ...current, name } };
        });
    }

    function toggleAllInvoices() {
        const target = !allInvoicesSelected;
        setInvoiceRows((previous) => {
            const next = { ...previous };
            factures.forEach((message) => {
                const current = next[message.uid];
                if (current && current.status === "ready") {
                    next[message.uid] = { ...current, selected: target };
                }
            });
            return next;
        });
    }

    /** Aperçu : PDF joint au message, ou lien fournisseur via la page /facture. */
    function invoicePreviewHref(row: InvoiceRow): string | null {
        const proposal = row.proposal;
        const file = proposal?.files[0];
        if (!proposal || !file) return null;
        if (file.part) {
            return invoiceFileUrl(row.uid, proposal, {
                ...file,
                proposed: row.name.trim() || file.proposed,
            });
        }
        if (proposal.link) {
            return `/facture?url=${encodeURIComponent(proposal.link)}`;
        }
        return null;
    }

    /** Change l'étiquette d'un email : « auto » rétablit le tri automatique. */
    function changeMessageCategory(uid: number, value: "auto" | GmailCategory) {
        const overrides = { ...labelOverrides };
        if (value === "auto") {
            delete overrides[uid];
        } else {
            overrides[uid] = value;
        }
        setLabelOverrides(overrides);
        saveLabelOverrides(overrides);

        const restore = <T extends InboxMessage>(message: T): T => {
            const raw = rawLabelsRef.current[uid];
            const base = raw ? { ...message, ...raw } : message;
            return applyLabelOverride(base, overrides[uid]);
        };

        setMessages((previous) =>
            previous.map((message) => (message.uid === uid ? restore(message) : message))
        );
        setDetail((previous) => (previous && previous.uid === uid ? restore(previous) : previous));

        setFeedback(
            value === "auto"
                ? "Étiquette automatique rétablie."
                : `Étiquette modifiée : ${CATEGORY_LABEL[value]}.`
        );
    }

    /** Enregistre (ou efface) le lien d'image choisi à la main pour un livre. */
    function persistLoanCover(key: string, url: string | null) {
        const next = { ...coverOverrides };
        if (url) {
            next[key] = url;
        } else {
            delete next[key];
        }
        setCoverOverrides(next);
        saveCoverOverrides(next);
        setFeedback(url ? "Lien de l'image enregistré." : "Couverture automatique rétablie.");
    }

    /** Enregistre (ou efface) le titre / l'auteur saisis à la main pour un livre. */
    function persistLoanMeta(key: string, meta: LoanMetaOverride | null) {
        const next = { ...loanMetaOverrides };
        if (meta && (meta.title || meta.author)) {
            next[key] = meta;
        } else {
            delete next[key];
        }
        setLoanMetaOverrides(next);
        saveLoanMetaOverrides(next);
    }

    /** Prolonge un emprunt de 3 semaines (+21 jours) et mémorise la prolongation. */
    function extendLoan(extensionKey: string, currentDue: string | null) {
        const nextDue = addDaysIso(currentDue, 21);
        const nextExt = { ...loanExtensions, [extensionKey]: true };
        setLoanExtensions(nextExt);
        saveLoanExtensions(nextExt);
        if (nextDue) {
            const nextDates = { ...loanDueOverrides, [extensionKey]: nextDue };
            setLoanDueOverrides(nextDates);
            saveLoanDueOverrides(nextDates);
        }
    }

    /** Prolonge de 3 semaines tous les livres sélectionnés non encore prolongés. */
    function extendSelectedLoans(loans: BookLoan[]) {
        const nextExt = { ...loanExtensions };
        const nextDates = { ...loanDueOverrides };
        for (const loan of loans) {
            const extKey = `${loanCoverKey(loan.title, loan.author)}|${loan.dueDate ?? ""}`;
            if (!selectedLoans[extKey] || nextExt[extKey]) continue;
            const currentDue = nextDates[extKey] ?? loan.dueDate;
            const nextDue = addDaysIso(currentDue, 21);
            if (!nextDue) continue;
            nextExt[extKey] = true;
            nextDates[extKey] = nextDue;
        }
        setLoanExtensions(nextExt);
        saveLoanExtensions(nextExt);
        setLoanDueOverrides(nextDates);
        saveLoanDueOverrides(nextDates);
        setSelectedLoans({});
    }

    /** Modifie manuellement (ou réinitialise) la date de retour d'un livre. */
    function setLoanDueDate(extensionKey: string, iso: string | null) {
        const nextDates = { ...loanDueOverrides };
        if (iso) {
            nextDates[extensionKey] = iso;
        } else {
            delete nextDates[extensionKey];
            if (loanExtensions[extensionKey]) {
                const nextExt = { ...loanExtensions };
                delete nextExt[extensionKey];
                setLoanExtensions(nextExt);
                saveLoanExtensions(nextExt);
            }
        }
        setLoanDueOverrides(nextDates);
        saveLoanDueOverrides(nextDates);
    }

    /** Modifie manuellement la date de retour pour tous les livres sélectionnés. */
    function setSelectedLoansDueDate(loans: BookLoan[], iso: string) {
        if (!iso) return;
        const nextDates = { ...loanDueOverrides };
        for (const loan of loans) {
            const extKey = `${loanCoverKey(loan.title, loan.author)}|${loan.dueDate ?? ""}`;
            if (!selectedLoans[extKey]) continue;
            nextDates[extKey] = iso;
        }
        setLoanDueOverrides(nextDates);
        saveLoanDueOverrides(nextDates);
        setSelectedLoans({});
        setBulkDueDate("");
    }

    /**
     * Ouvre automatiquement l'email suivant dans la liste active :
     * - si on valide le 1er (le plus récent), on passe au suivant (index + 1)
     * - si on valide le dernier (le plus ancien), on remonte au précédent (index - 1, le nouveau plus ancien)
     * - au milieu, on reste à la même position visuelle (index + 1)
     */
    function openNextInListOrClear(excludeUid: number) {
        const idx = visibleMessages.findIndex((item) => item.uid === excludeUid);
        const nextCandidate =
            idx >= 0
                ? (visibleMessages[idx + 1] ?? visibleMessages[idx - 1] ?? null)
                : (visibleMessages[0] ?? null);
        if (nextCandidate) {
            void openMessage(nextCandidate.uid);
        } else {
            setDetail(null);
        }
    }

    /** Valide un suivi : met à jour immédiatement l'interface puis range l'email en arrière-plan. */
    function validateCommand() {
        const target = detail;
        const tracking = target?.tracking;
        if (!target || !tracking) return;
        const destination = commandFolder || defaultCommandFolder;
        if (!destination) {
            setFeedback("Choisissez d'abord le dossier de rangement.");
            return;
        }
        const label =
            folders.find((folder) => folder.path === destination)?.label ?? destination;
        const storeName = tracking.store?.trim() || target.fromName || tracking.carrier || "Colis";
        const existingMatch = findMatchingParcel({
            uid: target.uid,
            store: storeName,
            orderNumber: tracking.orderNumber ?? null,
            numbers: tracking.numbers,
            url: tracking.url,
            shippedAt: target.date,
        });
        const alreadyTracked = Boolean(existingMatch);
        const hasExistingImages = Boolean(existingMatch?.images && existingMatch.images.length > 0);
        if (
            !hasExistingImages &&
            tracking.images &&
            tracking.images.length > 0 &&
            selectedTrackingImages.length === 0
        ) {
            setFeedback("Sélectionnez d'abord au moins une image du produit.");
            return;
        }
        const removedSummary = messages.find((item) => item.uid === target.uid) ?? null;

        const effectiveStatus = manualStatus.trim() || tracking.status || null;
        const parsedDate = target.date ? new Date(target.date) : null;
        const shortDatePrefix =
            parsedDate && !Number.isNaN(parsedDate.getTime())
                ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" })
                      .format(parsedDate)
                      .replace(/\.$/, "")
                : "";
        const finalHistoryEntry = effectiveStatus
            ? shortDatePrefix
                ? `${shortDatePrefix} · ${effectiveStatus}`
                : effectiveStatus
            : manualHistoryEntry.trim();
        if (finalHistoryEntry && autoHistoryEntry) {
            learnHistoryLabel({
                store: storeName,
                subject: target.subject,
                autoEntry: autoHistoryEntry,
                userEntry: finalHistoryEntry,
            });
        }
        if (effectiveStatus && tracking.status) {
            learnLabelEdit({
                field: "status",
                autoValue: tracking.status,
                userValue: effectiveStatus,
            });
        }
        if (manualEstimatedDelivery.trim() && tracking.estimatedDelivery) {
            learnLabelEdit({
                field: "estimatedDelivery",
                autoValue: tracking.estimatedDelivery,
                userValue: manualEstimatedDelivery.trim(),
            });
        }
        if (manualDeliveryCity.trim() && tracking.deliveryCity) {
            learnLabelEdit({
                field: "deliveryCity",
                autoValue: tracking.deliveryCity,
                userValue: manualDeliveryCity.trim(),
            });
        }
        if (productTitleEdited && manualProductTitle.trim() && tracking.productTitle) {
            learnLabelEdit({
                field: "productTitle",
                autoValue: tracking.productTitle,
                userValue: manualProductTitle.trim(),
            });
        }
        const finalHistory = finalHistoryEntry
            ? [finalHistoryEntry, ...(tracking.history?.slice(1) ?? [])]
            : (tracking.history ?? []);

        addParcel(
            {
                uid: target.uid,
                store: storeName,
                orderNumber: tracking.orderNumber ?? null,
                carrier: tracking.carrier,
                numbers: tracking.numbers,
                url: tracking.url,
                status: effectiveStatus,
                estimatedDelivery: manualEstimatedDelivery.trim() || tracking.estimatedDelivery || null,
                deliveryCity: manualDeliveryCity.trim() || tracking.deliveryCity || null,
                orderedAt: target.date,
                shippedAt: target.date,
                subject: target.subject,
                folder: destination,
                folderLabel: label,
                history: finalHistory,
                images: hasExistingImages ? existingMatch!.images! : selectedTrackingImages,
                productTitle:
                    existingMatch?.productTitle?.trim() ||
                    manualProductTitle.trim() ||
                    resolveSelectedProductTitle(tracking, selectedTrackingImages) ||
                    null,
                savedAt: new Date().toISOString(),
            },
            {
                replaceImages:
                    !hasExistingImages && Boolean(tracking.images && tracking.images.length > 0),
                replaceHistoryTarget: autoHistoryEntry || undefined,
            }
        );

        setMessages((previous) => previous.filter((item) => item.uid !== target.uid));
        setTotal((previous) => Math.max(0, previous - 1));
        openNextInListOrClear(target.uid);
        setFeedback(
            alreadyTracked
                ? `Suivi mis à jour. Rangement dans « ${label} » en cours…`
                : `Suivi ajouté au tableau de bord. Rangement dans « ${label} » en cours…`
        );

        void (async () => {
            try {
                const response = await fetch("/api/gmail/move", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ uid: target.uid, destination }),
                });
                const data = (await response.json()) as { error?: string };
                if (!response.ok) {
                    if (removedSummary) {
                        setMessages((previous) =>
                            previous.some((item) => item.uid === removedSummary.uid)
                                ? previous
                                : [removedSummary, ...previous]
                        );
                        setTotal((previous) => previous + 1);
                    }
                    setFeedback(
                        data.error
                            ? `Rangement échoué (${data.error}) — le suivi reste enregistré.`
                            : `Le déplacement vers « ${label} » a échoué.`
                    );
                    return;
                }
                setFeedback(
                    alreadyTracked
                        ? `Commande rangée dans « ${label} ». Suivi mis à jour sur le tableau de bord.`
                        : `Commande rangée dans « ${label} ». Suivi ajouté au tableau de bord.`
                );
            } catch {
                if (removedSummary) {
                    setMessages((previous) =>
                        previous.some((item) => item.uid === removedSummary.uid)
                            ? previous
                            : [removedSummary, ...previous]
                    );
                    setTotal((previous) => previous + 1);
                }
                setFeedback(`Impossible de joindre le serveur pour ranger dans « ${label} ».`);
            }
        })();
    }

    async function copyTrackingNumber(value: string) {
        try {
            await navigator.clipboard.writeText(value);
            setFeedback("Numéro de suivi copié.");
        } catch {
            setFeedback("Copie impossible : sélectionnez le numéro à la main.");
        }
    }

    async function downloadSelectedInvoices() {
        const rows = invoiceRowList.filter((row) => row.selected && row.status === "ready");
        if (rows.length === 0) {
            setInvoiceBatchMessage("Sélectionnez au moins une facture à traiter.");
            return;
        }

        const useDrive = Boolean(status?.driveConfigured);
        setInvoiceBatchWorking(true);
        setInvoiceBatchMessage(null);
        let saved = 0;
        const failures: string[] = [];

        for (const row of rows) {
            const proposal = row.proposal;
            if (!proposal) continue;
            try {
                if (useDrive) {
                    await fileInvoiceToDrive(
                        row.uid,
                        proposal,
                        proposal.files.map((file, index) => ({
                            part: file.part || undefined,
                            url: !file.part ? (proposal.link ?? file.original) : undefined,
                            fileName:
                                index === 0 ? row.name.trim() || file.proposed : file.proposed,
                        }))
                    );
                } else {
                    for (let index = 0; index < proposal.files.length; index += 1) {
                        const file = proposal.files[index];
                        const wanted = index === 0 ? row.name.trim() || file.proposed : file.proposed;
                        const url = file.part
                            ? `/api/gmail/attachment?uid=${row.uid}&part=${encodeURIComponent(
                                  file.part
                              )}&type=${encodeURIComponent("application/pdf")}&name=${encodeURIComponent(
                                  wanted
                              )}`
                            : `/api/gmail/invoice/download?dl=1&url=${encodeURIComponent(
                                  proposal.link ?? file.original
                              )}&name=${encodeURIComponent(wanted)}`;

                        const response = await fetch(url, { credentials: "same-origin" });
                        if (!response.ok) {
                            let reason = "";
                            try {
                                const payload = (await response.json()) as { error?: string };
                                reason = payload.error ?? "";
                            } catch {
                                reason = "";
                            }
                            throw new Error(reason || "Téléchargement du PDF impossible.");
                        }

                        const blob = await response.blob();
                        const objectUrl = URL.createObjectURL(blob);
                        const anchor = document.createElement("a");
                        anchor.href = objectUrl;
                        anchor.download = wanted;
                        document.body.appendChild(anchor);
                        anchor.click();
                        anchor.remove();
                        setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
                    }
                }

                const deletion = await fetch("/api/gmail/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ uid: row.uid }),
                });
                if (!deletion.ok) {
                    const payload = (await deletion.json()) as { error?: string };
                    throw new Error(payload.error ?? "Suppression du mail impossible.");
                }

                saved += 1;
                setMessages((previous) => previous.filter((item) => item.uid !== row.uid));
                setTotal((previous) => Math.max(0, previous - 1));
                setInvoiceRows((previous) => {
                    const next = { ...previous };
                    delete next[row.uid];
                    return next;
                });
            } catch (error) {
                failures.push(
                    `${row.fromName} : ${
                        error instanceof Error
                            ? error.message
                            : useDrive
                              ? "rangement sur Drive impossible"
                              : "téléchargement impossible"
                    }`
                );
            }
        }

        setInvoiceBatchWorking(false);
        setInvoiceBatchMessage(
            failures.length === 0
                ? `${saved} facture${saved > 1 ? "s" : ""} ${
                      useDrive ? "rangée" : "téléchargée"
                  }${saved > 1 ? "s" : ""}${
                      useDrive ? " sur Google Drive" : ""
                  } et email${saved > 1 ? "s" : ""} supprimé${saved > 1 ? "s" : ""}.`
                : `${saved} facture(s) traitée(s). Échec(s) : ${failures.join(" · ")}`
        );
    }

    async function moveTo(destination: string) {
        if (!detail) return;
        const message = detail;
        if (!destination) {
            setFeedback("Choisissez d'abord un dossier de destination.");
            return;
        }
        setMoving(true);
        setFeedback(null);
        try {
            const response = await fetch("/api/gmail/move", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ uid: message.uid, destination }),
            });
            const data = (await response.json()) as { error?: string };
            if (!response.ok) {
                setFeedback(data.error ?? "Le déplacement a échoué.");
                return;
            }
            const label =
                folders.find((folder) => folder.path === destination)?.label ?? destination;
            setMessages((previous) => previous.filter((item) => item.uid !== message.uid));
            setTotal((previous) => Math.max(0, previous - 1));
            openNextInListOrClear(message.uid);
            setFeedback(`Message déplacé vers « ${label} ».`);
        } catch {
            setFeedback("Impossible de joindre le serveur.");
        } finally {
            setMoving(false);
        }
    }

    async function deleteAfterLink() {
        if (!detail) return;
        if (
            !window.confirm(
                "Supprimer ce mail ? Vérifiez que la facture a bien été téléchargée depuis le lien."
            )
        ) {
            return;
        }
        const target = detail;
        setInvoiceWorking(true);
        setInvoiceError(null);
        try {
            const deletion = await fetch("/api/gmail/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ uid: target.uid }),
            });
            const data = (await deletion.json()) as { error?: string };
            if (!deletion.ok) {
                setInvoiceError(data.error ?? "Suppression impossible.");
                return;
            }
            setMessages((previous) => previous.filter((item) => item.uid !== target.uid));
            setTotal((previous) => Math.max(0, previous - 1));
            openNextInListOrClear(target.uid);
            setFeedback("Email de facture supprimé.");
        } catch {
            setInvoiceError("Suppression impossible.");
        } finally {
            setInvoiceWorking(false);
        }
    }

    async function removeMessage() {
        if (!detail) return;
        if (!window.confirm("Supprimer ce message ? Il partira dans la corbeille Gmail.")) {
            return;
        }
        const target = detail;
        setMoving(true);
        setFeedback(null);
        try {
            const response = await fetch("/api/gmail/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ uid: target.uid }),
            });
            const data = (await response.json()) as { error?: string };
            if (!response.ok) {
                setFeedback(data.error ?? "La suppression a échoué.");
                return;
            }
            setMessages((previous) => previous.filter((item) => item.uid !== target.uid));
            setTotal((previous) => Math.max(0, previous - 1));
            openNextInListOrClear(target.uid);
            setFeedback("Message déplacé dans la corbeille Gmail.");
        } catch {
            setFeedback("Impossible de joindre le serveur.");
        } finally {
            setMoving(false);
        }
    }

    const submitReply = async (mode: "draft" | "send") => {
        if (!detail) return;
        if (!reply.trim()) {
            setFeedback("Écrivez d'abord votre réponse.");
            return;
        }
        if (
            mode === "send" &&
            !window.confirm(`Envoyer ce message à ${detail.fromEmail} ? Cette action est définitive.`)
        ) {
            return;
        }

        setSending(mode);
        try {
            const response = await fetch("/api/gmail/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                    uid: detail.uid,
                    to: detail.fromEmail,
                    subject: draftSubject || replySubject(detail.subject),
                    text: reply,
                    inReplyTo: detail.messageId || undefined,
                    mode,
                }),
            });
            const data = (await response.json()) as { error?: string; markedAnswered?: boolean };
            if (!response.ok) {
                setFeedback(data.error ?? "L'envoi a échoué.");
                return;
            }
            let movedLabel: string | null = null;
            if (mode === "send" && folderTarget) {
                const moveResponse = await fetch("/api/gmail/move", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ uid: detail.uid, destination: folderTarget }),
                });
                if (moveResponse.ok) {
                    movedLabel =
                        folders.find((folder) => folder.path === folderTarget)?.label ??
                        folderTarget;
                    setMessages((previous) => previous.filter((item) => item.uid !== detail.uid));
                    setTotal((previous) => Math.max(0, previous - 1));
                    openNextInListOrClear(detail.uid);
                }
            }

            if (mode === "send" && movedLabel === null) {
                setDetail((previous) =>
                    previous
                        ? { ...previous, answered: true, needsReply: false, reason: "Déjà répondu" }
                        : previous
                );
            }

            const targetLabel =
                folders.find((folder) => folder.path === folderTarget)?.label ?? folderTarget;

            const sentMessage = `Message envoyé à ${detail.fromEmail}.${
                data.markedAnswered ? " Marqué comme répondu dans Gmail." : ""
            }${movedLabel ? ` Rangé dans « ${movedLabel} ».` : ""}`;

            const draftMessage = `Brouillon enregistré dans Gmail (dossier Brouillons). Il reste à relire dans Gmail puis à envoyer.${
                folderTarget
                    ? ` Le message sera rangé dans « ${targetLabel} » après envoi.`
                    : ""
            }`;

            setFeedback(mode === "draft" ? draftMessage : sentMessage);
            setStyleSamples(
                recordReplySample({ text: reply, intent: draftIntent, register: draftRegister })
            );
            setReply("");
            setDraftSubject(null);
            setDraftIntent(null);
            setDraftRegister(null);
            void load(limit);
        } catch {
            setFeedback("Impossible de joindre le serveur.");
        } finally {
            setSending(null);
        }
    };

    if (loading && messages.length === 0 && !status) {
        return (
            <div className="p-10 rounded-[2.2rem] bg-white border border-slate-200/70 shadow-sm flex items-center gap-3 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                <span>Connexion à votre boîte Gmail…</span>
            </div>
        );
    }

    if (status && !status.configured) {
        return (
            <div className="p-7 rounded-[2.2rem] bg-white border border-slate-200/70 shadow-sm space-y-5">
                <div className="flex items-center gap-2.5">
                    <span className="h-9 w-9 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
                        <KeyRound className="h-4 w-4 text-amber-600" />
                    </span>
                    <div>
                        <h4 className="text-sm font-extrabold text-slate-900">Gmail n'est pas encore relié</h4>
                        <p className="text-xs text-slate-500">
                            Deux variables d'environnement suffisent, aucune validation Google n'est nécessaire.
                        </p>
                    </div>
                </div>

                <ol className="text-xs text-slate-600 space-y-2 list-decimal pl-5">
                    <li>
                        Sur <span className="font-semibold">myaccount.google.com → Sécurité</span>, activez la
                        validation en deux étapes.
                    </li>
                    <li>
                        Toujours dans Sécurité, ouvrez{" "}
                        <span className="font-semibold">Mots de passe des applications</span> et générez-en un
                        pour « Assistant perso » (16 caractères).
                    </li>
                    <li>
                        Sur Vercel : <span className="font-semibold">Settings → Environment Variables</span>, ajoutez
                        <code className="mx-1 px-1.5 py-0.5 rounded bg-slate-100 font-mono">GMAIL_USER</code>
                        (votre adresse Gmail) et
                        <code className="mx-1 px-1.5 py-0.5 rounded bg-slate-100 font-mono">GMAIL_APP_PASSWORD</code>
                        (les 16 caractères), pour <span className="font-semibold">Production</span>.
                    </li>
                    <li>
                        <span className="font-semibold">Deployments → … → Redeploy</span> (cache de build décoché),
                        puis rechargez cette page.
                    </li>
                </ol>

                <button
                    onClick={() => void load(limit)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Revérifier la configuration</span>
                </button>
            </div>
        );
    }

    const invoiceActive = Boolean(invoiceLoading || invoiceProposal);

    return (
        <div className="space-y-4">
            {/* Barre d'état */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white border border-slate-200/70 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button
                        type="button"
                        onClick={() => void load(limit)}
                        title="Rafraîchir"
                        aria-label="Rafraîchir"
                        className="h-8 w-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all shrink-0"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    </button>
                    <Mail className="h-4 w-4 text-teal-600" />
                    <span className="font-bold text-slate-800">{status?.email}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-500">
                        {messages.length} sur {total} message{total > 1 ? "s" : ""} analysés
                    </span>
                </div>
                {messages.length < Math.min(total, MAX_MESSAGES) && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => void load(Math.min(total, MAX_MESSAGES))}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold hover:bg-teal-100 transition-all"
                        >
                            {loading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            <span>
                                Tout charger ({Math.min(total, MAX_MESSAGES) - messages.length})
                            </span>
                        </button>
                    </div>
                )}
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-[11px] text-rose-700">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {feedback && (
                <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{feedback}</span>
                </div>
            )}

            {/* Filtres */}
            <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-slate-100/80 border border-slate-200/60 w-fit">
                {(
                    [
                        ["reply", "À répondre", toReply.length],
                        ["read", "À lire", toRead.length],
                        ["factures", "Factures", factures.length],
                        ["commande", "Commandes", commandes.length],
                        ["alertes", "Alertes", alertes.length],
                        ["kiosque", "Kiosque", kiosque.length],
                        ["bibliotheque", "Bibliothèque", bibliotheques.length],
                        ["later", "Newsletter/pub", later.length],
                        ["all", "Tous", messages.length],
                    ] as [Filter, string, number][]
                ).map(([value, label, count]) => (
                    <button
                        key={value}
                        onClick={() => changeFilter(value)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[11px] transition-all ${filter === value
                                ? "bg-white text-slate-900 shadow-sm font-bold"
                                : count > 0
                                    ? "font-bold text-slate-600 hover:text-slate-900"
                                    : "font-normal text-slate-400 hover:text-slate-600"
                            }`}
                    >
                        <span>{label}</span>
                        {count > 0 && (
                            <span
                                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none tabular-nums ${filter === value
                                        ? "bg-slate-900 text-white"
                                        : "bg-slate-200/80 text-slate-700"
                                    }`}
                            >
                                {count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {filter === "factures" ? (
                <div className="space-y-3">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-2xl bg-white border border-slate-200/70 shadow-sm">
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={allInvoicesSelected}
                                    onChange={toggleAllInvoices}
                                    disabled={selectableInvoiceRows.length === 0}
                                    className="h-4 w-4 rounded border-slate-300 accent-teal-600"
                                />
                                <span>Tout sélectionner</span>
                            </label>
                            <span className="text-[11px] text-slate-500">
                                {selectedInvoiceRows.length} sélectionnée(s) ·{" "}
                                {selectableInvoiceRows.length} facture(s) prête(s)
                                {invoiceBatchLoading && " · analyse en cours…"}
                            </span>
                        </div>
                        <button
                            onClick={() => void downloadSelectedInvoices()}
                            disabled={invoiceBatchWorking || selectedInvoiceRows.length === 0}
                            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            {invoiceBatchWorking ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : status?.driveConfigured ? (
                                <FolderUp className="h-3.5 w-3.5" />
                            ) : (
                                <Download className="h-3.5 w-3.5" />
                            )}
                            <span>
                                {invoiceBatchWorking
                                    ? status?.driveConfigured
                                        ? "Rangement sur Drive…"
                                        : "Téléchargement…"
                                    : status?.driveConfigured
                                      ? `Valider les noms et ranger sur Drive (${selectedInvoiceRows.length})`
                                      : `Valider les noms et télécharger (${selectedInvoiceRows.length})`}
                            </span>
                        </button>
                    </div>

                    {invoiceBatchMessage && (
                        <div className="flex items-start gap-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700">
                            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-teal-600" />
                            <span>{invoiceBatchMessage}</span>
                        </div>
                    )}

                    {invoiceRowList.length === 0 && !invoiceBatchLoading && (
                        <p className="text-xs text-slate-500 p-4">
                            Aucune facture parmi les emails chargés.
                        </p>
                    )}

                    {invoiceRowList.map((row) => {
                        const href = invoicePreviewHref(row);
                        return (
                            <div
                                key={row.uid}
                                className={`p-3.5 rounded-2xl bg-white border flex flex-col md:flex-row md:items-center gap-3 transition-all ${
                                    row.selected
                                        ? "border-teal-500 shadow-sm ring-2 ring-teal-50"
                                        : "border-slate-200/70"
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={row.selected}
                                    onChange={(event) =>
                                        toggleInvoiceRow(row.uid, event.target.checked)
                                    }
                                    disabled={row.status !== "ready"}
                                    aria-label={`Sélectionner la facture de ${row.fromName}`}
                                    className="h-4 w-4 rounded border-slate-300 accent-teal-600 shrink-0"
                                />

                                {row.proposal ? (
                                    <ProviderLogo
                                        provider={row.proposal.provider}
                                        className="h-9 w-9"
                                    />
                                ) : (
                                    <span className="h-9 w-9 rounded-lg bg-slate-100 border border-slate-200 shrink-0" />
                                )}

                                <div className="min-w-0 md:w-60 md:shrink-0">
                                    <p className="text-xs font-bold text-slate-800 truncate">
                                        {row.proposal?.providerLabel ?? row.fromName}
                                    </p>
                                    <p className="text-[10px] text-slate-500 truncate">
                                        {row.subject}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                        {formatDate(row.date)} · {formatRelative(row.date)}
                                    </p>
                                </div>

                                <div className="flex-1 min-w-0">
                                    {row.status === "pending" && (
                                        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                                            <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-600" />
                                            Analyse de la facture…
                                        </p>
                                    )}
                                    {row.status === "ready" && row.proposal && (
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                            <input
                                                value={row.name}
                                                onChange={(event) =>
                                                    renameInvoiceRow(row.uid, event.target.value)
                                                }
                                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/60 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-100 focus:border-teal-400"
                                            />
                                            <span
                                                className={`inline-flex items-center leading-none text-[11px] shrink-0 tabular-nums ${
                                                    row.proposal.amount
                                                        ? "font-bold text-slate-700"
                                                        : "text-slate-400"
                                                }`}
                                                title="Montant de la facture"
                                            >
                                                {row.proposal.amount ?? "Montant non détecté"}
                                            </span>
                                        </div>
                                    )}
                                    {row.status === "empty" && (
                                        <p className="text-[11px] text-slate-500">
                                            Aucune facture reconnue dans cet email
                                            {row.error ? ` · ${row.error}` : ""}
                                        </p>
                                    )}
                                    {row.status === "error" && (
                                        <p className="text-[11px] text-rose-700">{row.error}</p>
                                    )}
                                </div>

                                <LabelMenu
                                    value={labelOverrides[row.uid] ?? "factures"}
                                    override={labelOverrides[row.uid]}
                                    onSelect={(value) => changeMessageCategory(row.uid, value)}
                                />

                                {href && (
                                    <a
                                        href={href}
                                        target="_blank"
                                        rel="noreferrer"
                                        title="Aperçu du PDF"
                                        aria-label="Aperçu du PDF"
                                        className="flex items-center justify-center h-9 w-9 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all shrink-0"
                                    >
                                        <Eye className="h-4 w-4" />
                                    </a>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Liste */}
                <div className={`space-y-2 ${invoiceActive || filter === "kiosque" || filter === "bibliotheque" ? "lg:col-span-3" : "lg:col-span-5"}`}>
                    {visibleMessages.length === 0 && !error && (
                        <p className="text-xs text-slate-500 p-4">
                            {filter === "reply"
                                ? "Aucun message ne nécessite de réponse parmi les emails chargés."
                                : "Aucun message dans cette catégorie."}
                        </p>
                    )}
                    {filter === "commande" ? (
                        <>
                        {commandeGroups.map((group) => {
                              const isCollapsed = Boolean(collapsedOrderGroups[group.key]);
                              const isDropTarget = dragOverGroupKey === group.key;
                              return (
                              <div
                                  key={group.key}
                                  onDragOver={(e) => {
                                      if (draggingOrderUid === null) return;
                                      e.preventDefault();
                                      e.dataTransfer.dropEffect = "move";
                                      if (dragOverGroupKey !== group.key) {
                                          setDragOverGroupKey(group.key);
                                      }
                                  }}
                                  onDragLeave={(e) => {
                                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                          setDragOverGroupKey((prev) =>
                                              prev === group.key ? null : prev
                                          );
                                      }
                                  }}
                                  onDrop={(e) => {
                                      e.preventDefault();
                                      const raw = e.dataTransfer.getData("text/plain");
                                      const uid = Number(raw) || draggingOrderUid;
                                      setDraggingOrderUid(null);
                                      setDragOverGroupKey(null);
                                      if (!uid) return;
                                      const draggedMsg = visibleMessages.find((m) => m.uid === uid);
                                      if (!draggedMsg) return;
                                      if (group.items.some((m) => m.uid === uid)) return;
                                      moveMessageToOrderGroup(draggedMsg, group.key);
                                  }}
                                  className={`rounded-2xl border p-2 space-y-1.5 transition-all ${
                                      isDropTarget
                                          ? "bg-violet-100/80 border-violet-500 ring-2 ring-violet-300"
                                          : "bg-violet-50/40 border-violet-200/70"
                                  }`}
                              >
                                  <button
                                      type="button"
                                      onClick={() =>
                                          setCollapsedOrderGroups((prev) => ({
                                              ...prev,
                                              [group.key]: !prev[group.key],
                                          }))
                                      }
                                      aria-expanded={!isCollapsed}
                                      className="w-full text-left flex items-start justify-between gap-2 px-1.5 py-0.5 rounded-xl hover:bg-violet-100/50 transition-colors"
                                  >
                                      <div className="flex items-start gap-1.5 min-w-0">
                                          <Package className="h-3.5 w-3.5 text-violet-600 shrink-0 mt-0.5" />
                                          <div className="min-w-0">
                                              <p className="text-[11px] font-extrabold text-slate-800 truncate">
                                                  {group.storeName}
                                              </p>
                                              {group.productTitle && (
                                                  <p className="text-[10px] font-medium text-slate-600 truncate">
                                                      {group.productTitle}
                                                  </p>
                                              )}
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                                          <span className="text-[10px] font-bold text-violet-700">
                                              {group.items.length} mail{group.items.length > 1 ? "s" : ""}
                                          </span>
                                          <ChevronDown
                                              className={`h-3.5 w-3.5 text-violet-600 transition-transform ${
                                                  isCollapsed ? "-rotate-90" : ""
                                              }`}
                                          />
                                      </div>
                                  </button>
                                  {!isCollapsed && (
                                  <div className="space-y-1.5">
                                      {group.items.map((message) => (
                                          <div
                                              key={message.uid}
                                              draggable
                                              onDragStart={(e) => {
                                                  e.dataTransfer.setData(
                                                      "text/plain",
                                                      String(message.uid)
                                                  );
                                                  e.dataTransfer.effectAllowed = "move";
                                                  setDraggingOrderUid(message.uid);
                                              }}
                                              onDragEnd={() => {
                                                  setDraggingOrderUid(null);
                                                  setDragOverGroupKey(null);
                                              }}
                                              role="button"
                                              tabIndex={0}
                                              onClick={() => void openMessage(message.uid)}
                                              onKeyDown={(event) => {
                                                  if (
                                                      event.key === "Enter" ||
                                                      event.key === " "
                                                  ) {
                                                      event.preventDefault();
                                                      void openMessage(message.uid);
                                                  }
                                              }}
                                              className={`w-full text-left p-3 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
                                                  draggingOrderUid === message.uid
                                                      ? "opacity-45 border-violet-300 bg-violet-50"
                                                      : detail?.uid === message.uid
                                                        ? "bg-white border-teal-500 shadow-sm ring-2 ring-teal-50"
                                                        : "bg-white/90 border-slate-200/70 hover:bg-white hover:border-slate-300"
                                              }`}
                                          >
                                              <div className="flex items-center justify-between gap-2 mb-0.5">
                                                  <span className="flex items-center gap-1 text-[11px] font-bold text-slate-800 truncate">
                                                      <GripVertical className="h-3 w-3 text-slate-300 shrink-0" />
                                                      {!message.seen && (
                                                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-500 mr-0.5 align-middle" />
                                                      )}
                                                      <span className="truncate">{message.fromName}</span>
                                                  </span>
                                                  <span className="text-[10px] text-slate-400 shrink-0">
                                                      {formatDate(message.date)}
                                                  </span>
                                              </div>
                                              <p className="text-[11px] font-medium text-slate-600 truncate pl-4">
                                                  {message.subject}
                                              </p>
                                          </div>
                                      ))}
                                  </div>
                                  )}
                              </div>
                              );
                          })}
                        {draggingOrderUid !== null && (
                            <div
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                    if (dragOverGroupKey !== "__new__") {
                                        setDragOverGroupKey("__new__");
                                    }
                                }}
                                onDragLeave={() =>
                                    setDragOverGroupKey((prev) => (prev === "__new__" ? null : prev))
                                }
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const raw = e.dataTransfer.getData("text/plain");
                                    const uid = Number(raw) || draggingOrderUid;
                                    setDraggingOrderUid(null);
                                    setDragOverGroupKey(null);
                                    if (!uid) return;
                                    const draggedMsg = visibleMessages.find((m) => m.uid === uid);
                                    if (draggedMsg) {
                                        moveMessageToOrderGroup(draggedMsg, `uid:${uid}`);
                                    }
                                }}
                                className={`rounded-2xl border-2 border-dashed p-3 text-center text-[11px] font-bold transition-all ${
                                    dragOverGroupKey === "__new__"
                                        ? "border-violet-500 bg-violet-100/80 text-violet-800"
                                        : "border-violet-300 bg-violet-50/40 text-violet-600"
                                }`}
                            >
                                + Déposer ici pour séparer dans un nouveau groupe
                            </div>
                        )}
                        </>
                    ) : visibleMessages.map((message) => (
                        <div
                            key={message.uid}
                            role="button"
                            tabIndex={0}
                            onClick={() => void openMessage(message.uid)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    void openMessage(message.uid);
                                }
                            }}
                            className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${detail?.uid === message.uid
                                    ? "bg-white border-teal-500 shadow-md ring-2 ring-teal-50"
                                    : "bg-white/80 border-slate-200/70 hover:bg-white hover:border-slate-300"
                                }`}
                        >
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-xs font-bold text-slate-800 truncate">
                                    {!message.seen && (
                                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-500 mr-1.5 align-middle" />
                                    )}
                                    {message.fromName}
                                </span>
                                <span className="text-[10px] text-slate-400 shrink-0 text-right">
                                            {formatDate(message.date)}
                                            <span className="block text-[9px] text-slate-400/80">
                                                {formatRelative(message.date)}
                                            </span>
                                        </span>
                            </div>
                            <p className="text-[11px] font-medium text-slate-600 truncate">{message.subject}</p>
                            <div className="mt-1.5 flex items-center gap-1.5">
                                <LabelMenu
                                    align="left"
                                    value={message.category}
                                    override={labelOverrides[message.uid]}
                                    onSelect={(value) => changeMessageCategory(message.uid, value)}
                                />
                                {message.answered && (
                                    <span className="text-[9px] px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold">
                                        Répondu
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Lecture + réponse */}
                <div className={invoiceActive ? "lg:col-span-5" : filter === "kiosque" || filter === "bibliotheque" ? "lg:col-span-9" : "lg:col-span-7"}>
                    {loadingDetail && (
                        <div className="h-full min-h-[220px] rounded-2xl bg-white border border-slate-200/70 flex items-center justify-center text-xs text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin text-teal-600 mr-2" />
                            Chargement du message…
                        </div>
                    )}

                    {!loadingDetail && !detail && (
                        <div className="h-full min-h-[220px] rounded-2xl bg-white border border-dashed border-slate-300/80 flex flex-col items-center justify-center gap-2 text-xs text-slate-400 p-6 text-center">
                            <Mail className="h-6 w-6 text-slate-300" />
                            <span>Sélectionnez un message pour le lire.</span>
                        </div>
                    )}

                    {!loadingDetail && detail && (
                        <div className="rounded-2xl bg-white border border-slate-200/70 shadow-sm">
                            <div className="p-4 border-b border-slate-100">
                                <div className="flex items-start justify-between gap-3 mb-1">
                                    <p className="text-sm font-extrabold text-slate-900">{detail.subject}</p>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <LabelMenu
                                            value={detail.category}
                                            override={labelOverrides[detail.uid]}
                                            onSelect={(value) => changeMessageCategory(detail.uid, value)}
                                        />
                                        {["personnel", "alertes", "kiosque", "bibliotheque", "newsletter", "promotion", "important", "infos"].includes(detail.category) && (
                                            <button
                                                type="button"
                                                onClick={() => void removeMessage()}
                                                disabled={moving}
                                                title="Supprimer (corbeille)"
                                                aria-label="Supprimer"
                                                className="p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-all"
                                            >
                                                {moving ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                )}
                                            </button>
                                        )}
                                        {detail.answered && (
                                            <span className="text-[9px] px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold shrink-0">
                                                Répondu
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <p className="text-[11px] text-slate-500">
                                    De <span className="font-semibold text-slate-700">{detail.fromName}</span>
                                    {detail.fromEmail && ` <${detail.fromEmail}>`}
                                    {" · "}
                                    {formatDate(detail.date)} · {formatRelative(detail.date)}
                                </p>

                                {detail.category !== "kiosque" && detail.tracking && (() => {
                                    const matchingExisting = findMatchingParcel({
                                        uid: detail.uid,
                                        store:
                                            detail.tracking.store?.trim() ||
                                            detail.fromName ||
                                            detail.tracking.carrier ||
                                            "Colis",
                                        orderNumber: detail.tracking.orderNumber ?? null,
                                        numbers: detail.tracking.numbers,
                                        url: detail.tracking.url,
                                        shippedAt: detail.date,
                                    });
                                    const hasExistingTitle = Boolean(
                                        matchingExisting?.productTitle?.trim()
                                    );
                                    const hasExistingImages = Boolean(
                                        matchingExisting?.images &&
                                            matchingExisting.images.length > 0
                                    );
                                    const requiresImagePick =
                                        !hasExistingImages &&
                                        Boolean(
                                            detail.tracking.images &&
                                                detail.tracking.images.length > 0
                                        ) &&
                                        selectedTrackingImages.length === 0;
                                    return (
                                    <div className="mt-3 rounded-2xl bg-violet-50/70 border border-violet-200/70 p-3 space-y-2.5">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">
                                                <Package className="h-3.5 w-3.5" />
                                                Suivi de colis
                                                {detail.tracking.orderNumber && (
                                                    <span className="font-mono text-[10px] text-violet-900 bg-white/80 px-1.5 py-0.5 rounded-md border border-violet-200/70">
                                                        #{detail.tracking.orderNumber}
                                                    </span>
                                                )}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                {matchingExisting && (
                                                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        Déjà suivi · mise à jour
                                                    </span>
                                                )}
                                                {detail.tracking.carrier && (
                                                    <span className="text-[10px] font-bold text-violet-800">
                                                        {detail.tracking.carrier}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {(hasExistingTitle || hasExistingImages) && (
                                            <div className="flex items-center gap-2.5 rounded-xl bg-white/80 border border-violet-200/60 px-2.5 py-1.5">
                                                {hasExistingImages && (
                                                    <img
                                                        src={matchingExisting!.images![0]}
                                                        alt={matchingExisting?.productTitle || "Produit"}
                                                        onError={(e) => {
                                                            e.currentTarget.style.display = "none";
                                                        }}
                                                        className="h-9 w-9 rounded-lg object-cover border border-violet-200/70 shrink-0"
                                                    />
                                                )}
                                                <div className="min-w-0">
                                                    {hasExistingTitle && (
                                                        <p className="text-[11px] font-semibold text-slate-800 truncate">
                                                            {matchingExisting!.productTitle}
                                                        </p>
                                                    )}
                                                    <p className="text-[9px] text-slate-500">
                                                        Visuel et intitulé déjà enregistrés (modifiables dans le dashboard)
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {(!hasExistingTitle || (!hasExistingImages && detail.tracking.images && detail.tracking.images.length > 0)) && (
                                            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                                                {!hasExistingTitle && (
                                                    <div className="flex-1 min-w-0">
                                                        <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                                                            Intitulé du produit
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={manualProductTitle}
                                                            onChange={(e) => {
                                                                setManualProductTitle(e.target.value);
                                                                setProductTitleEdited(true);
                                                            }}
                                                            onBlur={() => {
                                                                if (matchingExisting) {
                                                                    syncExistingParcel({
                                                                        uid: detail.uid,
                                                                        store:
                                                                            detail.tracking?.store?.trim() ||
                                                                            detail.fromName ||
                                                                            detail.tracking?.carrier ||
                                                                            "Colis",
                                                                        orderNumber:
                                                                            detail.tracking?.orderNumber ?? null,
                                                                        numbers: detail.tracking?.numbers ?? [],
                                                                        url: detail.tracking?.url ?? null,
                                                                        shippedAt: detail.date,
                                                                        productTitle:
                                                                            manualProductTitle.trim() || null,
                                                                    });
                                                                }
                                                            }}
                                                            placeholder="Ex : Sac à dos Tromso, chaussures…"
                                                            className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-violet-200/80 text-[11px] font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                                        />
                                                    </div>
                                                )}

                                                {!hasExistingImages && detail.tracking.images && detail.tracking.images.length > 0 && (() => {
                                                    const applyImageSelection = (nextImages: string[]) => {
                                                        setSelectedTrackingImages(nextImages);
                                                        const autoTitle = detail.tracking
                                                            ? resolveSelectedProductTitle(
                                                                  detail.tracking,
                                                                  nextImages
                                                              )
                                                            : null;
                                                        const effectiveTitle = productTitleEdited
                                                            ? manualProductTitle.trim() || null
                                                            : autoTitle || detail.tracking?.productTitle || null;
                                                        if (!productTitleEdited) {
                                                            setManualProductTitle(effectiveTitle ?? "");
                                                        }
                                                        if (matchingExisting) {
                                                            syncExistingParcel({
                                                                uid: detail.uid,
                                                                store:
                                                                    detail.tracking?.store?.trim() ||
                                                                    detail.fromName ||
                                                                    detail.tracking?.carrier ||
                                                                    "Colis",
                                                                orderNumber: detail.tracking?.orderNumber ?? null,
                                                                numbers: detail.tracking?.numbers ?? [],
                                                                url: detail.tracking?.url ?? null,
                                                                shippedAt: detail.date,
                                                                images: nextImages,
                                                                productTitle: effectiveTitle,
                                                                replaceImages: true,
                                                            });
                                                        }
                                                    };
                                                    const toggleImage = (imgUrl: string) => {
                                                        const exists = selectedTrackingImages.includes(imgUrl);
                                                        const next = exists
                                                            ? selectedTrackingImages.filter((u) => u !== imgUrl)
                                                            : [...selectedTrackingImages, imgUrl];
                                                        applyImageSelection(next);
                                                    };
                                                    return (
                                                        <div className="shrink-0 sm:max-w-[55%]">
                                                            <div className="flex items-start gap-2 overflow-x-auto pb-0.5">
                                                                {detail.tracking.images.map((imgUrl, idx) => {
                                                                    const selected =
                                                                        selectedTrackingImages.includes(imgUrl);
                                                                    const imgLabel =
                                                                        detail.tracking?.imageLabels?.[imgUrl];
                                                                    return (
                                                                        <button
                                                                            key={`${detail.uid}-img-${idx}`}
                                                                            type="button"
                                                                            onClick={() => toggleImage(imgUrl)}
                                                                            aria-pressed={selected}
                                                                            title={
                                                                                imgLabel
                                                                                    ? `${imgLabel} — ${
                                                                                          selected
                                                                                              ? "cliquer pour retirer"
                                                                                              : "cliquer pour sélectionner"
                                                                                      }`
                                                                                    : selected
                                                                                      ? "Cliquer pour retirer cette image"
                                                                                      : "Cliquer pour sélectionner cette image"
                                                                            }
                                                                            className="flex flex-col items-center gap-1 w-14 shrink-0 text-left group"
                                                                        >
                                                                            <div
                                                                                className={`relative h-12 w-12 rounded-xl overflow-hidden border-2 bg-white transition-all ${
                                                                                    selected
                                                                                        ? "border-violet-600 ring-2 ring-violet-200 opacity-100"
                                                                                        : "border-slate-200 opacity-45 grayscale group-hover:opacity-75"
                                                                                }`}
                                                                            >
                                                                                <img
                                                                                    src={imgUrl}
                                                                                    alt={imgLabel || "Produit commandé"}
                                                                                    onError={(e) => {
                                                                                        e.currentTarget.style.display =
                                                                                            "none";
                                                                                    }}
                                                                                    className="h-full w-full object-cover"
                                                                                />
                                                                                {selected && (
                                                                                    <span className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-violet-600 text-white flex items-center justify-center shadow">
                                                                                        <CheckCircle2 className="h-3 w-3" />
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}

                                        <div className="flex flex-wrap items-start gap-x-[35px] gap-y-2 text-[11px]">
                                            <div className="min-w-0">
                                                <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">
                                                    Numéro de suivi
                                                </p>
                                                <div className="flex items-center gap-1">
                                                    <p className="font-mono text-slate-800 break-all select-all">
                                                        {detail.tracking.numbers.length > 0
                                                            ? detail.tracking.numbers.join(" · ")
                                                            : "Non détecté"}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingTracking((v) => !v)}
                                                        title={
                                                            editingTracking
                                                                ? "Fermer l'édition"
                                                                : "Modifier le numéro de suivi"
                                                        }
                                                        aria-label="Modifier le numéro de suivi"
                                                        className="p-1 rounded-lg text-violet-600 hover:bg-violet-100 transition-colors shrink-0"
                                                    >
                                                        <PenLine className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">
                                                    Statut
                                                </p>
                                                <div className="flex items-center gap-1">
                                                    <p className="font-semibold text-slate-800 truncate">
                                                        {manualStatus || detail.tracking.status || "Non précisé"}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingStatus((v) => !v)}
                                                        title={
                                                            editingStatus
                                                                ? "Fermer l'édition du statut"
                                                                : "Modifier le statut"
                                                        }
                                                        aria-label="Modifier le statut"
                                                        className="p-1 rounded-lg text-violet-600 hover:bg-violet-100 transition-colors shrink-0"
                                                    >
                                                        <PenLine className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">
                                                    Livraison prévue
                                                </p>
                                                <div className="flex items-center gap-1">
                                                    <p className="font-semibold text-slate-800 truncate">
                                                        {manualEstimatedDelivery ||
                                                            detail.tracking.estimatedDelivery ||
                                                            matchingExisting?.estimatedDelivery ||
                                                            "Non précisée"}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setEditingEstimatedDelivery((v) => !v)
                                                        }
                                                        title={
                                                            editingEstimatedDelivery
                                                                ? "Fermer l'édition de la livraison prévue"
                                                                : "Modifier la livraison prévue"
                                                        }
                                                        aria-label="Modifier la livraison prévue"
                                                        className="p-1 rounded-lg text-violet-600 hover:bg-violet-100 transition-colors shrink-0"
                                                    >
                                                        <PenLine className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">
                                                    Adresse
                                                </p>
                                                <div className="flex items-center gap-1">
                                                    <p className="font-semibold text-slate-800 truncate">
                                                        {manualDeliveryCity ||
                                                            detail.tracking.deliveryCity ||
                                                            matchingExisting?.deliveryCity ||
                                                            "Non détectée"}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setEditingDeliveryCity((v) => !v)
                                                        }
                                                        title={
                                                            editingDeliveryCity
                                                                ? "Fermer l'édition de l'adresse"
                                                                : "Modifier l'adresse"
                                                        }
                                                        aria-label="Modifier l'adresse"
                                                        className="p-1 rounded-lg text-violet-600 hover:bg-violet-100 transition-colors shrink-0"
                                                    >
                                                        <PenLine className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {trackingResolveNote && (
                                            <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                                {trackingResolveNote}
                                            </p>
                                        )}

                                        {editingStatus && (
                                            <div className="p-2.5 rounded-xl bg-white border border-violet-200 flex items-center gap-2 text-[11px]">
                                                <input
                                                    type="text"
                                                    value={manualStatus}
                                                    onChange={(e) => setManualStatus(e.target.value)}
                                                    placeholder="Ex : Commande confirmée, Colis en route…"
                                                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-semibold"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const cleaned = manualStatus.trim();
                                                        const storeName =
                                                            detail.tracking?.store?.trim() ||
                                                            detail.fromName ||
                                                            detail.tracking?.carrier ||
                                                            "Colis";
                                                        const parsedDate = detail.date
                                                            ? new Date(detail.date)
                                                            : null;
                                                        const shortDate =
                                                            parsedDate &&
                                                            !Number.isNaN(parsedDate.getTime())
                                                                ? new Intl.DateTimeFormat("fr-FR", {
                                                                      day: "numeric",
                                                                      month: "short",
                                                                  })
                                                                      .format(parsedDate)
                                                                      .replace(/\.$/, "")
                                                                : "";
                                                        const formattedHistory = cleaned
                                                            ? shortDate
                                                                ? `${shortDate} · ${cleaned}`
                                                                : cleaned
                                                            : "";
                                                        if (formattedHistory && autoHistoryEntry) {
                                                            learnHistoryLabel({
                                                                store: storeName,
                                                                subject: detail.subject,
                                                                autoEntry: autoHistoryEntry,
                                                                userEntry: formattedHistory,
                                                            });
                                                        }
                                                        if (cleaned) {
                                                            learnLabelEdit({
                                                                field: "status",
                                                                autoValue: detail.tracking?.status,
                                                                userValue: cleaned,
                                                            });
                                                        }
                                                        if (matchingExisting && cleaned) {
                                                            syncExistingParcel({
                                                                uid: detail.uid,
                                                                store: storeName,
                                                                orderNumber:
                                                                    detail.tracking?.orderNumber ??
                                                                    null,
                                                                numbers:
                                                                    detail.tracking?.numbers ?? [],
                                                                url: detail.tracking?.url ?? null,
                                                                shippedAt: detail.date,
                                                                status: cleaned,
                                                                history: formattedHistory
                                                                    ? [formattedHistory]
                                                                    : undefined,
                                                            });
                                                        }
                                                        setEditingStatus(false);
                                                    }}
                                                    className="px-3 py-1.5 rounded-lg bg-violet-600 text-white font-bold hover:bg-violet-700 shrink-0"
                                                >
                                                    Appliquer
                                                </button>
                                            </div>
                                        )}

                                        {editingEstimatedDelivery && (
                                            <div className="p-2.5 rounded-xl bg-white border border-violet-200 flex items-center gap-2 text-[11px]">
                                                <input
                                                    type="text"
                                                    value={manualEstimatedDelivery}
                                                    onChange={(e) =>
                                                        setManualEstimatedDelivery(e.target.value)
                                                    }
                                                    placeholder="Ex : 25 nov, Vendredi 28 nov…"
                                                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-semibold"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const cleaned =
                                                            manualEstimatedDelivery.trim();
                                                        setManualEstimatedDelivery(cleaned);
                                                        if (cleaned) {
                                                            learnLabelEdit({
                                                                field: "estimatedDelivery",
                                                                autoValue:
                                                                    detail.tracking
                                                                        ?.estimatedDelivery,
                                                                userValue: cleaned,
                                                            });
                                                        }
                                                        if (matchingExisting && cleaned) {
                                                            const storeName =
                                                                detail.tracking?.store?.trim() ||
                                                                detail.fromName ||
                                                                detail.tracking?.carrier ||
                                                                "Colis";
                                                            syncExistingParcel({
                                                                uid: detail.uid,
                                                                store: storeName,
                                                                orderNumber:
                                                                    detail.tracking?.orderNumber ??
                                                                    null,
                                                                numbers:
                                                                    detail.tracking?.numbers ?? [],
                                                                url: detail.tracking?.url ?? null,
                                                                shippedAt: detail.date,
                                                                estimatedDelivery: cleaned,
                                                            });
                                                        }
                                                        setEditingEstimatedDelivery(false);
                                                    }}
                                                    className="px-3 py-1.5 rounded-lg bg-violet-600 text-white font-bold hover:bg-violet-700 shrink-0"
                                                >
                                                    Appliquer
                                                </button>
                                            </div>
                                        )}

                                        {editingDeliveryCity && (
                                            <div className="p-2.5 rounded-xl bg-white border border-violet-200 flex items-center gap-2 text-[11px]">
                                                <input
                                                    type="text"
                                                    value={manualDeliveryCity}
                                                    onChange={(e) =>
                                                        setManualDeliveryCity(e.target.value)
                                                    }
                                                    placeholder="Ex : Paris, Lyon, Bordeaux…"
                                                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-semibold"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const cleaned = manualDeliveryCity.trim();
                                                        setManualDeliveryCity(cleaned);
                                                        if (cleaned) {
                                                            learnLabelEdit({
                                                                field: "deliveryCity",
                                                                autoValue:
                                                                    detail.tracking?.deliveryCity,
                                                                userValue: cleaned,
                                                            });
                                                        }
                                                        if (matchingExisting && cleaned) {
                                                            const storeName =
                                                                detail.tracking?.store?.trim() ||
                                                                detail.fromName ||
                                                                detail.tracking?.carrier ||
                                                                "Colis";
                                                            syncExistingParcel({
                                                                uid: detail.uid,
                                                                store: storeName,
                                                                orderNumber:
                                                                    detail.tracking?.orderNumber ??
                                                                    null,
                                                                numbers:
                                                                    detail.tracking?.numbers ?? [],
                                                                url: detail.tracking?.url ?? null,
                                                                shippedAt: detail.date,
                                                                deliveryCity: cleaned,
                                                            });
                                                        }
                                                        setEditingDeliveryCity(false);
                                                    }}
                                                    className="px-3 py-1.5 rounded-lg bg-violet-600 text-white font-bold hover:bg-violet-700 shrink-0"
                                                >
                                                    Appliquer
                                                </button>
                                            </div>
                                        )}

                                        {editingTracking && (
                                            <div className="p-2.5 rounded-xl bg-white border border-violet-200 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                                                <input
                                                    type="text"
                                                    value={manualTrackingNumber}
                                                    onChange={(e) => setManualTrackingNumber(e.target.value)}
                                                    placeholder="N° Colissimo (ex: 6A...)"
                                                    className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-mono"
                                                />
                                                <input
                                                    type="text"
                                                    value={manualTrackingCarrier}
                                                    onChange={(e) => setManualTrackingCarrier(e.target.value)}
                                                    placeholder="Transporteur (ex: Colissimo)"
                                                    className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={applyManualTracking}
                                                    disabled={!manualTrackingNumber.trim()}
                                                    className="px-3 py-1.5 rounded-lg bg-violet-600 text-white font-bold hover:bg-violet-700 disabled:opacity-40"
                                                >
                                                    Appliquer
                                                </button>
                                            </div>
                                        )}

                                        <div className="pt-2 border-t border-violet-200/70 space-y-1.5">
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                                <div className="relative flex-1 min-w-0">
                                                    <select
                                                        value={commandFolder || defaultCommandFolder}
                                                        onChange={(event) =>
                                                            setCommandFolder(event.target.value)
                                                        }
                                                        aria-label="Dossier de rangement de la commande"
                                                        className="w-full appearance-none rounded-xl border border-violet-200 bg-white pl-3 pr-9 py-2 text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                                    >
                                                        <option value="">Choisir un dossier…</option>
                                                        {folders.map((folder) => (
                                                            <option
                                                                key={folder.path}
                                                                value={folder.path}
                                                            >
                                                                {folder.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                                </div>
                                                <button
                                                    onClick={() => void validateCommand()}
                                                    disabled={
                                                        commandSaving ||
                                                        !(commandFolder || defaultCommandFolder) ||
                                                        requiresImagePick
                                                    }
                                                    className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-bold hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                                >
                                                    {commandSaving ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                    )}
                                                    <span>
                                                        {matchingExisting
                                                            ? "Mettre à jour et ranger"
                                                            : "Valider et suivre"}
                                                    </span>
                                                </button>
                                            </div>
                                            {requiresImagePick ? (
                                                <p className="text-[10px] font-semibold text-amber-700">
                                                    Sélectionnez au moins une image du produit ci-dessus pour valider cette commande.
                                                </p>
                                            ) : (
                                                <p className="text-[9px] text-slate-500">
                                                    L'email est rangé dans ce dossier et le colis rejoint le
                                                    tableau de bord (magasin, numéro, lien, statut, historique).
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    );
                                })()}

                                {detail.loans && detail.loans.length > 0 && (() => {
                                    const loanKeys = detail.loans.map(
                                        (loan) => `${loanCoverKey(loan.title, loan.author)}|${loan.dueDate ?? ""}`
                                    );
                                    const selectedCount = loanKeys.filter((k) => selectedLoans[k]).length;
                                    const allSelected = loanKeys.length > 0 && selectedCount === loanKeys.length;
                                    const extendableSelectedCount = detail.loans.filter((loan, idx) => {
                                        const k = loanKeys[idx];
                                        const effDue = loanDueOverrides[k] ?? loan.dueDate;
                                        return selectedLoans[k] && !loanExtensions[k] && Boolean(effDue);
                                    }).length;
                                    const firstSelectedDue =
                                        detail.loans
                                            .map((loan, idx) =>
                                                selectedLoans[loanKeys[idx]]
                                                    ? (loanDueOverrides[loanKeys[idx]] ?? loan.dueDate)
                                                    : null
                                            )
                                            .find((d): d is string => Boolean(d)) ??
                                        new Date().toISOString().slice(0, 10);
                                    const suggestedBulkDueDate = addDaysIso(firstSelectedDue, 21) ?? "";
                                    const effectiveBulkDueDate = bulkDueDate || suggestedBulkDueDate;

                                    return (
                                    <div className="mt-3 rounded-2xl bg-amber-50/60 border border-amber-200/70 p-3 space-y-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                                                <Library className="h-3.5 w-3.5" />
                                                Livres empruntés ({detail.loans.length})
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (allSelected) {
                                                        setSelectedLoans({});
                                                    } else {
                                                        const next: Record<string, boolean> = {};
                                                        for (const k of loanKeys) next[k] = true;
                                                        setSelectedLoans(next);
                                                    }
                                                }}
                                                className="px-2 py-1 rounded-lg bg-white border border-amber-200 text-[10px] font-bold text-amber-800 hover:bg-amber-100/70 transition-all"
                                            >
                                                {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
                                            </button>
                                        </div>

                                        {selectedCount > 0 && (
                                            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white border border-amber-200/80 px-2.5 py-2">
                                                <span className="text-[10px] font-bold text-slate-600">
                                                    {selectedCount} sélectionné{selectedCount > 1 ? "s" : ""}
                                                </span>
                                                {extendableSelectedCount > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => extendSelectedLoans(detail.loans ?? [])}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 transition-all"
                                                    >
                                                        <CalendarPlus className="h-3 w-3" />
                                                        <span>Prolonger (+3 sem.)</span>
                                                    </button>
                                                )}
                                                <form
                                                    onSubmit={(event) => {
                                                        event.preventDefault();
                                                        if (effectiveBulkDueDate) {
                                                            setSelectedLoansDueDate(detail.loans ?? [], effectiveBulkDueDate);
                                                        }
                                                    }}
                                                    className="flex items-center gap-1.5 ml-auto"
                                                >
                                                    <input
                                                        type="date"
                                                        value={effectiveBulkDueDate}
                                                        onChange={(event) => setBulkDueDate(event.target.value)}
                                                        aria-label="Date de retour pour la sélection"
                                                        className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-200"
                                                    />
                                                    <button
                                                        type="submit"
                                                        disabled={!effectiveBulkDueDate}
                                                        className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-[10px] font-bold hover:bg-amber-700 disabled:opacity-40 transition-all"
                                                    >
                                                        Appliquer date
                                                    </button>
                                                </form>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                                            {detail.loans.map((loan, index) => {
                                                const key = loanCoverKey(loan.title, loan.author);
                                                const extensionKey = loanKeys[index];
                                                const effectiveDueDate = loanDueOverrides[extensionKey] ?? loan.dueDate;
                                                return (
                                                    <LoanCard
                                                        key={`${key}-${index}`}
                                                        loan={loan}
                                                        override={coverOverrides[key]}
                                                        onSaveCover={(url) =>
                                                            persistLoanCover(key, url)
                                                        }
                                                        metaOverride={loanMetaOverrides[key]}
                                                        onSaveMeta={(meta) =>
                                                            persistLoanMeta(key, meta)
                                                        }
                                                        effectiveDueDate={effectiveDueDate}
                                                        hasDueOverride={Boolean(loanDueOverrides[extensionKey])}
                                                        onSaveDueDate={(iso) => setLoanDueDate(extensionKey, iso)}
                                                        extended={Boolean(loanExtensions[extensionKey])}
                                                        onExtend={() => extendLoan(extensionKey, effectiveDueDate)}
                                                        selected={Boolean(selectedLoans[extensionKey])}
                                                        onToggleSelect={() =>
                                                            setSelectedLoans((prev) => ({
                                                                ...prev,
                                                                [extensionKey]: !prev[extensionKey],
                                                            }))
                                                        }
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                    );
                                })()}

                                {!detail.tracking && draftRegister && (
                                    <span className="inline-block mt-1.5 text-[9px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600 font-bold">
                                        {draftRegister === "tutoiement" ? "Tutoiement détecté" : "Vouvoiement détecté"}
                                    </span>
                                )}

                                {detail.category === "kiosque" ? (
                                    <div className="mt-3 -mx-4 -mb-4 border-t border-slate-200/70 overflow-hidden rounded-b-2xl">
                                        {detail.html ? (
                                            <iframe
                                                key={detail.uid}
                                                title={detail.subject || "Contenu de l'email"}
                                                srcDoc={detail.html}
                                                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                                                style={{ height: `${iframeHeight}px` }}
                                                onLoad={(e) => {
                                                    const frame = e.currentTarget;
                                                    const doc = frame.contentDocument;
                                                    if (!doc) return;
                                                    const measure = () => {
                                                        const h = Math.max(
                                                            doc.documentElement?.scrollHeight ?? 0,
                                                            doc.body?.scrollHeight ?? 0,
                                                            320
                                                        );
                                                        setIframeHeight(h);
                                                    };
                                                    measure();
                                                    iframeObserverRef.current?.disconnect();
                                                    if (typeof ResizeObserver !== "undefined" && doc.body) {
                                                        const observer = new ResizeObserver(measure);
                                                        observer.observe(doc.body);
                                                        iframeObserverRef.current = observer;
                                                    }
                                                    doc.querySelectorAll("img").forEach((img) => {
                                                        if (!img.complete) {
                                                            img.addEventListener("load", measure, {
                                                                once: true,
                                                            });
                                                            img.addEventListener("error", measure, {
                                                                once: true,
                                                            });
                                                        }
                                                    });
                                                }}
                                                className="w-full bg-white block border-0"
                                            />
                                        ) : (
                                            <div className="p-4 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed bg-white">
                                                {detail.text}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                {/* Résumé + accordéon vers le message complet */}
                                <div className={`mt-3 rounded-2xl bg-slate-50 border border-slate-200/60 overflow-hidden ${invoiceActive ? "hidden" : ""}`}>
                                    <button
                                        onClick={() => setExpanded((value) => !value)}
                                        aria-expanded={expanded}
                                        className="w-full flex items-start justify-between gap-3 p-3 text-left hover:bg-slate-100/60 transition-colors"
                                    >
                                        <span className="min-w-0">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                                                Résumé de l'email
                                            </span>
                                            <span className="text-[11px] text-slate-600 block">
                                                {expanded ? "Message complet affiché ci-dessous." : detail.summary || summarize(detail.text)}
                                            </span>
                                            <span className="text-[10px] text-teal-700 font-bold block mt-1">
                                                {expanded ? "Replier le message" : "Déplier le message complet"}
                                            </span>
                                        </span>
                                        <ChevronDown
                                            className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""
                                                }`}
                                        />
                                    </button>
                                    {expanded && (
                                        <div className="px-3 pb-3 pt-2 border-t border-slate-200/60 space-y-2.5">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            {detail.exchanges > 1 ? (
                                                <p className="text-[10px] text-slate-400">
                                                    {detail.exchanges} messages dans ce fil : la réponse tient compte des
                                                    échanges précédents.
                                                </p>
                                            ) : (
                                                <span />
                                            )}
                                            {detail.html && (
                                                <div className="inline-flex items-center rounded-lg bg-white border border-slate-200 p-0.5 text-[10px] font-bold">
                                                    <button
                                                        type="button"
                                                        onClick={() => setViewMode("html")}
                                                        className={`px-2 py-0.5 rounded-md transition-colors ${
                                                            viewMode === "html"
                                                                ? "bg-slate-900 text-white"
                                                                : "text-slate-500 hover:text-slate-800"
                                                        }`}
                                                    >
                                                        HTML & images
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setViewMode("text")}
                                                        className={`px-2 py-0.5 rounded-md transition-colors ${
                                                            viewMode === "text"
                                                                ? "bg-slate-900 text-white"
                                                                : "text-slate-500 hover:text-slate-800"
                                                        }`}
                                                    >
                                                        Texte brut
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {detail.html && viewMode === "html" ? (
                                            <iframe
                                                key={detail.uid}
                                                title={detail.subject || "Contenu de l'email"}
                                                srcDoc={detail.html}
                                                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                                                scrolling="no"
                                                style={{ height: `${iframeHeight}px` }}
                                                onLoad={(e) => {
                                                    const frame = e.currentTarget;
                                                    const doc = frame.contentDocument;
                                                    if (!doc) return;
                                                    const measure = () => {
                                                        const h = Math.max(
                                                            doc.documentElement?.scrollHeight ?? 0,
                                                            doc.body?.scrollHeight ?? 0,
                                                            200
                                                        );
                                                        setIframeHeight(h + 16);
                                                    };
                                                    measure();
                                                    iframeObserverRef.current?.disconnect();
                                                    if (typeof ResizeObserver !== "undefined" && doc.body) {
                                                        const observer = new ResizeObserver(measure);
                                                        observer.observe(doc.body);
                                                        iframeObserverRef.current = observer;
                                                    }
                                                    doc.querySelectorAll("img").forEach((img) => {
                                                        if (!img.complete) {
                                                            img.addEventListener("load", measure, {
                                                                once: true,
                                                            });
                                                            img.addEventListener("error", measure, {
                                                                once: true,
                                                            });
                                                        }
                                                    });
                                                }}
                                                className="w-full rounded-xl border border-slate-200 bg-white overflow-hidden"
                                            />
                                        ) : (
                                            <div className="text-[11px] text-slate-700 whitespace-pre-wrap leading-relaxed bg-white rounded-xl border border-slate-200/70 p-3">
                                                {detail.text}
                                            </div>
                                        )}

                                        {detail.images && detail.images.length > 0 && (
                                            <div className="mt-2 space-y-2">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                    Images du message ({detail.images.length})
                                                </p>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    {detail.images.map((image) => (
                                                        <a
                                                            key={image.part}
                                                            href={attachmentUrl(detail.uid, image)}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="block rounded-xl border border-slate-200 bg-white overflow-hidden hover:border-teal-400 transition-colors"
                                                        >
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={attachmentUrl(detail.uid, image)}
                                                                alt={image.filename}
                                                                loading="lazy"
                                                                className="w-full max-h-48 object-contain"
                                                            />
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    )}
                                </div>
                                    </>
                                )}
                            </div>

                            {(invoiceLoading || invoiceProposal || invoiceError) && (
                                <div className="px-4 py-3 border-t border-slate-100 bg-indigo-50/50 space-y-2">
                                    {invoiceLoading && (
                                        <p className="flex items-center gap-1.5 text-[11px] text-indigo-800">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            Recherche de la facture…
                                        </p>
                                    )}
                                    {invoiceProposal && (
                                        <>
                                            <p className="flex items-center gap-2 text-[11px] font-bold text-indigo-900">
                                                <ProviderLogo
                                                    provider={invoiceProposal.provider}
                                                    className="h-7 w-7"
                                                />
                                                <span>
                                                    Facture {invoiceProposal.providerLabel} détectée ·{" "}
                                                    {invoiceProposal.period}
                                                    {invoiceProposal.invoiceDate
                                                        ? ` · facturée le ${formatDate(invoiceProposal.invoiceDate)}`
                                                        : ""}
                                                </span>
                                            </p>

                                            {invoiceProposal.files.map((file) => (
                                                <input
                                                    key={file.part}
                                                    value={invoiceNames[file.part] ?? file.proposed}
                                                    onChange={(event) =>
                                                        setInvoiceNames((previous) => ({
                                                            ...previous,
                                                            [file.part]: event.target.value,
                                                        }))
                                                    }
                                                    className="w-full bg-white border border-indigo-200 rounded-xl px-3 py-1.5 text-[11px] font-mono focus:outline-none focus:border-indigo-500"
                                                />
                                            ))}

                                            <div className="flex flex-wrap items-center gap-2">
                                                {invoiceProposal.files.length > 0 && (
                                                    <button
                                                        onClick={() => void downloadInvoice()}
                                                        disabled={invoiceWorking}
                                                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-[11px] font-bold transition-all"
                                                    >
                                                        {invoiceWorking ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        ) : status?.driveConfigured ? (
                                                            <FolderUp className="h-3.5 w-3.5" />
                                                        ) : (
                                                            <Download className="h-3.5 w-3.5" />
                                                        )}
                                                        <span>
                                                            {status?.driveConfigured
                                                                ? "Valider le nom et ranger sur Drive"
                                                                : "Valider le nom et télécharger"}
                                                        </span>
                                                    </button>
                                                )}
                                                {invoiceProposal.files.length > 0 && (
                                                    <span className="text-[10px] text-slate-500">
                                                        {status?.driveConfigured
                                                            ? "Le PDF sera rangé dans Google Drive et le mail supprimé automatiquement."
                                                            : "Le mail sera supprimé automatiquement après le téléchargement."}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        setInvoiceProposal(null);
                                                        setInvoiceError(null);
                                                    }}
                                                    className="px-3 py-2 rounded-xl text-slate-500 hover:text-slate-800 text-[11px] font-semibold"
                                                >
                                                    Ignorer
                                                </button>
                                            </div>
                                        </>
                                    )}
                                    {invoiceError && (
                                        <div className="text-[11px] text-rose-600 space-y-1">
                                            <p>{invoiceError}</p>
                                            {invoiceProposal?.link && (
                                                <a
                                                    href={`/facture?url=${encodeURIComponent(
                                                        invoiceProposal.link
                                                    )}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 font-bold underline"
                                                >
                                                    <ExternalLink className="h-3 w-3" />
                                                    Ouvrir la facture dans le navigateur
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {!(invoiceLoading || invoiceProposal) && (
                                <>
                            <div className="px-4 py-3 border-t border-slate-100 bg-white flex flex-wrap items-center gap-2">
                                {detail && !detail.tracking && (
                                    <>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                            Ranger
                                        </span>
                                        <div className="relative inline-flex items-center">
                                            <select
                                                value={folderTarget}
                                                onChange={(event) => setFolderTarget(event.target.value)}
                                                className="appearance-none bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-8 py-1.5 text-[11px] text-slate-700 focus:outline-none focus:border-teal-500"
                                            >
                                                <option value="">Ne pas ranger automatiquement</option>
                                                {folders
                                                    .filter((folder) => folder.kind === "label")
                                                    .map((folder) => (
                                                        <option key={folder.path} value={folder.path}>
                                                            {folder.label}
                                                        </option>
                                                    ))}
                                            </select>
                                            <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-500" />
                                        </div>
                                        <button
                                            onClick={() => void moveTo(folderTarget)}
                                            disabled={moving || !folderTarget}
                                            title="Déplacer maintenant"
                                            aria-label="Déplacer maintenant"
                                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 transition-all"
                                        >
                                            {moving ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <FolderInput className="h-4 w-4" />
                                            )}
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={() => void removeMessage()}
                                    disabled={moving || !detail}
                                    title="Supprimer (corbeille)"
                                    aria-label="Supprimer"
                                    className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-all"
                                >
                                    {moving ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Trash2 className="h-4 w-4" />
                                    )}
                                </button>
                                {folders.length === 0 && (
                                    <span className="text-[10px] text-slate-400">
                                        Dossiers indisponibles pour le moment
                                    </span>
                                )}
                            </div>
                            {detail && !detail.tracking && detail.category !== "kiosque" && (
                            <div className="px-4 pb-3 bg-white text-[10px] text-slate-500 space-y-0.5">
                                {suggesting && (
                                    <p className="flex items-center gap-1.5">
                                        <Loader2 className="h-3 w-3 animate-spin text-teal-600" />
                                        <span>
                                            Analyse des dossiers{" "}
                                            {suggestProgress && suggestProgress.total > 0
                                                ? `${suggestProgress.processed}/${suggestProgress.total}`
                                                : "…"}
                                        </span>
                                    </p>
                                )}
                                {!suggesting && suggestedFolders.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span>Suggestion{suggestedFolders.length > 1 ? "s" : ""} :</span>
                                        {suggestedFolders.map((folder) => (
                                            <button
                                                key={folder.path}
                                                onClick={() => setFolderTarget(folder.path)}
                                                title={folder.reason}
                                                className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold transition-colors ${
                                                    folderTarget === folder.path
                                                        ? "bg-teal-600 text-white border-teal-600"
                                                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                                                }`}
                                            >
                                                {folder.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {!suggesting && suggestedFolders.length === 0 && !suggestError && (
                                    <p>
                                        Aucun dossier existant ne contient déjà d'emails de cet
                                        expéditeur
                                        {suggestMeta ? ` (${suggestMeta.scanned} dossiers analysés)` : ""}
                                        {suggestMeta && suggestMeta.errors > 0
                                            ? ` — ${suggestMeta.errors} recherche(s) en échec`
                                            : ""}
                                        .
                                    </p>
                                )}
                                {suggestError && (
                                    <p className="text-amber-700">
                                        {suggestError === "Command failed"
                                            ? "Suggestions de dossiers indisponibles pour cet email."
                                            : suggestError}
                                    </p>
                                )}
                                <p>
                                    {folderTarget
                                        ? "Ce dossier sera appliqué automatiquement dès l'envoi de la réponse."
                                        : "Sélectionnez un dossier pour qu'il soit appliqué après l'envoi."}
                                </p>
                                {detail && (
                                    <button
                                        onClick={() => void suggestFolderFor(detail.uid, true)}
                                        className="text-[10px] text-teal-700 font-bold hover:underline"
                                    >
                                        Relancer la recherche de dossier
                                    </button>
                                )}
                            </div>
                            )}

                                </>
                            )}

                            {detail.needsReply || forceReply ? (
                                <div className="p-4 space-y-3 bg-slate-50/40">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[11px] font-bold text-slate-500">
                                                {draftIntent ? `Réponse proposée · ${draftIntent}` : "Votre réponse"}
                                                {styleSamples > 0 ? ` · style appris (${styleSamples})` : ""}
                                            </span>
                                            {draftAiPowered !== null && (
                                                <span
                                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                                        draftAiPowered
                                                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                                            : "bg-slate-100 text-slate-600 border-slate-200"
                                                    }`}
                                                >
                                                    {draftAiPowered ? "DeepSeek IA" : "Mode règles local"}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => void generateDraft()}
                                            disabled={drafting}
                                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 disabled:opacity-60 text-[11px] font-bold hover:bg-teal-100 transition-all"
                                        >
                                            {drafting ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <PenLine className="h-3.5 w-3.5" />
                                            )}
                                            <span>
                                                {drafting ? "Rédaction…" : reply ? "Régénérer la réponse" : "Rédiger une réponse"}
                                            </span>
                                        </button>
                                    </div>

                                    <input
                                        type="text"
                                        value={draftInstruction}
                                        onChange={(event) => setDraftInstruction(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                                event.preventDefault();
                                                void generateDraft();
                                            }
                                        }}
                                        placeholder="Consigne rapide pour DeepSeek (ex: propose jeudi 14h, refuse poliment, demande la facture)..."
                                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-teal-500"
                                    />

                                    <textarea
                                        value={reply}
                                        onChange={(event) => setReply(event.target.value)}
                                        rows={6}
                                        placeholder="Écrivez ou générez une réponse, puis relisez avant d'envoyer."
                                        className="w-full bg-white border border-slate-200 rounded-2xl p-3 text-xs text-slate-800 focus:outline-none focus:border-teal-500 resize-y"
                                    />

                                    <p className="text-[10px] text-slate-500">
                                        Rien n'est envoyé sans votre validation : « Enregistrer en brouillon » dépose le
                                        texte dans Gmail, « Envoyer maintenant » demande une confirmation.
                                    </p>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            onClick={() => void submitReply("draft")}
                                            disabled={sending !== null}
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 text-xs font-bold transition-all"
                                        >
                                            {sending === "draft" ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Save className="h-3.5 w-3.5" />
                                            )}
                                            <span>Enregistrer en brouillon</span>
                                        </button>
                                        <button
                                            onClick={() => void submitReply("send")}
                                            disabled={sending !== null}
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold transition-all"
                                        >
                                            {sending === "send" ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Send className="h-3.5 w-3.5" />
                                            )}
                                            <span>Envoyer maintenant</span>
                                        </button>
                                        {forceReply && !detail.needsReply && (
                                            <button
                                                onClick={() => {
                                                    setForceReply(false);
                                                    setReply("");
                                                    setDraftSubject(null);
                                                    setDraftIntent(null);
                                                    setDraftRegister(null);
                                                }}
                                                className="px-3 py-2 rounded-xl text-slate-500 hover:text-slate-800 text-xs font-semibold"
                                            >
                                                Annuler la réponse
                                            </button>
                                        )}
                                        <button
                                            onClick={() => {
                                                setDetail(null);
                                                setExpanded(false);
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-500 hover:text-slate-800 text-xs font-semibold"
                                        >
                                            <ArrowLeft className="h-3.5 w-3.5" />
                                            <span>Fermer</span>
                                        </button>
                                    </div>
                                </div>
                            ) : detail.category === "commande" || detail.category === "kiosque" ? null : (
                                <div className={`p-4 border-t border-slate-100 bg-slate-50/40 flex flex-wrap items-center justify-between gap-3 ${invoiceActive ? "hidden" : ""}`}>
                                    <p className="text-[11px] text-slate-500">
                                        {detail.category === "important"
                                            ? "Action à prévoir (paiement, échéance) mais aucune réponse nécessaire."
                                            : "Information à lire : aucune réponse attendue."}
                                    </p>
                                    <button
                                        onClick={() => {
                                            setForceReply(true);
                                            void generateDraft(detail);
                                        }}
                                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] font-bold hover:bg-slate-100 transition-all"
                                    >
                                        <PenLine className="h-3.5 w-3.5" />
                                        <span>Répondre quand même</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                {invoiceActive &&
                    invoiceProposal &&
                    invoiceProposal.files.length > 0 &&
                    (invoiceProposal.files[0].part || invoicePreviewOk === true) && (
                    <div className="lg:col-span-4">
                        <div className="rounded-2xl bg-white border border-slate-200/70 shadow-sm overflow-hidden h-[70vh] min-h-[420px]">
                            <iframe
                                title="Aperçu complet de la facture"
                                src={invoiceFileUrl(
                                    detail?.uid ?? 0,
                                    invoiceProposal,
                                    invoiceProposal.files[0]
                                )}
                                className="w-full h-full"
                            />
                        </div>
                    </div>
                )}
            </div>
            )}
        </div>
    );
};
