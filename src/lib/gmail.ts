import { ImapFlow } from "imapflow";
import type { FetchMessageObject, MessageStructureObject } from "imapflow";
import nodemailer from "nodemailer";
import type { Readable } from "node:stream";

/**
 * Connexion Gmail personnelle via IMAP / SMTP et un mot de passe d'application.
 *
 * Variables d'environnement attendues (Vercel + .env.local) :
 *   GMAIL_USER          : votre adresse Gmail complète
 *   GMAIL_APP_PASSWORD  : mot de passe d'application Google (16 caractères)
 *
 * Aucune de ces valeurs n'est jamais exposée au navigateur : tout passe par
 * les routes /api/gmail/*, elles-mêmes protégées par le middleware Basic Auth.
 */

const GMAIL_USER = (process.env.GMAIL_USER ?? "").trim();
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s+/g, "");

const IMAP_HOST = "imap.gmail.com";
const SMTP_HOST = "smtp.gmail.com";
const MAX_BODY_BYTES = 400_000;
const MAX_TEXT_LENGTH = 20_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isGmailConfigured(): boolean {
    return Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);
}

export function gmailAccountEmail(): string | null {
    return GMAIL_USER || null;
}

/** Traduit les erreurs techniques Gmail en message compréhensible. */
export function describeGmailError(error: unknown): string {
    if (!isGmailConfigured()) {
        return "Gmail n'est pas configuré : ajoutez GMAIL_USER et GMAIL_APP_PASSWORD dans les variables d'environnement.";
    }
    const raw = error instanceof Error ? error.message : String(error);
    if (/EAUTH|Invalid login|535|Username and Password not accepted/i.test(raw)) {
        return "Mot de passe refusé par Gmail. Vérifiez GMAIL_USER et GMAIL_APP_PASSWORD (mot de passe d'application de 16 caractères, double authentification activée).";
    }
    if (/ENOTFOUND|ETIMEDOUT|ECONNECTION|ECONNRESET|EAI_AGAIN|socket/i.test(raw)) {
        return "Connexion aux serveurs Gmail impossible (réseau instable ou blocage du port IMAP/SMTP).";
    }
    return raw.slice(0, 300) || "Erreur inconnue lors du contact avec Gmail.";
}

function createImapClient(): ImapFlow {
    return new ImapFlow({
        host: IMAP_HOST,
        port: 993,
        secure: true,
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
        logger: false,
    });
}

function createSmtpTransport() {
    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: 465,
        secure: true,
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
}

/** Ouvre INBOX en lecture seule, exécute `fn`, puis referme proprement. */
async function withInbox<T>(
    fn: (client: ImapFlow, exists: number) => Promise<T>
): Promise<T> {
    const client = createImapClient();
    // Une erreur réseau tardive ne doit pas faire tomber la fonction serverless.
    client.on("error", () => undefined);
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
        const mailbox = client.mailbox;
        const exists = mailbox && typeof mailbox === "object" ? mailbox.exists : 0;
        return await fn(client, exists);
    } finally {
        lock.release();
        await client.logout().catch(() => undefined);
    }
}

export interface GmailMessageSummary {
    uid: number;
    subject: string;
    fromName: string;
    fromEmail: string;
    date: string;
    seen: boolean;
}

export interface GmailMessageDetail extends GmailMessageSummary {
    to: string;
    cc: string;
    text: string;
    messageId: string;
    inReplyTo: string;
}

function addressList(list?: { name?: string; address?: string }[]): string {
    if (!list?.length) return "";
    return list
        .map((entry) => entry.address || "")
        .filter(Boolean)
        .join(", ");
}

function toSummary(message: FetchMessageObject): GmailMessageSummary {
    const envelope = message.envelope;
    const from = envelope?.from?.[0];
    const internalDate = (message as FetchMessageObject & { internalDate?: Date }).internalDate;
    const rawDate = internalDate ?? envelope?.date;
    const date = rawDate instanceof Date ? rawDate : new Date(rawDate ?? Date.now());
    return {
        uid: message.uid,
        subject: envelope?.subject?.trim() || "(sans objet)",
        fromName: from?.name?.trim() || from?.address || "Expéditeur inconnu",
        fromEmail: from?.address ?? "",
        date: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
        seen: message.flags ? message.flags.has("\\Seen") : false,
    };
}

/** Cherche récursivement la première partie texte d'un message. */
function findPart(
    structure: MessageStructureObject | undefined,
    type: "text/plain" | "text/html"
): MessageStructureObject | null {
    if (!structure) return null;

    const candidates = structure.childNodes?.length ? structure.childNodes : [structure];
    const walk = (nodes: MessageStructureObject[]): MessageStructureObject | null => {
        for (const node of nodes) {
            const isAttachment =
                typeof node.disposition === "string" &&
                node.disposition.toLowerCase().includes("attachment");
            if (node.type === type && !isAttachment && node.part) return node;
            if (node.childNodes?.length) {
                const found = walk(node.childNodes);
                if (found) return found;
            }
        }
        return null;
    };

    return walk(candidates);
}

/** Lit un flux IMAP en limitant la taille pour protéger la fonction serverless. */
async function readLimited(stream: Readable, maxBytes: number): Promise<string> {
    const chunks: Buffer[] = [];
    let size = 0;
    try {
        for await (const chunk of stream as AsyncIterable<Buffer | string>) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            const remaining = maxBytes - size;
            if (remaining <= 0) break;
            chunks.push(buffer.subarray(0, remaining));
            size += Math.min(buffer.length, remaining);
            if (size >= maxBytes) break;
        }
    } finally {
        stream.destroy();
    }
    return Buffer.concat(chunks).toString("utf8");
}

