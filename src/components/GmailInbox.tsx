"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    ChevronDown,
    Download,
    ExternalLink,
    Eye,
    FolderInput,
    KeyRound,
    Loader2,
    Mail,
    PenLine,
    RefreshCw,
    Save,
    Send,
    Trash2,
} from "lucide-react";
import { computeStyleProfile, loadSamples, recordReplySample } from "@/lib/styleMemory";

type GmailCategory = "personnel" | "important" | "factures" | "infos" | "newsletter" | "promotion";

interface GmailStatus {
    configured: boolean;
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
}

interface MessageDetail extends InboxMessage {
    to: string;
    cc: string;
    text: string;
    summary: string;
    currentText: string;
    historyText: string;
    exchanges: number;
    attachments: string[];
    attachmentParts: PartInfo[];
    images: PartInfo[];
    messageId: string;
    inReplyTo: string;
}

interface ReplyDraftResponse {
    to: string;
    subject: string;
    body: string;
    intent: string;
    register: "vouvoiement" | "tutoiement";
    needsReply: boolean;
    exchanges: number;
    error?: string;
}

const CATEGORY_LABEL: Record<GmailCategory, string> = {
    personnel: "Répondre",
    important: "Important",
    factures: "Factures",
    infos: "Infos",
    newsletter: "Newsletter",
    promotion: "Publicité",
};

const CATEGORY_STYLE: Record<GmailCategory, string> = {
    personnel: "bg-teal-50 text-teal-700 border-teal-200",
    important: "bg-rose-50 text-rose-700 border-rose-200",
    factures: "bg-indigo-50 text-indigo-700 border-indigo-200",
    infos: "bg-sky-50 text-sky-700 border-sky-200",
    newsletter: "bg-slate-100 text-slate-500 border-slate-200",
    promotion: "bg-amber-50 text-amber-700 border-amber-200",
};

type Filter = "todo" | "reply" | "important" | "factures" | "infos" | "later" | "all";

const PAGE_SIZE = 500;
const MAX_MESSAGES = 2000;
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

const INVOICE_LOGOS: Record<string, { domain: string; label: string; color: string }> = {
    lagoon: { domain: "lagoon.nc", label: "LAGOON", color: "bg-sky-600" },
    eec: { domain: "engie.nc", label: "EEC", color: "bg-blue-700" },
    cde: { domain: "cde.nc", label: "CDE", color: "bg-cyan-600" },
    "opt-internet": { domain: "opt.nc", label: "OPT", color: "bg-emerald-600" },
    "opt-mobile": { domain: "helia.nc", label: "Helia", color: "bg-orange-500" },
};

