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

// Le "et" commercial est construit par concaténation pour éviter toute
// confusion avec les entités HTML lors de l'édition de ce fichier.
const AMP = String.fromCharCode(38);

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

/* ------------------------------------------------------------------ */
/* Tri des messages : à traiter ou diffusion                          */
/* ------------------------------------------------------------------ */

export type GmailCategory =
    | "personnel"
    | "important"
    | "infos"
    | "newsletter"
    | "promotion";

export interface GmailClassification {
    category: GmailCategory;
    needsReply: boolean;
    reason: string;
}

/** En-têtes utiles pour reconnaître une diffusion de masse. */
const HEADERS_TO_FETCH = [
    "list-unsubscribe",
    "list-id",
    "list-post",
    "precedence",
    "auto-submitted",
    "x-mailer",
    "x-campaign",
    "x-mailchimp",
    "x-ses-outgoing",
    "x-sg-eid",
    "x-mailgun",
    "x-feedback-id",
    "x-klaviyo",
];

const PROMO_SUBJECT =
    /(newsletter|promo|promotion|soldes|black friday|cyber monday|offre|bons? plans?|\d+\s*%|-\s*\d+\s*%|dernières (heures|chances)|webinaire|webinar|vente privée|essai gratuit|désabonner|unsubscribe|digest|récapitulatif|nouveautés|lancement)/i;

/** À lire et à régler : factures, impôts, cotisations, échéances. */
const IMPORTANT_SUBJECT =
    /(facture|avis d.échéance|échéance|impôt|impots|imposition|fiscal|déclaration|taxe|tva|ruamm|cps|cotisation|amende|majoration|mise en demeure|huissier|prélèvement|paiement|payer|régler|solde dû|rappel de paiement|assurance|sinistre|convocation|remboursement)/i;

/** À lire sans réponse attendue : abonnements, réunions, confirmations. */
const INFO_SUBJECT =
    /(abonnement|renouvellement|renouvelé|expire|expiration|prend fin|fin de contrat|résiliation|réunion|compte rendu|confirmation|confirmée?|réservation|commande|livraison|expédition|embarquement|billet|invitation|planning|agenda|information)/i;

const NO_REPLY_LOCAL =
    /^(no-?reply|do-?not-?reply|ne-?pas-?repondre|nepasrepondre|notifications?|notify|alerts?|newsletter|news|infolettre|promo|promotions?|marketing|mailer|mailing|bounce|bounces|system|automated?|robot|service-?client|support)([._-].*)?$/i;

function headerValue(headers: string, name: string): string {
    const regex = new RegExp(`^${name}:\\s*(.+)$`, "im");
    const match = headers.match(regex);
    return match ? match[1].trim() : "";
}

/**
 * Classe un message sans IA : en-têtes de diffusion + forme de l'adresse + objet.
 * Quatre familles : à traiter (réponse), important (à régler), infos (à lire),
 * newsletters/pubs (à ignorer).
 */
export function classifyMessage(
    fromEmail: string,
    subject: string,
    headers: string
): GmailClassification {
    const hasListHeaders =
        Boolean(headerValue(headers, "list-unsubscribe")) ||
        Boolean(headerValue(headers, "list-id")) ||
        Boolean(headerValue(headers, "list-post"));

    const precedence = headerValue(headers, "precedence").toLowerCase();
    const isBulk = ["bulk", "list", "junk"].includes(precedence);
    const isAuto = /auto-(generated|replied|notified)/i.test(
        headerValue(headers, "auto-submitted")
    );

    const marketingHeaderNames = [
        "x-campaign",
        "x-mailchimp",
        "x-ses-outgoing",
        "x-sg-eid",
        "x-mailgun",
        "x-feedback-id",
        "x-klaviyo",
    ];
    const isMarketing = marketingHeaderNames.some((name) => Boolean(headerValue(headers, name)));

    const localPart = (fromEmail.split("@")[0] ?? "").toLowerCase();
    const looksAutomated = NO_REPLY_LOCAL.test(localPart);
    const promoSubject = PROMO_SUBJECT.test(subject);
    const hasSeveralRecipients = /,/.test(headerValue(headers, "to"));
    const isQuestion =
        subject.includes("?") ||
        /^(question|demande|renseignements?|peux-tu|pouvez-vous|pourriez-vous|merci de|besoin de|confirmer|valider)\b/i.test(
            subject.trim()
        );

    // 1. Diffusion de masse : jamais de réponse attendue.
    if (hasListHeaders || isMarketing || isBulk) {
        if (promoSubject) {
            return {
                category: "promotion",
                needsReply: false,
                reason: "En-tête de diffusion + objet promotionnel",
            };
        }
        return {
            category: "newsletter",
            needsReply: false,
            reason: "En-tête de liste de diffusion (List-Unsubscribe / List-ID)",
        };
    }

    if (promoSubject && (looksAutomated || isAuto)) {
        return {
            category: "promotion",
            needsReply: false,
            reason: "Expéditeur automatique + objet promotionnel",
        };
    }

    // 2. Une vraie question posée par une personne : réponse attendue.
    if (isQuestion && !looksAutomated && !isAuto) {
        return {
            category: "personnel",
            needsReply: true,
            reason: "Question posée directement, réponse attendue",
        };
    }

    // 3. À lire et à régler (argent, échéance, administration).
    if (IMPORTANT_SUBJECT.test(subject)) {
        return {
            category: "important",
            needsReply: false,
            reason: "Échéance ou montant à traiter (action requise, sans réponse)",
        };
    }

    // 4. À lire sans réponse : abonnements, réunions, confirmations.
    if (INFO_SUBJECT.test(subject)) {
        return {
            category: "infos",
            needsReply: false,
            reason: "Information à lire (aucune réponse attendue)",
        };
    }

    // 5. Notifications techniques.
    if (looksAutomated || isAuto) {
        return {
            category: "infos",
            needsReply: false,
            reason: "Notification automatique (aucune réponse attendue)",
        };
    }

    if (promoSubject && hasSeveralRecipients) {
        return {
            category: "promotion",
            needsReply: false,
            reason: "Objet promotionnel envoyé à plusieurs destinataires",
        };
    }

    if (hasSeveralRecipients) {
        return {
            category: "infos",
            needsReply: false,
            reason: "Message envoyé à plusieurs destinataires",
        };
    }

    return {
        category: "personnel",
        needsReply: true,
        reason: "Message direct d'un expéditeur identifié",
    };
}

