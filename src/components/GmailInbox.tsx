"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    ChevronDown,
    KeyRound,
    Loader2,
    Mail,
    PenLine,
    RefreshCw,
    Save,
    Send,
} from "lucide-react";
import { computeStyleProfile, loadSamples, recordReplySample } from "@/lib/styleMemory";

type GmailCategory = "personnel" | "important" | "infos" | "newsletter" | "promotion";

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
    infos: "Infos",
    newsletter: "Newsletter",
    promotion: "Publicité",
};

const CATEGORY_STYLE: Record<GmailCategory, string> = {
    personnel: "bg-teal-50 text-teal-700 border-teal-200",
    important: "bg-rose-50 text-rose-700 border-rose-200",
    infos: "bg-sky-50 text-sky-700 border-sky-200",
    newsletter: "bg-slate-100 text-slate-500 border-slate-200",
    promotion: "bg-amber-50 text-amber-700 border-amber-200",
};

type Filter = "todo" | "important" | "infos" | "later" | "all";

const PAGE_SIZE = 50;
const MAX_MESSAGES = 200;

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

function attachmentUrl(uid: number, file: PartInfo): string {
    const params = new URLSearchParams({
        uid: String(uid),
        part: file.part,
        type: file.type,
        name: file.filename,
    });
    return `/api/gmail/attachment?${params.toString()}`;
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
    const [folders, setFolders] = useState<{ path: string; label: string; kind: string }[]>([]);
    const [folderTarget, setFolderTarget] = useState("");
    const [moving, setMoving] = useState(false);
    const [styleSamples, setStyleSamples] = useState(0);
    const [suggestedFolder, setSuggestedFolder] = useState<FolderSuggestion | null>(null);
    const [suggesting, setSuggesting] = useState(false);
    const [suggestMeta, setSuggestMeta] = useState<{
        scanned: number;
        withSender: number;
        withDomain: number;
    } | null>(null);
    const [suggestError, setSuggestError] = useState<string | null>(null);

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
                setMessages(incoming);
                setTotal(messagesData.total ?? 0);

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
    const important = useMemo(
        () => messages.filter((message) => message.category === "important"),
        [messages]
    );
    const infos = useMemo(() => messages.filter((message) => message.category === "infos"), [messages]);
    const later = useMemo(() => messages.filter((message) => isLater(message.category)), [messages]);

    const visibleMessages =
        filter === "todo"
            ? toReview
            : filter === "important"
                ? important
                : filter === "infos"
                    ? infos
                    : filter === "later"
                        ? later
                        : messages;

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
        setSuggesting(true);
        setSuggestedFolder(null);
        setSuggestError(null);
        setSuggestMeta(null);
        try {
            const response = await fetch(
                `/api/gmail/suggest-folder?uid=${uid}${refresh ? "&refresh=1" : ""}`,
                {
                cache: "no-store",
                credentials: "same-origin",
            });
            const data = (await response.json()) as {
                suggestion?: FolderSuggestion | null;
                scanned?: number;
                withSender?: number;
                withDomain?: number;
                error?: string;
            };
            if (!response.ok) {
                setSuggestError(data.error ?? "La recherche de dossier a échoué.");
                return;
            }
            setSuggestMeta({
                scanned: data.scanned ?? 0,
                withSender: data.withSender ?? 0,
                withDomain: data.withDomain ?? 0,
            });
            if (data.suggestion) {
                setSuggestedFolder(data.suggestion);
                setFolderTarget((current) => current || data.suggestion!.path);
            }
        } catch {
            setSuggestError("Impossible de joindre la recherche de dossier.");
        } finally {
            setSuggesting(false);
        }
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
                            onClick={() => {
                                const next = Math.min(limit + PAGE_SIZE, MAX_MESSAGES);
                                setLimit(next);
                                void load(next);
                            }}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold hover:bg-teal-100 transition-all"
                        >
                            <span>Charger plus</span>
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
                        ["important", `Important (${important.length})`],
                        ["infos", `Infos (${infos.length})`],
                        ["later", `Newsletters & pubs (${later.length})`],
                        ["all", `Tout (${messages.length})`],
                    ] as [Filter, string][]
                ).map(([value, label]) => (
                    <button
                        key={value}
                        onClick={() => setFilter(value)}
                        className={`px-3.5 py-1.5 rounded-xl text-[11px] font-bold transition-all ${filter === value
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Liste */}
                <div className="lg:col-span-5 space-y-2">
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
                <div className="lg:col-span-7">
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
                                <div className="mt-3 rounded-2xl bg-slate-50 border border-slate-200/60 overflow-hidden">
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
                                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 text-[11px] font-bold transition-all"
                                >
                                    {moving ? "Déplacement…" : "Déplacer maintenant"}
                                </button>
                                <button
                                    onClick={() => void moveTo("[Gmail]/All Mail")}
                                    disabled={moving}
                                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-[11px] font-bold transition-all"
                                >
                                    Archiver
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
                                        <span>Recherche d'un dossier habituel…</span>
                                    </p>
                                )}
                                {!suggesting && suggestedFolder && (
                                    <p>
                                        Suggestion :{" "}
                                        <span className="font-bold text-teal-700">
                                            {suggestedFolder.label}
                                        </span>{" "}
                                        <span className="text-slate-400">
                                            ({suggestedFolder.reason})
                                        </span>
                                    </p>
                                )}
                                {!suggesting && !suggestedFolder && !suggestError && (
                                    <p>
                                        Aucun dossier existant ne contient déjà d'emails de cet
                                        expéditeur
                                        {suggestMeta ? ` (${suggestMeta.scanned} dossiers analysés)` : ""}.
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
                                <div className="p-4 border-t border-slate-100 bg-slate-50/40 flex flex-wrap items-center justify-between gap-3">
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
            </div>
        </div>
    );
};