const ProviderLogo: React.FC<{ provider: string; className?: string }> = ({
    provider,
    className = "",
}) => {
    const meta = INVOICE_LOGOS[provider] ?? {
        domain: "",
        label: "Facture",
        color: "bg-slate-600",
    };
    const [broken, setBroken] = useState(false);

    return (
        <span
            className={`inline-flex items-center justify-center overflow-hidden rounded-lg bg-white border border-slate-200 shrink-0 ${className}`}
        >
            {!broken && meta.domain ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={`https://logo.clearbit.com/${meta.domain}`}
                    alt={meta.label}
                    onError={() => setBroken(true)}
                    className="h-full w-full object-contain p-0.5"
                />
            ) : (
                <span
                    className={`h-full w-full flex items-center justify-center text-white text-[9px] font-extrabold ${meta.color}`}
                >
                    {meta.label}
                </span>
            )}
        </span>
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

interface GmailInboxProps {
    /** Ligne de signature utilisée dans les brouillons (ex. « Bien cordialement, Alva DALERY »). */
    signature?: string;
}

export const GmailInbox: React.FC<GmailInboxProps> = ({ signature = "" }) => {
    const [status, setStatus] = useState<GmailStatus | null>(null);
    const [messages, setMessages] = useState<InboxMessage[]>([]);
    const [total, setTotal] = useState(0);
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>("todo");

    const [detail, setDetail] = useState<MessageDetail | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [reply, setReply] = useState("");
    const [forceReply, setForceReply] = useState(false);
    const [draftSubject, setDraftSubject] = useState<string | null>(null);
    const [draftIntent, setDraftIntent] = useState<string | null>(null);
    const [draftRegister, setDraftRegister] = useState<"vouvoiement" | "tutoiement" | null>(null);
    const [drafting, setDrafting] = useState(false);
    const [sending, setSending] = useState<"draft" | "send" | null>(null);
    const autoOpenedRef = useRef(false);
    const autoAllRef = useRef(false);
    const [folders, setFolders] = useState<{ path: string; label: string; kind: string }[]>([]);
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

    const load = useCallback(
        async (requestedLimit: number) => {
            setLoading(true);
            setError(null);
            try {
                const statusResponse = await fetch("/api/gmail/status", {
                    cache: "no-store",
                    credentials: "same-origin",
                });
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

                const messagesResponse = await fetch(`/api/gmail/messages?limit=${requestedLimit}`, {
                    cache: "no-store",
                    credentials: "same-origin",
                });
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
                setMessages(incoming);
                setTotal(totalAvailable);

                // Extension automatique à toute la boîte (plafond 2000).
                if (
                    !autoAllRef.current &&
                    incoming.length < totalAvailable &&
                    totalAvailable <= MAX_MESSAGES
                ) {
                    autoAllRef.current = true;
                    void load(Math.min(totalAvailable, MAX_MESSAGES));
                }

                // Première ouverture : on sélectionne directement le premier email
                // qui attend une réponse, et la proposition est rédigée aussitôt.
                if (!autoOpenedRef.current) {
                    const firstToReply = incoming.find((message) => message.needsReply);
                    if (firstToReply) {
                        autoOpenedRef.current = true;
                        void openMessage(firstToReply.uid);
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
        void load(limit);
        // Le chargement initial suffit : « Charger plus » relance explicitement.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!feedback) return;
        const timer = setTimeout(() => setFeedback(null), 5000);
        return () => clearTimeout(timer);
    }, [feedback]);

    useEffect(() => {
        if (!status?.configured) return;
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
    }, []);

    // « À traiter » = tout ce qui demande un coup d'œil : répondre, important ou infos,
    // en excluant les newsletters/publicités et les messages déjà traités.
    const toReview = useMemo(
        () =>
            messages.filter(
                (message) => !isLater(message.category) && !message.answered
            ),
        [messages]
    );
    const toReply = useMemo(() => messages.filter((message) => message.needsReply), [messages]);
    const important = useMemo(
        () => messages.filter((message) => message.category === "important"),
        [messages]
    );
    const factures = useMemo(
        () => messages.filter((message) => message.category === "factures"),
        [messages]
    );
    const infos = useMemo(() => messages.filter((message) => message.category === "infos"), [messages]);
    const later = useMemo(() => messages.filter((message) => isLater(message.category)), [messages]);

    const visibleMessages =
        filter === "todo"
            ? toReview
            : filter === "reply"
                ? toReply
                : filter === "important"
                    ? important
                    : filter === "factures"
                        ? factures
                        : filter === "infos"
                            ? infos
                            : filter === "later"
                                ? later
                                : messages;

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
            case "todo":
                return toReview;
            case "reply":
                return toReply;
            case "important":
                return important;
            case "factures":
                return factures;
            case "infos":
                return infos;
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
            void openMessage(list[0].uid);
        } else {
            setDetail(null);
        }
    };

    async function openMessage(uid: number) {
        setLoadingDetail(true);
        setDetail(null);
        setExpanded(false);
        setForceReply(false);
        setFolderTarget("");
        setReply("");
        setDraftSubject(null);
        setDraftIntent(null);
        setDraftRegister(null);
        try {
            const response = await fetch(`/api/gmail/message?uid=${uid}`, {
                cache: "no-store",
                credentials: "same-origin",
            });
            const data = (await response.json()) as MessageDetail & { error?: string };
            if (!response.ok) {
                setError(data.error ?? "Impossible d'ouvrir ce message.");
                return;
            }
            setDetail(data);
            void suggestFolderFor(data.uid);
            setInvoiceProposal(null);
            setInvoiceNames({});
            setInvoiceError(null);
            setInvoicePreviewOk(null);
            if (data.category === "factures") {
                void loadInvoice(data.uid);
            }
            // Proposition immédiate : dès qu'un email attend une réponse, on rédige.
            if (data.needsReply) {
                void generateDraft(data);
            }
        } catch {
            setError("Impossible de charger le message.");
        } finally {
            setLoadingDetail(false);
        }
    }

    async function generateDraft(target: MessageDetail | null = detail) {
        if (!target) return;
        setDrafting(true);
        setFeedback(null);
        try {
            const response = await fetch("/api/gmail/reply-draft", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                    uid: target.uid,
                    signature,
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
            setFeedback(
                data.needsReply
                    ? `Proposition prête (${data.intent}, ${data.register}, ${
                          data.exchanges ?? 1
                      } échange(s) analysé(s)). Relisez, ajustez, puis validez.`
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

    async function downloadInvoice() {
        if (!invoiceProposal || !detail) return;
        const target = detail;
        setInvoiceWorking(true);
        setInvoiceError(null);

        try {
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

            const deletion = await fetch("/api/gmail/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ uid: target.uid }),
            });
            const deletionData = (await deletion.json()) as { error?: string };
            if (!deletion.ok) {
                setInvoiceError(
                    deletionData.error ?? "PDF téléchargé, mais suppression du mail impossible."
                );
                return;
            }

            setMessages((previous) => previous.filter((item) => item.uid !== target.uid));
            setTotal((previous) => Math.max(0, previous - 1));
            setDetail(null);
            setFeedback("Facture téléchargée et email supprimé.");
        } catch (error) {
            setInvoiceError(
                error instanceof Error ? error.message : "Téléchargement impossible."
            );
        } finally {
            setInvoiceWorking(false);
        }
    }

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

    async function downloadSelectedInvoices() {
        const rows = invoiceRowList.filter((row) => row.selected && row.status === "ready");
        if (rows.length === 0) {
            setInvoiceBatchMessage("Sélectionnez au moins une facture à télécharger.");
            return;
        }

        setInvoiceBatchWorking(true);
        setInvoiceBatchMessage(null);
        let saved = 0;
        const failures: string[] = [];

        for (const row of rows) {
            const proposal = row.proposal;
            if (!proposal) continue;
            try {
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
                        error instanceof Error ? error.message : "téléchargement impossible"
                    }`
                );
            }
        }

        setInvoiceBatchWorking(false);
        setInvoiceBatchMessage(
            failures.length === 0
                ? `${saved} facture${saved > 1 ? "s" : ""} téléchargée${
                      saved > 1 ? "s" : ""
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
            setDetail(null);
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
            setDetail(null);
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
            setDetail(null);
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
                    setDetail(null);
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
                    <Mail className="h-4 w-4 text-teal-600" />
                    <span className="font-bold text-slate-800">{status?.email}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-500">
                        {messages.length} sur {total} message{total > 1 ? "s" : ""} analysés
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {messages.length < Math.min(total, MAX_MESSAGES) && (
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
                    )}
                    <button
                        onClick={() => void load(limit)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                        <span>Rafraîchir</span>
                    </button>
                </div>
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
                        ["todo", `À traiter (${toReview.length})`],
                        ["reply", `Répondre (${toReply.length})`],
                        ["important", `Important (${important.length})`],
                        ["factures", `Factures (${factures.length})`],
                        ["infos", `Infos (${infos.length})`],
                        ["later", `Newsletter/pubs (${later.length})`],
                        ["all", `Tous (${messages.length})`],
                    ] as [Filter, string][]
                ).map(([value, label]) => (
                    <button
                        key={value}
                        onClick={() => changeFilter(value)}
                        className={`px-3.5 py-1.5 rounded-xl text-[11px] font-bold transition-all ${filter === value
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                    >
                        {label}
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
                            ) : (
                                <Download className="h-3.5 w-3.5" />
                            )}
                            <span>
                                {invoiceBatchWorking
                                    ? "Téléchargement…"
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
                                                className={`text-[11px] shrink-0 tabular-nums ${
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
                <div className={`space-y-2 ${invoiceActive ? "lg:col-span-3" : "lg:col-span-5"}`}>
                    {visibleMessages.length === 0 && !error && (
                        <p className="text-xs text-slate-500 p-4">
                            {filter === "todo"
                                ? "Aucun message ne nécessite de réponse parmi les emails chargés."
                                : "Aucun message dans cette catégorie."}
                        </p>
                    )}
                    {visibleMessages.map((message) => (
                        <button
                            key={message.uid}
                            onClick={() => void openMessage(message.uid)}
                            className={`w-full text-left p-3.5 rounded-2xl border transition-all ${detail?.uid === message.uid
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
                                <span
                                    className={`text-[9px] px-2 py-0.5 rounded-full border font-bold ${CATEGORY_STYLE[message.category]}`}
                                >
                                    {CATEGORY_LABEL[message.category]}
                                </span>
                                {message.answered && (
                                    <span className="text-[9px] px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold">
                                        Répondu
                                    </span>
                                )}
                            </div>
                        </button>
                    ))}
                </div>

                {/* Lecture + réponse */}
                <div className={invoiceActive ? "lg:col-span-5" : "lg:col-span-7"}>
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
                        <div className="rounded-2xl bg-white border border-slate-200/70 shadow-sm overflow-hidden">
                            <div className="p-4 border-b border-slate-100">
                                <div className="flex items-start justify-between gap-3 mb-1">
                                    <p className="text-sm font-extrabold text-slate-900">{detail.subject}</p>
                                    <span
                                        className={`text-[9px] px-2 py-0.5 rounded-full border font-bold shrink-0 ${CATEGORY_STYLE[detail.category]}`}
                                    >
                                        {CATEGORY_LABEL[detail.category]}
                                    </span>
                                    {detail.answered && (
                                        <span className="text-[9px] px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold shrink-0">
                                            Répondu
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11px] text-slate-500">
                                    De <span className="font-semibold text-slate-700">{detail.fromName}</span>
                                    {detail.fromEmail && ` <${detail.fromEmail}>`}
                                    {" · "}
                                    {formatDate(detail.date)} · {formatRelative(detail.date)}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1">Tri automatique : {detail.reason}</p>
                                {draftRegister && (
                                    <span className="inline-block mt-1.5 text-[9px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600 font-bold">
                                        {draftRegister === "tutoiement" ? "Tutoiement détecté" : "Vouvoiement détecté"}
                                    </span>
                                )}

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
                                        <div className="px-3 pb-3 pt-2 border-t border-slate-200/60">
                                        {detail.exchanges > 1 && (
                                            <p className="text-[10px] text-slate-400 mb-2">
                                                {detail.exchanges} messages dans ce fil : la réponse tient compte des
                                                échanges précédents.
                                            </p>
                                        )}
                                        <div className="max-h-72 overflow-y-auto text-[11px] text-slate-700 whitespace-pre-wrap leading-relaxed">
                                            {detail.text}
                                        </div>
                                        {detail.images && detail.images.length > 0 && (
                                            <div className="mt-3 space-y-2">
                                                {detail.images.map((image) => (
                                                    <a
                                                        key={image.part}
                                                        href={attachmentUrl(detail.uid, image)}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="block rounded-xl border border-slate-200 bg-white overflow-hidden"
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
                                        )}
                                    </div>
                                    )}
                                </div>
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
                                                        ) : (
                                                            <Download className="h-3.5 w-3.5" />
                                                        )}
                                                        <span>Valider le nom et télécharger</span>
                                                    </button>
                                                )}
                                                {invoiceProposal.files.length > 0 && (
                                                    <span className="text-[10px] text-slate-500">
                                                        Le mail sera supprimé automatiquement après le téléchargement.
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
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    Ranger
                                </span>
                                <select
                                    value={folderTarget}
                                    onChange={(event) => setFolderTarget(event.target.value)}
                                    className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-700 focus:outline-none focus:border-teal-500"
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
                                {suggestError && <p className="text-rose-600">{suggestError}</p>}
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

                                </>
                            )}

                            {detail.needsReply || forceReply ? (
                                <div className="p-4 space-y-3 bg-slate-50/40">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-[11px] font-bold text-slate-500">
                                            {draftIntent ? `Réponse proposée · ${draftIntent}` : "Votre réponse"}
                                            {styleSamples > 0 ? ` · style appris (${styleSamples})` : ""}
                                        </span>
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
                            ) : (
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