/* ------------------------------------------------------------------ */
/* Lecture de la boîte                                                */
/* ------------------------------------------------------------------ */

export interface GmailMessageSummary extends GmailClassification {
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

function toSummary(
    message: FetchMessageObject,
    headers = message.headers ? message.headers.toString("utf8") : ""
): GmailMessageSummary {
    const envelope = message.envelope;
    const from = envelope?.from?.[0];
    const internalDate = (message as FetchMessageObject & { internalDate?: Date }).internalDate;
    const rawDate = internalDate ?? envelope?.date;
    const date = rawDate instanceof Date ? rawDate : new Date(rawDate ?? Date.now());
    const subject = envelope?.subject?.trim() || "(sans objet)";
    const fromEmail = from?.address ?? "";
    const classification = classifyMessage(fromEmail, subject, headers);
    return {
        uid: message.uid,
        subject,
        fromName: from?.name?.trim() || fromEmail || "Expéditeur inconnu",
        fromEmail,
        date: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
        seen: message.flags ? message.flags.has("\\Seen") : false,
        ...classification,
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

function decodeEntities(text: string): string {
    const entities: Array<[string, string]> = [
        [AMP + "nbsp;", " "],
        [AMP + "amp;", AMP],
        [AMP + "lt;", "<"],
        [AMP + "gt;", ">"],
        [AMP + "quot;", '"'],
        [AMP + "#39;", "'"],
    ];
    let result = text;
    for (const [entity, value] of entities) {
        result = result.split(entity).join(value);
        result = result.split(entity.toUpperCase()).join(value);
    }
    return result;
}

function htmlToText(html: string): string {
    return decodeEntities(
        html
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
            .replace(/<[^>]+>/g, " ")
    )
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
            headers: HEADERS_TO_FETCH,
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
            {
                envelope: true,
                internalDate: true,
                flags: true,
                bodyStructure: true,
                headers: HEADERS_TO_FETCH,
            },
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
            ...toSummary(message, message.headers?.toString("utf8") ?? ""),
            to: addressList(envelope?.to),
            cc: addressList(envelope?.cc),
            text: text.trim() || "(Ce message n'a pas de contenu texte lisible.)",
            messageId: envelope?.messageId ?? "",
            inReplyTo: envelope?.inReplyTo ?? "",
        };
    });
}

/* ------------------------------------------------------------------ */
/* Brouillon de réponse proposé, à valider avant envoi                */
/* ------------------------------------------------------------------ */

export type Register = "vouvoiement" | "tutoiement";

export interface ReplyDraft {
    to: string;
    subject: string;
    body: string;
    intent: string;
    register: Register;
    needsReply: boolean;
}

interface ReplyContext {
    fromName: string;
    fromEmail: string;
    subject: string;
    text: string;
    needsReply: boolean;
}

/** Détecte si l'expéditeur vouvoie ou tutoie, pour répondre sur le même registre. */
export function detectRegister(text: string): Register {
    const sample = text.slice(0, 8000).toLowerCase();

    const count = (pattern: RegExp) => (sample.match(pattern) ?? []).length;

    const vousSignals =
        count(/\b(vous|votre|vos|vôtre|madame|monsieur)\b/g) +
        count(/\b(avez|pouvez|voulez|souhaitez|seriez|pourriez|confirmez|validez|envoyez|merci de bien vouloir)\b/g);

    const tuSignals =
        count(/\b(tu|toi|ton|ta|tes|tien|tienne)\b/g) +
        count(/\b(peux|veux|as|es|serais|pourrais|souhaites|penses|sais|fais|dis|vas|viens|prends|envoies|confirmes|valides)\b/g);

    if (tuSignals === 0 && vousSignals === 0) return "vouvoiement";
    return tuSignals > vousSignals ? "tutoiement" : "vouvoiement";
}