function htmlToText(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&/gi, "&")
        .replace(/</gi, "<")
        .replace(/>/gi, ">")
        .replace(/"/gi, '"')
        .replace(/'/gi, "'")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export async function listInbox(
    limit = 12
): Promise<{ messages: GmailMessageSummary[]; total: number }> {
    if (!isGmailConfigured()) {
        throw new Error("Gmail n'est pas configuré.");
    }

    return withInbox(async (client, exists) => {
        if (exists === 0) return { messages: [], total: 0 };

        const start = Math.max(1, exists - limit + 1);
        const messages: GmailMessageSummary[] = [];
        for await (const message of client.fetch(`${start}:*`, {
            envelope: true,
            internalDate: true,
            flags: true,
        })) {
            messages.push(toSummary(message));
        }
        messages.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        return { messages, total: exists };
    });
}

export async function getMessage(uid: number): Promise<GmailMessageDetail> {
    if (!isGmailConfigured()) {
        throw new Error("Gmail n'est pas configuré.");
    }
    if (!Number.isInteger(uid) || uid <= 0) {
        throw new Error("Identifiant de message invalide.");
    }

    return withInbox(async (client) => {
        const message = await client.fetchOne(
            String(uid),
            { envelope: true, internalDate: true, flags: true, bodyStructure: true },
            { uid: true }
        );
        if (!message) {
            throw new Error("Message introuvable dans la boîte de réception.");
        }

        const envelope = message.envelope;
        const part =
            findPart(message.bodyStructure, "text/plain") ??
            findPart(message.bodyStructure, "text/html");

        let text = "";
        if (part?.part) {
            const download = await client.download(String(uid), part.part, { uid: true });
            if (download && download.content) {
                text = await readLimited(download.content, MAX_BODY_BYTES);
                if (part.type === "text/html") text = htmlToText(text);
            }
        }

        return {
            ...toSummary(message),
            to: addressList(envelope?.to),
            cc: addressList(envelope?.cc),
            text: text.trim() || "(Ce message n'a pas de contenu texte lisible.)",
            messageId: envelope?.messageId ?? "",
            inReplyTo: envelope?.inReplyTo ?? "",
        };
    });
}

export interface SendEmailInput {
    to: string;
    subject: string;
    text: string;
    inReplyTo?: string;
    mode?: "draft" | "send";
}

async function buildRawMessage(mail: {
    from: string;
    to: string;
    subject: string;
    text: string;
    inReplyTo?: string;
}): Promise<Buffer> {
    const options = {
        streamTransport: true,
        buffer: true,
        newline: "unix",
    } as Parameters<typeof nodemailer.createTransport>[0];
    const builder = nodemailer.createTransport(options);
    const info = await builder.sendMail(mail);
    const raw = (info as { message?: Buffer | string }).message;
    if (!raw) throw new Error("Impossible de construire le message à enregistrer.");
    return Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
}

export async function sendEmail(input: SendEmailInput) {
    if (!isGmailConfigured()) {
        throw new Error("Gmail n'est pas configuré.");
    }

    const to = (input.to ?? "").trim();
    const subject = (input.subject ?? "").trim() || "(sans objet)";
    const text = (input.text ?? "").trim();

    if (!EMAIL_RE.test(to)) throw new Error("Adresse du destinataire invalide.");
    if (!text) throw new Error("Le message est vide.");
    if (text.length > MAX_TEXT_LENGTH) {
        throw new Error(`Message trop long (${MAX_TEXT_LENGTH} caractères maximum).`);
    }

    const mode = input.mode === "draft" ? "draft" : "send";
    const mail = {
        from: GMAIL_USER,
        to,
        subject: subject.slice(0, 250),
        text,
        inReplyTo: input.inReplyTo || undefined,
    };

    if (mode === "draft") {
        const raw = await buildRawMessage(mail);
        const client = createImapClient();
        client.on("error", () => undefined);
        await client.connect();
        try {
            const result = await client.append("[Gmail]/Drafts", raw, ["\\Draft"]);
            return {
                mode,
                subject: mail.subject,
                to,
                draftUid: result ? result.uid : null,
            };
        } finally {
            await client.logout().catch(() => undefined);
        }
    }

    const transporter = createSmtpTransport();
    try {
        const info = await transporter.sendMail(mail);
        return {
            mode,
            subject: mail.subject,
            to,
            messageId: info.messageId ?? null,
            accepted: Array.isArray(info.accepted) ? info.accepted : [],
        };
    } finally {
        transporter.close();
    }
}

export interface GmailStatus {
    configured: boolean;
    email: string | null;
    inboxCount: number | null;
    imap: "ok" | "error" | "unconfigured";
    smtp: "ok" | "error" | "unconfigured";
    error?: string;
}

export async function checkGmailStatus(): Promise<GmailStatus> {
    if (!isGmailConfigured()) {
        return {
            configured: false,
            email: null,
            inboxCount: null,
            imap: "unconfigured",
            smtp: "unconfigured",
        };
    }

    let inboxCount: number | null = null;
    let imap: "ok" | "error" = "ok";
    let error: string | undefined;

    try {
        inboxCount = await withInbox(async (_client, exists) => exists);
    } catch (e) {
        imap = "error";
        error = describeGmailError(e);
    }

    let smtp: "ok" | "error" = "ok";
    try {
        const transporter = createSmtpTransport();
        await transporter.verify();
        transporter.close();
    } catch (e) {
        smtp = "error";
        error = error ?? describeGmailError(e);
    }

    return {
        configured: true,
        email: GMAIL_USER,
        inboxCount,
        imap,
        smtp,
        error,
    };
}
