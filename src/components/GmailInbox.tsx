"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    KeyRound,
    Loader2,
    Mail,
    PenLine,
    RefreshCw,
    Save,
    Send,
} from "lucide-react";

type GmailCategory = "personnel" | "newsletter" | "promotion" | "notification";

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
    category: GmailCategory;
    needsReply: boolean;
    reason: string;
}

interface MessageDetail extends InboxMessage {
    to: string;
    cc: string;
    text: string;
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
    error?: string;
}

const CATEGORY_LABEL: Record<GmailCategory, string> = {
    personnel: "À traiter",
    newsletter: "Newsletter",
    promotion: "Publicité",
    notification: "Notification",
};

const CATEGORY_STYLE: Record<GmailCategory, string> = {
    personnel: "bg-teal-50 text-teal-700 border-teal-200",
    newsletter: "bg-slate-100 text-slate-500 border-slate-200",
    promotion: "bg-amber-50 text-amber-700 border-amber-200",
    notification: "bg-sky-50 text-sky-700 border-sky-200",
};

function formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function replySubject(subject: string): string {
    return /^re\s*:/i.test(subject) ? subject : `Re: ${subject}`;
}

interface GmailInboxProps {
    /** Ligne de signature utilisée dans les brouillons (ex. « Bien cordialement, Alva DALERY »). */
    signature?: string;
}