function firstNameOf(fromName: string): string {
    const candidate = fromName.split(/[\s,<]/)[0]?.trim() ?? "";
    return /^[\p{L}][\p{L}'-]{1,}$/u.test(candidate) ? candidate : "";
}

type Phrase = { vous: string; tu: string };

const CORES: Record<string, Phrase> = {
    facturation: {
        vous: "Merci pour votre message. Je prends bonne note des éléments concernant la facturation et je reviens vers vous rapidement avec les pièces demandées.",
        tu: "Merci pour ton message. Je note les éléments concernant la facturation et je te reviens rapidement avec les pièces demandées.",
    },
    rendez_vous: {
        vous: "Merci pour votre proposition. Je vérifie mes disponibilités et je vous confirme un créneau dans les meilleurs délais.",
        tu: "Merci pour ta proposition. Je vérifie mes disponibilités et je te confirme un créneau rapidement.",
    },
    devis: {
        vous: "Merci pour votre message. Je prends connaissance de votre demande et je vous adresse une réponse détaillée très prochainement.",
        tu: "Merci pour ton message. Je prends connaissance de ta demande et je te fais une réponse détaillée très vite.",
    },
    relance: {
        vous: "Merci pour votre relance. Je traite ce point en priorité et je vous tiens informé dès que la situation est régularisée.",
        tu: "Merci pour ta relance. Je traite ce point en priorité et je te tiens au courant dès que c'est régularisé.",
    },
    litige: {
        vous: "Merci pour votre message. J'ai bien pris connaissance de votre réclamation et je vous réponds de manière détaillée après vérification des éléments.",
        tu: "Merci pour ton message. J'ai bien noté ta réclamation et je te réponds précisément après vérification des éléments.",
    },
    information: {
        vous: "Merci pour votre message. Je reviens vers vous avec une réponse complète dès que possible.",
        tu: "Merci pour ton message. Je te reviens avec une réponse complète dès que possible.",
    },
    accuse: {
        vous: "Merci pour votre message, que j'ai bien reçu. Je reviens vers vous rapidement avec une réponse complète.",
        tu: "Merci pour ton message, bien reçu. Je te reviens rapidement avec une réponse complète.",
    },
};

const CLOSINGS: Phrase = {
    vous: "N'hésitez pas à me préciser si un élément complémentaire vous est utile.",
    tu: "N'hésite pas à me dire si un élément complémentaire te serait utile.",
};

/**
 * Rédige une proposition de réponse à partir du sujet et du contenu,
 * en respectant le registre (vouvoiement ou tutoiement) de l'expéditeur.
 * Le texte n'est jamais envoyé : il est relu et validé dans l'interface.
 */
export function buildReplyDraft(context: ReplyContext, signature = ""): ReplyDraft {
    const haystack = `${context.subject}\n${context.text}`.slice(0, 6000).toLowerCase();
    const name = firstNameOf(context.fromName);
    const register = detectRegister(context.text || context.subject);

    let intent = "accusé de réception";
    let key: keyof typeof CORES = "accuse";

    if (/(facture|invoice|paiement|remboursement|prélèvement|virement|justificatif)/.test(haystack)) {
        intent = "facturation";
        key = "facturation";
    } else if (/(rendez-vous|rdv|disponibilit|créneau|horaire|planifier|réunion|agenda)/.test(haystack)) {
        intent = "prise de rendez-vous";
        key = "rendez_vous";
    } else if (/(devis|estimation|tarif|prix|proposition commerciale)/.test(haystack)) {
        intent = "devis";
        key = "devis";
    } else if (/(relance|retard|impayé|échéance|rappel|en attente)/.test(haystack)) {
        intent = "relance";
        key = "relance";
    } else if (/(litige|réclamation|contestation|sinistre|mise en demeure|préjudice)/.test(haystack)) {
        intent = "litige";
        key = "litige";
    } else if (/(\?|pourriez-vous|pouvez-vous|peux-tu|merci de (me|nous)|confirmer|valider)/.test(haystack)) {
        intent = "demande d'information";
        key = "information";
    }

    const phrase = CORES[key];
    const variant: keyof Phrase = register === "tutoiement" ? "tu" : "vous";
    const signatureText = signature.trim() || "Bien cordialement,";
    const body = [
        name ? `Bonjour ${name},` : "Bonjour,",
        "",
        phrase[variant],
        "",
        CLOSINGS[variant],
        "",
        signatureText,
    ].join("\n");

    return {
        to: context.fromEmail,
        subject: /^re\s*:/i.test(context.subject) ? context.subject : `Re: ${context.subject}`,
        body,
        intent,
        register,
        needsReply: context.needsReply,
    };
}

/* ------------------------------------------------------------------ */
/* Envoi et brouillons                                                */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Statut de la connexion                                             */
/* ------------------------------------------------------------------ */

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
