"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    KeyRound,
    Loader2,
    Mail,
    RefreshCw,
    Save,
    Send,
} from "lucide-react";

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
}

interface MessageDetail extends InboxMessage {
    to: string;
    cc: string;
    text: string;
    messageId: string;
    inReplyTo: string;
}

function formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function replySubject(subject: string): string {
    return /^re\s*:/i.test(subject) ? subject : `Re: ${subject}`;
}

export const GmailInbox: React.FC = () => {
    const [status, setStatus] = useState<GmailStatus | null>(null);
    const [messages, setMessages] = useState<InboxMessage[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);

    const [detail, setDetail] = useState<MessageDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [reply, setReply] = useState("");
    const [sending, setSending] = useState<"draft" | "send" | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const statusResponse = await fetch("/api/gmail/status", { cache: "no-store" });
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

            const messagesResponse = await fetch("/api/gmail/messages?limit=15", {
                cache: "no-store",
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
            setMessages(messagesData.messages ?? []);
            setTotal(messagesData.total ?? 0);
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
        const timer = setTimeout(() => setFeedback(null), 4000);
        return () => clearTimeout(timer);
    }, [feedback]);

    const openMessage = async (uid: number) => {
        setLoadingDetail(true);
        setDetail(null);
        setReply("");
        try {
            const response = await fetch(`/api/gmail/message?uid=${uid}`, { cache: "no-store" });
            const data = (await response.json()) as MessageDetail & { error?: string };
            if (!response.ok) {
                setError(data.error ?? "Impossible d'ouvrir ce message.");
                return;
            }
            setDetail(data);
            setReply("");
        } catch {
            setError("Impossible de charger le message.");
        } finally {
            setLoadingDetail(false);
        }
    };

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
                body: JSON.stringify({
                    to: detail.fromEmail,
                    subject: replySubject(detail.subject),
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
                    ? "Brouillon enregistré dans Gmail (dossier Brouillons)."
                    : `Message envoyé à ${detail.fromEmail}.`
            );
            setReply("");
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
                        Toujours dans Sécurité, ouvrez <span className="font-semibold">Mots de passe des applications</span>
                        {" "}et générez-en un pour « Assistant perso » (16 caractères).
                    </li>
                    <li>
                        Sur Vercel : <span className="font-semibold">Settings → Environment Variables</span>, ajoutez
                        <code className="mx-1 px-1.5 py-0.5 rounded bg-slate-100 font-mono">GMAIL_USER</code> (votre adresse Gmail)
                        et
                        <code className="mx-1 px-1.5 py-0.5 rounded bg-slate-100 font-mono">GMAIL_APP_PASSWORD</code>
                        (les 16 caractères, espaces compris ou non), pour <span className="font-semibold">Production</span>.
                    </li>
                    <li>
                        <span className="font-semibold">Deployments → … → Redeploy</span> (décocher le cache de build),
                        puis rechargez cette page.
                    </li>
                </ol>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60 text-[11px] text-slate-500">
                    En local, ajoutez simplement ces deux lignes dans <code className="font-mono">.env.local</code>
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
                <div className="flex items-center gap-2.5 text-xs">
                    <Mail className="h-4 w-4 text-teal-600" />
                    <span className="font-bold text-slate-800">{status?.email}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-500">{total} message{total > 1 ? "s" : ""} dans la boîte</span>
                    {status?.imap === "ok" && status?.smtp === "ok" && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                            IMAP + SMTP OK
                        </span>
                    )}
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

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Liste */}
                <div className="lg:col-span-5 space-y-2">
                    {messages.length === 0 && !error && (
                        <p className="text-xs text-slate-500 p-4">Aucun message dans la boîte de réception.</p>
                    )}
                    {messages.map((message) => (
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
                                <p className="text-sm font-extrabold text-slate-900 mb-1">{detail.subject}</p>
                                <p className="text-[11px] text-slate-500">
                                    De <span className="font-semibold text-slate-700">{detail.fromName}</span>
                                    {detail.fromEmail && ` <${detail.fromEmail}>`}
                                    {" · "}
                                    {formatDate(detail.date)}
                                </p>
                            </div>

                            <div className="p-4 max-h-64 overflow-y-auto text-[11px] text-slate-700 whitespace-pre-wrap leading-relaxed">
                                {detail.text}
                            </div>

                            <div className="p-4 border-t border-slate-100 space-y-3 bg-slate-50/40">
                                <textarea
                                    value={reply}
                                    onChange={(event) => setReply(event.target.value)}
                                    rows={5}
                                    placeholder={`Répondre à ${detail.fromName}…`}
                                    className="w-full bg-white border border-slate-200 rounded-2xl p-3 text-xs text-slate-800 focus:outline-none focus:border-teal-500 resize-y"
                                />
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