export const GmailInbox: React.FC<GmailInboxProps> = ({ signature = "" }) => {
    const [status, setStatus] = useState<GmailStatus | null>(null);
    const [messages, setMessages] = useState<InboxMessage[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [filter, setFilter] = useState<"todo" | "later" | "all">("todo");

    const [detail, setDetail] = useState<MessageDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [reply, setReply] = useState("");
    const [draftSubject, setDraftSubject] = useState<string | null>(null);
    const [draftIntent, setDraftIntent] = useState<string | null>(null);
    const [drafting, setDrafting] = useState(false);
    const [draftRegister, setDraftRegister] = useState<"vouvoiement" | "tutoiement" | null>(null);
    const [sending, setSending] = useState<"draft" | "send" | null>(null);
    const autoOpenedRef = useRef(false);

    const load = useCallback(async () => {
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

            const messagesResponse = await fetch("/api/gmail/messages?limit=20", {
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
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!feedback) return;
        const timer = setTimeout(() => setFeedback(null), 5000);
        return () => clearTimeout(timer);
    }, [feedback]);

    const toReply = useMemo(() => messages.filter((message) => message.needsReply), [messages]);
    const toIgnore = useMemo(() => messages.filter((message) => !message.needsReply), [messages]);

    const visibleMessages =
        filter === "todo" ? toReply : filter === "later" ? toIgnore : messages;

    async function openMessage(uid: number) {
        setLoadingDetail(true);
        setDetail(null);
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
                body: JSON.stringify({ uid: target.uid, signature }),
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
                    ? `Proposition prête (${data.intent}, ${data.register}). Relisez, ajustez, puis validez.`
                    : `Diffusion probable (${target.reason}) : à vérifier avant d'envoyer.`
            );
        } catch {
            setFeedback("Impossible de joindre le serveur.");
        } finally {
            setDrafting(false);
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
                    to: detail.fromEmail,
                    subject: draftSubject || replySubject(detail.subject),
                    text: reply,
                    inReplyTo: detail.messageId || undefined,
                    mode,
                }),
            });
            const data = (await response.json()) as { error?: string };
            if (!response.ok) {
                setFeedback(data.error ?? "L'envoi a échoué.");
                return;
            }
            setFeedback(
                mode === "draft"
                    ? "Brouillon enregistré dans Gmail (dossier Brouillons). Il reste à relire dans Gmail puis à envoyer."
                    : `Message envoyé à ${detail.fromEmail}.`
            );
            setReply("");
            setDraftSubject(null);
            setDraftIntent(null);
            setDraftRegister(null);
            void load();
        } catch {
            setFeedback("Impossible de joindre le serveur.");
        } finally {
            setSending(null);
        }
    };

    if (loading) {
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

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60 text-[11px] text-slate-500">
                    En local, ajoutez ces deux lignes dans <code className="font-mono">.env.local</code>
                    (fichier ignoré par Git) puis relancez <code className="font-mono">npm run dev</code>.
                </div>

                <button
                    onClick={() => void load()}
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
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                    <Mail className="h-4 w-4 text-teal-600" />
                    <span className="font-bold text-slate-800">{status?.email}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-500">{total} message{total > 1 ? "s" : ""} dans la boîte</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-bold">
                        {toReply.length} à traiter
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-bold">
                        {toIgnore.length} newsletters / pubs
                    </span>
                </div>
                <button
                    onClick={() => void load()}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Rafraîchir</span>
                </button>
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
            <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-100/80 border border-slate-200/60 w-fit">
                <button
                    onClick={() => setFilter("todo")}
                    className={`px-3.5 py-1.5 rounded-xl text-[11px] font-bold transition-all ${filter === "todo" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        }`}
                >
                    À traiter ({toReply.length})
                </button>
                <button
                    onClick={() => setFilter("later")}
                    className={`px-3.5 py-1.5 rounded-xl text-[11px] font-bold transition-all ${filter === "later" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        }`}
                >
                    Newsletters & pubs ({toIgnore.length})
                </button>
                <button
                    onClick={() => setFilter("all")}
                    className={`px-3.5 py-1.5 rounded-xl text-[11px] font-bold transition-all ${filter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        }`}
                >
                    Tout ({messages.length})
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Liste */}
                <div className="lg:col-span-5 space-y-2">
                    {visibleMessages.length === 0 && !error && (
                        <p className="text-xs text-slate-500 p-4">
                            {filter === "todo"
                                ? "Aucun message ne semble nécessiter de réponse parmi les derniers emails."
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
                                <span className="text-[10px] text-slate-400 shrink-0">{formatDate(message.date)}</span>
                            </div>
                            <p className="text-[11px] font-medium text-slate-600 truncate">{message.subject}</p>
                            <div className="mt-1.5">
                                <span
                                    className={`text-[9px] px-2 py-0.5 rounded-full border font-bold ${CATEGORY_STYLE[message.category]}`}
                                >
                                    {CATEGORY_LABEL[message.category]}
                                </span>
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
                            <span>Sélectionnez un message pour le lire et y répondre.</span>
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
                                </div>
                                <p className="text-[11px] text-slate-500">
                                    De <span className="font-semibold text-slate-700">{detail.fromName}</span>
                                    {detail.fromEmail && ` <${detail.fromEmail}>`}
                                    {" · "}
                                    {formatDate(detail.date)}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1">Tri automatique : {detail.reason}</p>
                                {draftRegister && (
                                    <span className="inline-block mt-1.5 text-[9px] px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600 font-bold">
                                        {draftRegister === "tutoiement" ? "Tutoiement détecté" : "Vouvoiement détecté"}
                                    </span>
                                )}
                            </div>

                            <div className="p-4 max-h-56 overflow-y-auto text-[11px] text-slate-700 whitespace-pre-wrap leading-relaxed">
                                {detail.text}
                            </div>

                            <div className="p-4 border-t border-slate-100 space-y-3 bg-slate-50/40">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-[11px] font-bold text-slate-500">
                                        {draftIntent ? `Réponse proposée · ${draftIntent}` : "Votre réponse"}
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
                                    <button
                                        onClick={() => {
                                            setDetail(null);
                                            setReply("");
                                            setDraftSubject(null);
                                            setDraftIntent(null);
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-500 hover:text-slate-800 text-xs font-semibold"
                                    >
                                        <ArrowLeft className="h-3.5 w-3.5" />
                                        <span>Fermer</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
