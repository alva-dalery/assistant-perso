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
    | "factures"
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

/** Factures et paiements à régler. */
const FACTURE_SUBJECT =
    /(facture|avis d.échéance|échéance|prélèvement|paiement|payer|régler|solde dû|rappel de paiement|remboursement|quittance)/i;

/** Administratif important : impôts, cotisations, assurances, convocations. */
const IMPORTANT_SUBJECT =
    /(impôt|impots|imposition|fiscal|déclaration|taxe|tva|ruamm|cps|cotisation|amende|majoration|mise en demeure|huissier|assurance|sinistre|convocation)/i;

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

    // 3. Factures et paiements.
    if (FACTURE_SUBJECT.test(subject)) {
        return {
            category: "factures",
            needsReply: false,
            reason: "Facture ou paiement à régler (aucune réponse attendue)",
        };
    }

    // 4. Administratif important (impôts, cotisations, assurances…).
    if (IMPORTANT_SUBJECT.test(subject)) {
        return {
            category: "important",
            needsReply: false,
            reason: "Démarche administrative importante (aucune réponse attendue)",
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
    answered: boolean;
}

export interface GmailMessageDetail extends GmailMessageSummary {
    to: string;
    cc: string;
    text: string;
    /** Résumé court de l'email courant (hors historique cité). */
    summary: string;
    /** Texte du dernier message uniquement. */
    currentText: string;
    /** Échanges précédents cités dans le corps du message. */
    historyText: string;
    /** Nombre de messages dans le fil (1 = premier message). */
    exchanges: number;
    /** Noms des pièces jointes détectées. */
    attachments: string[];
    /** Noms des images du corps (signatures, logos). */
    inlineImages: string[];
    /** Pièces jointes avec leur numéro de partie IMAP (téléchargement). */
    attachmentParts: GmailPartInfo[];
    /** Images affichables (inline ou jointes). */
    images: GmailPartInfo[];
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

const THREAD_MARKERS: RegExp[] = [
    /^-{2,}\s*(message d'origine|original message)\s*-{2,}$/gim,
    /^_{8,}$/gm,
    /^on .+ a écrit\s*:$/gim,
    /^le .+ a écrit\s*:$/gim,
    /^from:\s*.+$/gim,
];

/** Sépare le dernier message de l'historique cité. */
export function splitThread(text: string): {
    currentText: string;
    historyText: string;
    exchanges: number;
} {
    let cutIndex = text.length;
    for (const marker of THREAD_MARKERS) {
        marker.lastIndex = 0;
        const match = marker.exec(text);
        if (match && match.index >= 0 && match.index < cutIndex) {
            cutIndex = match.index;
        }
    }

    const currentText = text.slice(0, cutIndex).trim() || text.trim();
    const historyText = text.slice(cutIndex).trim();
    const quotedBlocks = historyText
        ? (historyText.match(/a écrit\s*:|wrote\s*:|from:\s/gim) ?? []).length
        : 0;
    const exchanges = historyText ? Math.max(2, quotedBlocks + 1) : 1;

    return { currentText, historyText, exchanges };
}

function cleanForSummary(text: string): string {
    return text
        .split("\n")
        .filter((line) => {
            const value = line.trim();
            if (!value) return false;
            if (value.startsWith(">")) return false;
            if (/^(de|from|envoyé|sent|à|to|objet|subject|cc)\s*:/i.test(value)) return false;
            if (/^(unsubscribe|désabonner|se désabonner)/i.test(value)) return false;
            if (/^(--|__|_{3,})/.test(value)) return false;
            if (/^(sent from|envoyé de mon)/i.test(value)) return false;
            return true;
        })
        .join("\n")
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

/**
 * Résumé extractif : garde les phrases les plus informatives du message courant
 * (demande, montant, échéance…), sans recopier l'email entier ni l'historique.
 */
const DOCUMENT_WORDS: Array<[RegExp, string]> = [
    [/formulaire/i, "formulaire"],
    [/facture/i, "facture"],
    [/devis/i, "devis"],
    [/contrat/i, "contrat"],
    [/attestation/i, "attestation"],
    [/justificatif/i, "justificatif"],
    [/re[çc]u/i, "reçu"],
    [/ordonnance/i, "ordonnance"],
    [/convocation/i, "convocation"],
    [/relev[ée]/i, "relevé"],
    [/certificat/i, "certificat"],
    [/bulletin/i, "bulletin"],
    [/dossier/i, "dossier"],
];

const POLITENESS =
    /^(bonjour|salut|madame|monsieur|cordialement|bien cordialement|bien à vous|nous restons|je reste|n'hésitez pas|merci d'avance|merci pour votre retour|bonne journée|belle journée|cdt)/i;

/** Formules creuses qui ne disent rien du contenu du message. */
const FLUFF =
    /(souhait\w* (une|de) (agr[ée]able|bonne) (lecture|journ[ée]e)|nous vous en souhaitons|restons [àa] (votre )?disposition|restons disponibles|merci (de|pour) votre confiance|merci pour votre fid[ée]lit[ée]|bonne lecture|excellente journ[ée]e|belle journ[ée]e|[àa] tr[èe]s bient[ôo]t|nous vous remercions|nous sommes ravis|au plaisir de vous lire|bienvenue chez|toute l'[ée]quipe vous)/i;

const INFO_KEYWORDS =
    /(nouveau|nouvelle|nouveaux|changement|augmentation|baisse|hausse|taux|tarif|mise [àa] jour|[àa] partir du|d[ée]sormais|obligatoire|rappel|annonce|information|important|attention|fermeture|[ée]ch[ée]ance|date limite|renouvellement|contr[ôo]le|entretien|travaux|coupure)/i;

function articleFor(word: string): string {
    if (/^(attestation|ordonnance|convocation)/.test(word)) return "de l'";
    if (/^(facture)/.test(word)) return "de la ";
    return "du ";
}

function qualifierOf(text: string): string {
    const flat = text.toLowerCase();
    if (/(complété|complete|rempli|renseigné)/.test(flat)) return " complété";
    if (/(signé)/.test(flat)) return " signé";
    if (/(corrigé|rectifi)/.test(flat)) return " corrigé";
    return "";
}

function amountOf(text: string): string | null {
    const match = text.match(/(\d[\d\s.,]*)\s*(€|euros?|xfp|cfp)/i);
    return match ? `${match[1].trim()} ${match[2]}` : null;
}

/**
 * Synthèse courte de l'email : on décrit l'action et l'objet du message
 * (« Envoi du formulaire de résiliation complété. ») au lieu de recopier
 * le début du texte. Purement déterministe, sans modèle de langage.
 */
export function summarizeMessage(text: string, subject: string): string {
    const cleaned = cleanForSummary(text);
    const flat = cleaned.toLowerCase();

    if (!cleaned) return subject ? `Objet : ${subject}` : "Message sans contenu texte.";

    const isEnvoi =
        /(ci-joint|ci joint|pièce jointe|pièces jointes|vous trouverez|veuillez trouver|je vous (envoie|transmets)|nous vous (envoyons|transmettons)|envoi de)/.test(
            flat
        );
    const document = DOCUMENT_WORDS.find(([regex]) => regex.test(flat));

    // Une vraie information (taux, date, montant) prime sur le simple envoi
    // d'une pièce jointe : c'est elle qui intéresse le lecteur.
    const hasMajorInfo = INFO_KEYWORDS.test(flat) && /\d/.test(cleaned);

    // Absence / indisponibilité : « Absente jusqu'au 17/11. »
    if (/(absent|absente|indisponible|en cong[ée]|en d[ée]placement)/.test(flat)) {
        const until =
            cleaned.match(/jusqu['’]au\s+([0-9]{1,2}[\/.][0-9]{1,2}(?:[\/.][0-9]{2,4})?)/i) ||
            cleaned.match(/jusqu['’]au\s+([0-9]{1,2}\s+[a-zéûôà]+(?:\s+\d{4})?)/i);
        const label = /indisponible/.test(flat)
            ? "Indisponible"
            : /absente/.test(flat)
              ? "Absente"
              : "Absent";
        if (until) return `${label} jusqu'au ${until[1]}.`;
        return `${label} temporairement.`;
    }

    // 1. Envoi d'un document (le cas le plus fréquent).
    if (isEnvoi && document && !hasMajorInfo) {
        const word = document[1];
        let phrase = `Envoi ${articleFor(word)}${word}`;
        if (word === "formulaire" && /résiliation|resiliation/.test(flat)) {
            phrase += " de résiliation";
        }
        if (word === "justificatif" && /domicile/.test(flat)) {
            phrase += " de domicile";
        }
        if (word === "facture") {
            const amount = amountOf(cleaned);
            if (amount) phrase += ` de ${amount}`;
        }
        phrase += qualifierOf(cleaned);
        return `${phrase}.`;
    }

    // 2. Paiement / échéance.
    if (/(à payer|a payer|régler|regler|prélèvement|prelevement|échéance|echeance|impayé)/.test(flat)) {
        const amount = amountOf(cleaned);
        const deadline = cleaned.match(/avant le ([^.,;\n]+)/i);
        return `Paiement à effectuer${amount ? ` : ${amount}` : ""}${
            deadline ? ` avant le ${deadline[1].trim()}` : ""
        }.`;
    }

    // 3. Rendez-vous / réunion.
    if (/(rendez-vous|réunion|reunion|convocation)/.test(flat)) {
        const when = cleaned.match(
            /((?:le|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)[^.\n]{0,40})/i
        );
        return `Rendez-vous${when ? ` : ${when[1].trim()}` : " à confirmer"}.`;
    }

    // 4. Abonnement / contrat.
    if (/(abonnement|renouvellement|expire|prend fin|résiliation|resiliation|fin de contrat)/.test(flat)) {
        if (/(renouvel|prélèvement|prelevement)/.test(flat)) return "Renouvellement d'abonnement à venir.";
        return "Information sur un abonnement ou un contrat.";
    }

    // 5. Demande / question.
    if (/\?/.test(cleaned) || /(pouvez-vous|pourriez-vous|peux-tu|merci de me|besoin d)/.test(flat)) {
        const ask = cleaned
            .split(/(?<=[.!?])\s+|\n+/)
            .map((sentence) => sentence.replace(/\s+/g, " ").trim())
            .filter((sentence) => sentence.length >= 12 && !POLITENESS.test(sentence))
            .find(
                (sentence) =>
                    /\?/.test(sentence) ||
                    /(pouvez-vous|pourriez-vous|peux-tu|merci de me|besoin d)/i.test(sentence)
            );
        if (ask) return `Demande : ${ask.replace(/\s+/g, " ").slice(0, 180)}`;
    }

    // 6. Repli : phrase la plus porteuse d'information (jamais le début brut).
    const sentences = cleaned
        .split(/(?<=[.!?])\s+|\n+/)
        .map((sentence) => sentence.replace(/\s+/g, " ").trim())
        .filter((sentence) => sentence.length >= 25 && !POLITENESS.test(sentence));

    if (sentences.length === 0) return subject ? `Objet : ${subject}` : "Message court sans demande identifiable.";

    const action =
        /(demande|merci de|pouvez-vous|pourriez-vous|peux-tu|besoin|facture|devis|rendez-vous|réunion|échéance|paiement|payer|justificatif|problème|urgent|confirmer|valider|remboursement)/i;

    // Écarter les formules de politesse et les phrases purement décoratives.
    const useful = sentences.filter((sentence) => !FLUFF.test(sentence));
    const pool = useful.length > 0 ? useful : sentences;

    const best = pool
        .map((sentence, index) => {
            let score = 0;
            if (action.test(sentence)) score += 4;
            if (INFO_KEYWORDS.test(sentence)) score += 3;
            if (/\d/.test(sentence)) score += 3;
            if (/(€|%|xfp|cfp|\b\d{1,2}\s*(h|heures?)\b)/i.test(sentence)) score += 2;
            if (/(avons le plaisir de vous informer|vous informer que)/i.test(sentence)) score -= 2;
            if (sentence.length <= 220) score += 1;
            if (index === pool.length - 1) score -= 1; // souvent la conclusion
            if (/!/.test(sentence) && !/\d/.test(sentence)) score -= 2;
            return { sentence, index, score };
        })
        .sort((a, b) => b.score - a.score)[0];

    let summary = best.sentence.replace(/\s+/g, " ").trim();

    // Alléger les tournures personnelles : « Je suis absente… » → « Absente… ».
    summary = summary.replace(/^je suis\s+/i, "").replace(/^je reste\s+/i, "");
    if (summary.length > 0) {
        summary = summary.charAt(0).toUpperCase() + summary.slice(1);
    }

    if (/\?$/.test(summary)) {
        summary = `Demande : ${summary}`;
    } else if (INFO_KEYWORDS.test(summary) && !action.test(summary)) {
        summary = `Information : ${summary}`;
    }

    return summary.length > 220 ? `${summary.slice(0, 217).trimEnd()}…` : summary;
}

export interface GmailPartInfo {
    part: string;
    filename: string;
    type: string;
    size: number | null;
    /** Image insérée dans le corps (et non simple pièce jointe). */
    inline: boolean;
}

/** Recense les pièces jointes et images du message, avec leur numéro de partie IMAP. */
export function collectParts(structure: MessageStructureObject | undefined): GmailPartInfo[] {
    if (!structure) return [];
    const found: GmailPartInfo[] = [];

    const walk = (nodes: MessageStructureObject[]) => {
        for (const node of nodes) {
            const filename =
                node.dispositionParameters?.filename || node.parameters?.name || "";
            const disposition =
                typeof node.disposition === "string" ? node.disposition.toLowerCase() : "";
            const isAttachment = disposition.includes("attachment");
            const isImage = typeof node.type === "string" && node.type.startsWith("image/");
            const isInline =
                disposition.includes("inline") || (Boolean(node.id) && !isAttachment) || (isImage && !isAttachment);

            if ((filename || isAttachment || isImage) && node.type?.startsWith("image/") === true) {
                found.push({
                    part: node.part ?? "1",
                    filename: filename || "image",
                    type: node.type,
                    size: typeof node.size === "number" ? node.size : null,
                    inline: isInline,
                });
            } else if (filename || isAttachment) {
                found.push({
                    part: node.part ?? "1",
                    filename: filename || "pièce jointe",
                    type: node.type || "application/octet-stream",
                    size: typeof node.size === "number" ? node.size : null,
                    inline: isInline,
                });
            }

            if (node.childNodes?.length) walk(node.childNodes);
        }
    };

    if (structure.childNodes?.length) walk(structure.childNodes);
    else {
        const filename =
            structure.dispositionParameters?.filename || structure.parameters?.name || "";
        if (filename) {
            found.push({
                part: structure.part ?? "1",
                filename,
                type: structure.type || "application/octet-stream",
                size: typeof structure.size === "number" ? structure.size : null,
                inline: true,
            });
        }
    }

    return found;
}

function collectAttachments(
    structure: MessageStructureObject | undefined
): string[] {
    if (!structure) return [];
    const found: string[] = [];
    const walk = (nodes: MessageStructureObject[]) => {
        for (const node of nodes) {
            const disposition =
                typeof node.disposition === "string" ? node.disposition.toLowerCase() : "";
            const filename =
                node.dispositionParameters?.filename ||
                node.parameters?.name ||
                "";
            if (filename || disposition.includes("attachment")) {
                found.push(filename || "pièce jointe");
            }
            if (node.childNodes?.length) walk(node.childNodes);
        }
    };
    if (structure.childNodes?.length) walk(structure.childNodes);
    else {
        const filename =
            structure.dispositionParameters?.filename || structure.parameters?.name || "";
        if (filename) found.push(filename);
    }
    return found;
}

function collectInlineImages(structure: MessageStructureObject | undefined): string[] {
    if (!structure) return [];
    const found: string[] = [];
    const walk = (nodes: MessageStructureObject[]) => {
        for (const node of nodes) {
            const filename =
                node.dispositionParameters?.filename || node.parameters?.name || "";
            if (node.type?.startsWith("image/") && filename) found.push(filename);
            if (node.childNodes?.length) walk(node.childNodes);
        }
    };
    if (structure.childNodes?.length) walk(structure.childNodes);
    else {
        const filename =
            structure.dispositionParameters?.filename || structure.parameters?.name || "";
        if (structure.type?.startsWith("image/") && filename) found.push(filename);
    }
    return found;
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
    const answered = message.flags ? message.flags.has("\\Answered") : false;
    const finalClassification = answered
        ? {
              ...classification,
              needsReply: false,
              reason: `Déjà répondu — ${classification.reason}`,
          }
        : classification;
    return {
        uid: message.uid,
        subject,
        fromName: from?.name?.trim() || fromEmail || "Expéditeur inconnu",
        fromEmail,
        date: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
        seen: message.flags ? message.flags.has("\\Seen") : false,
        answered,
        ...finalClassification,
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
            if (node.type === type && !isAttachment) return node;
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
        const attachmentParts = collectParts(message.bodyStructure);
        const images = attachmentParts.filter(
            (item) => item.type.startsWith("image/") && item.inline
        );
        const attachments = attachmentParts.map((item) => item.filename);
        const inlineImages = images.map((item) => item.filename);
        const part =
            findPart(message.bodyStructure, "text/plain") ??
            findPart(message.bodyStructure, "text/html");

        let text = "";
        if (part) {
            const download = await client.download(String(uid), part.part ?? "1", { uid: true });
            if (download && download.content) {
                text = await readLimited(download.content, MAX_BODY_BYTES);
                if (part.type === "text/html") text = htmlToText(text);
            }
        }

        // Certains messages n'ont pas de partie texte exploitable (HTML atypique,
        // message composé uniquement de pièces jointes) : on tente le corps complet.
        if (!text.trim()) {
            try {
                const fallback = await client.download(String(uid), "TEXT", { uid: true });
                if (fallback && fallback.content) {
                    const raw = await readLimited(fallback.content, MAX_BODY_BYTES);
                    text = /<html|<body|<div/i.test(raw) ? htmlToText(raw) : raw;
                }
            } catch {
                // on conserve le repli explicite plus bas
            }
        }

        const fullText = text.trim();
        const breakdown = splitThread(fullText);
        const attachmentsLabel = attachments.length
            ? `(Message sans texte — ${attachments.length} pièce(s) jointe(s) : ${attachments.join(", ")})`
            : "(Ce message ne contient pas de texte lisible.)";
        const visibleText = fullText || attachmentsLabel;
        const summary = fullText
            ? summarizeMessage(breakdown.currentText || fullText, envelope?.subject ?? "")
            : attachments.length
              ? `Envoi de ${attachments.length} pièce(s) jointe(s) : ${attachments.join(", ")}.`
              : "Message sans contenu texte.";

        return {
            ...toSummary(message, message.headers?.toString("utf8") ?? ""),
            to: addressList(envelope?.to),
            cc: addressList(envelope?.cc),
            text: visibleText,
            summary,
            currentText: breakdown.currentText || visibleText,
            historyText: breakdown.historyText,
            exchanges: breakdown.exchanges,
            attachments,
            inlineImages,
            attachmentParts,
            images,
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
    exchanges: number;
}

interface ReplyContext {
    fromName: string;
    fromEmail: string;
    subject: string;
    /** Message courant (sans l'historique cité si disponible). */
    text: string;
    /** Échanges précédents, utilisés pour comprendre le contexte. */
    history?: string;
    /** Prénom fiable détecté côté serveur (vide si inconnu). */
    firstName?: string;
    needsReply: boolean;
    exchanges?: number;
}

export interface ReplyStyle {
    greeting?: "Bonjour" | "Salut";
    includeOffer?: boolean;
    closing?: string;
    /** Registre dans lequel vos corrections ont été mémorisées. */
    register?: Register;
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

const NOT_FIRST_NAMES =
    /^(la|le|les|de|du|des|et|fitness|park|quais|patrimoniale|banque|assurance|assurances|mutuelle|conseil|conseils|immobilier|immo|groupe|societe|service|services|client|clients|accueil|contact|contacts|info|infos|commercial|commerciaux|direction|support|admin|equipe|lequipe|agence|cabinet|boutique|magasin|centre|club|salle|sas|sarl|sci|sa|eurl|snc|energie|telecom|ventes|marketing|newsletter|bonjour|cordialement|merci|signature|logo|image|photo|img|banner|facebook|linkedin|instagram|www|http|mail|email|courriel|votre|notre|conseiller|conseillere|charge|chargee|gestionnaire|assistant|assistante|directeur|directrice|responsable|paris|lyon|marseille|noumea|bordeaux|lille|toulouse|nice|nantes|rennes|strasbourg|montpellier|toulon|grenoble|dijon|angers|reims|limoges|tours|nancy|metz|brest|perpignan|besancon|orleans|rouen|caen|cedex|france)$/i;

const GENERIC_FILE_WORDS =
    /^(signature|logo|image|photo|img|banner|icon|avatar|facebook|linkedin|instagram|file|piece|pj|doc|document|scan|png|jpe?g|gif|webp)$/i;

/** Liste des prénoms reconnus (normalisés : sans accent, minuscules). */
const KNOWN_FIRST_NAMES = new Set(
    `aicha alessandro alex alexandra alexandre ali alice alva amandine amel amelie amina ana anais andre andrea anna anne anne-sophie antoine arnaud audrey aurelie auriane axel baptiste beatrice benjamin bernard bertrand bilal brigitte bruno camille carine carla carlo carmen caroline catherine cecile celine charles charlotte chiara chloe christelle christian christine christophe cindy claire clara clemence clement clotilde corinne cyril damien daniel david davide delphine denis diane didier dominique edouard elena elias elise elodie elsa emilie emma emmanuel eric estelle etienne eva fabien fabrice fanny fatima federico florence florian franck francois francoise frederic gabriel gaelle gerard gilbert gilles giovanni giulia gregory guillaume guy hassan heiata heirani helene henri herve hina hiro hugo ibrahima ines iriti isabelle ismael jacques jade jean jean-marc jean-paul jeanne jeremy jerome jessica joel jonathan jose josee joseph julie julien juliette justine kalani kanoa karen karim keanu kelly kevin laetitia laura laure laurence laurent laurie lea leila leo leonie lila linda lionel lison lola lorraine lou louis louise luc luca lucas lucia lucie ludovic madeleine maeva magali mala mamadou mano manon manutea marc marcel marco mareva margaux maria marianne marie marie-claire marine marion marjorie martine mathieu mathilde matteo maud maurice maxime melanie melissa michel michele michelle mila moana mohamed mohammed monique morgane moussa muriel myriam nadia nadir nathalie nicolas nicole nina noah noel noemie olivier omar ophelie ousmane paolo pascal patricia patrick paul paula pauline philippe pierre pierre-yves poerava rachid rachida raihere raphael rayane raymond regine remi renaud richard robert roger romain romane romy rosa rose sabine sabrina samia samuel sana sandra sandrine sarah sebastien serge severine simon simone sofia sofiane sonia sophie stephane stephanie sylvain sylvie tau tavita teiva terii teva thibault thierry thomas tiffany tiphanie tom vaea vaitea vaitiare valentin valerie vanessa veronique victoire victor vincent virginie viviane xavier yanis yann yasmina yasmine yves zoe`.split(/\s+/)
);

function normalizeName(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/['’-]/g, "");
}

function isKnownFirstName(token: string): boolean {
    return KNOWN_FIRST_NAMES.has(normalizeName(token));
}

function capitalizeFirst(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/** Nettoie un candidat prénom : lettres uniquement, pas de société, pas de sigle. */
/** Valide un prénom : forme correcte, pas une société, et connu sauf mention explicite. */
function cleanFirstName(raw: string, allowUnknown = false): string {
    const token = raw.normalize("NFC").replace(/[^\p{L}'-]/gu, "").trim();
    if (!/^[\p{L}][\p{L}'-]{1,19}$/u.test(token)) return "";
    const normalized = token.toLowerCase().replace(/['’-]/g, "");
    if (NOT_FIRST_NAMES.test(normalized)) return "";
    if (token === token.toUpperCase() && token.length > 3) return "";
    if (!allowUnknown && !isKnownFirstName(token)) return "";
    return capitalizeFirst(token);
}

/** Lignes de signature probables (après une formule de politesse + fin du message). */
function signatureLines(body: string): string[] {
    const lines = body
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const closingIndex = lines.findIndex((line) =>
        /^(cordialement|bien cordialement|bien à vous|sincèrement|sincerement|bonne journée|bonne fin de journée|à bientôt|a bientot|merci,?)$/i.test(
            line
        )
    );

    const afterClosing =
        closingIndex >= 0 ? lines.slice(closingIndex + 1, closingIndex + 4) : [];
    return [...afterClosing, ...lines.slice(-6)];
}

/**
 * Détermine le prénom de la personne à qui répondre.
 * Ordre : signature du message → nom affiché (filtré des raisons sociales) →
 * adresse e-mail → nom de fichier d'une signature image.
 * Renvoie une chaîne vide si aucun prénom fiable n'est trouvé.
 */
export function extractFirstName(input: {
    senderName: string;
    senderEmail: string;
    bodyText: string;
    imageNames?: string[];
}): string {
    // 1. Corps du message : « je m'appelle X », « Cordialement, Mélanie », etc.
    for (const line of signatureLines(input.bodyText)) {
        const explicit = line.match(/(?:je m'appelle|je me nomme|je suis|c'est)\s+([\p{L}'-]{2,20})/iu);
        if (explicit) {
            const cleaned = cleanFirstName(explicit[1], true);
            if (cleaned) return cleaned;
        }

        const words = line.split(/[\s,–—-]+/).filter(Boolean);
        if (words.length === 0 || words.length > 4 || /\d/.test(line)) continue;

        const candidate = cleanFirstName(words[0]);
        if (candidate) return candidate;
    }

    // 2. Nom affiché de l'expéditeur, s'il ressemble à une personne.
    const displayWords = input.senderName.trim().split(/\s+/).filter(Boolean);
    if (displayWords.length > 0 && displayWords.length <= 3) {
        const candidate = cleanFirstName(displayWords[0]);
        if (candidate) return candidate;
    }

    // 3. Adresse e-mail : prenom.nom@..., prenom_nom@..., prenom+tag@...
    const localPart = input.senderEmail.split("@")[0] ?? "";
    if (/[._+-]/.test(localPart)) {
        const segment = localPart.split(/[._+-]/)[0];
        if (segment.length >= 3) {
            const candidate = cleanFirstName(segment);
            if (candidate) return candidate;
        }
    }

    // 4. Signature en image : le nom est parfois dans le nom du fichier
    //    (ex. signature-melanie.png). L'image elle-même n'est pas analysée.
    for (const filename of input.imageNames ?? []) {
        for (const part of filename.split(/[_\-\s.]+/)) {
            if (part.length < 3 || GENERIC_FILE_WORDS.test(part)) continue;
            const candidate = cleanFirstName(part);
            if (candidate) return candidate;
        }
    }

    return "";
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
export function buildReplyDraft(
    context: ReplyContext,
    signature = "",
    style?: ReplyStyle
): ReplyDraft {
    const currentText = context.text || "";
    const history = context.history || "";
    const haystack = `${context.subject}\n${currentText}\n${history}`
        .slice(0, 8000)
        .toLowerCase();
    const name =
        context.firstName !== undefined
            ? context.firstName
            : extractFirstName({
                  senderName: context.fromName,
                  senderEmail: context.fromEmail,
                  bodyText: currentText,
              });
    const register = detectRegister(currentText || context.subject);

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

    // Le style appris ne s'applique que dans le registre où vous l'avez utilisé :
    // pas de « Salut » ni de clôture familière sur un email au vouvoiement.
    const styleApplies = !style?.register || style.register === register;

    const greetingWord =
        styleApplies && style?.greeting === "Salut" && register === "tutoiement"
            ? "Salut"
            : "Bonjour";
    const greeting = name ? `${greetingWord} ${name},` : `${greetingWord},`;
    const closingBlock =
        styleApplies && style?.closing?.trim()
            ? style.closing.trim().slice(0, 300)
            : signatureText;

    const parts = [greeting, "", phrase[variant], ""];
    const includeOffer = styleApplies ? style?.includeOffer !== false : true;
    if (includeOffer) {
        parts.push(CLOSINGS[variant], "");
    }
    parts.push(closingBlock);

    return {
        to: context.fromEmail,
        subject: /^re\s*:/i.test(context.subject) ? context.subject : `Re: ${context.subject}`,
        body: parts.join("\n"),
        intent,
        register,
        needsReply: context.needsReply,
        exchanges: context.exchanges ?? 1,
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

/* ------------------------------------------------------------------ */
/* Classement dans les dossiers Gmail                                 */
/* ------------------------------------------------------------------ */

export interface GmailFolder {
    path: string;
    label: string;
    kind: "inbox" | "label" | "system";
}

const SPECIAL_FOLDER_LABELS: Record<string, string> = {
    "\\Inbox": "Boîte de réception",
    "\\All": "Tous les messages (archives)",
    "\\Drafts": "Brouillons",
    "\\Sent": "Messages envoyés",
    "\\Trash": "Corbeille",
    "\\Junk": "Indésirables",
};

export const ARCHIVE_PATH = "[Gmail]/All Mail";

export async function listFolders(): Promise<GmailFolder[]> {
    if (!isGmailConfigured()) {
        throw new Error("Gmail n'est pas configuré.");
    }

    const client = createImapClient();
    client.on("error", () => undefined);
    await client.connect();
    try {
        const boxes = await client.list();
        const folders: GmailFolder[] = [];

        for (const box of boxes) {
            if (box.flags?.has("\\Noselect")) continue;

            if (box.path === "INBOX") {
                folders.push({ path: box.path, label: "Boîte de réception", kind: "inbox" });
                continue;
            }

            const specialLabel = box.specialUse ? SPECIAL_FOLDER_LABELS[box.specialUse] : undefined;
            if (specialLabel) {
                folders.push({ path: box.path, label: specialLabel, kind: "system" });
                continue;
            }

            // Les dossiers système Gmail restants sont couverts par specialUse :
            // on ignore les entrées techniques pour ne garder que vos libellés.
            if (box.path.startsWith("[Gmail]/")) continue;

            folders.push({ path: box.path, label: box.path, kind: "label" });
        }

        const rank = (folder: GmailFolder): number =>
            folder.kind === "label" ? 0 : folder.kind === "inbox" ? -1 : 1;

        folders.sort(
            (a, b) =>
                rank(a) - rank(b) ||
                a.label.localeCompare(b.label, "fr", { sensitivity: "base" })
        );

        return folders;
    } finally {
        await client.logout().catch(() => undefined);
    }
}

/** Déplace un message vers un dossier/libellé Gmail (ou vers les archives). */
export async function moveMessage(
    uid: number,
    destination: string
): Promise<{ moved: boolean; destination: string }> {
    if (!isGmailConfigured()) {
        throw new Error("Gmail n'est pas configuré.");
    }
    if (!Number.isInteger(uid) || uid <= 0) {
        throw new Error("Identifiant de message invalide.");
    }
    if (!destination.trim()) {
        throw new Error("Dossier de destination manquant.");
    }

    const client = createImapClient();
    client.on("error", () => undefined);
    await client.connect();

    let lock: { release: () => void } | null = null;
    try {
        const boxes = await client.list();
        const target = boxes.find((box) => box.path === destination);
        if (!target) {
            throw new Error("Dossier de destination inconnu dans Gmail.");
        }

        lock = await client.getMailboxLock("INBOX");
        const result = await client.messageMove(String(uid), destination, { uid: true });
        if (result === false) {
            throw new Error("Gmail a refusé le déplacement de ce message.");
        }
        return { moved: true, destination };
    } finally {
        lock?.release();
        await client.logout().catch(() => undefined);
    }
}

/** Envoie un message à la corbeille Gmail. */
export async function deleteMessage(
    uid: number
): Promise<{ deleted: boolean; destination: string }> {
    if (!isGmailConfigured()) throw new Error("Gmail n'est pas configuré.");
    if (!Number.isInteger(uid) || uid <= 0) throw new Error("Identifiant de message invalide.");

    const client = createImapClient();
    client.on("error", () => undefined);
    await client.connect();

    let lock: { release: () => void } | null = null;
    try {
        const boxes = await client.list();
        const trash =
            boxes.find((box) => box.specialUse === "\\Trash") ??
            boxes.find((box) => box.path === "[Gmail]/Trash");

        if (!trash) throw new Error("Corbeille Gmail introuvable.");

        lock = await client.getMailboxLock("INBOX");
        const result = await client.messageMove(String(uid), trash.path, { uid: true });
        if (result === false) {
            throw new Error("Gmail a refusé la suppression de ce message.");
        }
        return { deleted: true, destination: trash.path };
    } finally {
        lock?.release();
        await client.logout().catch(() => undefined);
    }
}

/** Marque un message comme répondu (drapeau \Answered de Gmail). */
export async function markMessageAnswered(uid: number): Promise<boolean> {
    if (!isGmailConfigured() || !Number.isInteger(uid) || uid <= 0) return false;

    const client = createImapClient();
    client.on("error", () => undefined);
    await client.connect();

    let lock: { release: () => void } | null = null;
    try {
        lock = await client.getMailboxLock("INBOX");
        await client.messageFlagsAdd(String(uid), ["\\Answered"], { uid: true });
        return true;
    } catch {
        return false;
    } finally {
        lock?.release();
        await client.logout().catch(() => undefined);
    }
}

/** Télécharge une partie IMAP (image, PDF…) pour affichage ou téléchargement. */
export async function downloadPart(
    uid: number,
    part: string
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    if (!isGmailConfigured()) throw new Error("Gmail n'est pas configuré.");
    if (!Number.isInteger(uid) || uid <= 0) throw new Error("Identifiant de message invalide.");
    if (!/^\d+(\.\d+)*$/.test(part)) throw new Error("Numéro de partie invalide.");

    const client = createImapClient();
    client.on("error", () => undefined);
    await client.connect();

    let lock: { release: () => void } | null = null;
    try {
        lock = await client.getMailboxLock("INBOX", { readOnly: true });

        const message = await client.fetchOne(
            String(uid),
            { bodyStructure: true },
            { uid: true }
        );
        const info =
            message && message.bodyStructure
                ? collectParts(message.bodyStructure).find((item) => item.part === part)
                : undefined;

        const download = await client.download(String(uid), part, { uid: true });
        if (!download || !download.content) {
            throw new Error("Pièce jointe introuvable dans ce message.");
        }

        const chunks: Buffer[] = [];
        let size = 0;
        const MAX = 10 * 1024 * 1024;
        for await (const chunk of download.content as AsyncIterable<Buffer | string>) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            const remaining = MAX - size;
            if (remaining <= 0) break;
            chunks.push(buffer.subarray(0, remaining));
            size += Math.min(buffer.length, remaining);
            if (size >= MAX) break;
        }
        download.content.destroy();

        return {
            buffer: Buffer.concat(chunks),
            contentType: info?.type || "application/octet-stream",
            filename: info?.filename || `piece-${part}`,
        };
    } finally {
        lock?.release();
        await client.logout().catch(() => undefined);
    }
}

/** Récupère uniquement l'enveloppe d'un message (rapide, sans le corps). */
export async function getMessageSummary(uid: number): Promise<GmailMessageSummary> {
    if (!isGmailConfigured()) throw new Error("Gmail n'est pas configuré.");
    if (!Number.isInteger(uid) || uid <= 0) throw new Error("Identifiant de message invalide.");

    return withInbox(async (client) => {
        const message = await client.fetchOne(
            String(uid),
            { envelope: true, internalDate: true, flags: true, headers: HEADERS_TO_FETCH },
            { uid: true }
        );
        if (!message) throw new Error("Message introuvable dans la boîte de réception.");
        return toSummary(message, message.headers?.toString("utf8") ?? "");
    });
}

/* ------------------------------------------------------------------ */
/* Suggestion de dossier apprise des emails déjà rangés                */
/* ------------------------------------------------------------------ */

export interface FolderScan {
    path: string;
    label: string;
    senderCount: number;
    domainCount: number;
}

export interface FolderSuggestion {
    path: string;
    label: string;
    score: number;
    reason: string;
}

export interface FolderSuggestionResult {
    suggestions: FolderSuggestion[];
    /** Nombre total de libellés disponibles. */
    scanned: number;
    /** Nombre de libellés traités dans ce lot. */
    processed: number;
    /** Nombre de libellés où l'adresse exacte a été trouvée (tous lots confondus côté client). */
    withSender: number;
    /** Nombre de recherches ayant échoué (ne plus ignorer silencieusement). */
    errors: number;
    /** Offset du lot suivant, ou null si l'analyse est terminée. */
    nextOffset: number | null;
}

/** Domaines grand public : un domaine partagé n'aide jamais à classer. */
export const FREEMAIL_DOMAINS = new Set([
    "gmail.com",
    "googlemail.com",
    "outlook.com",
    "outlook.fr",
    "hotmail.com",
    "hotmail.fr",
    "live.com",
    "live.fr",
    "msn.com",
    "yahoo.com",
    "yahoo.fr",
    "ymail.com",
    "icloud.com",
    "me.com",
    "mac.com",
    "proton.me",
    "protonmail.com",
    "free.fr",
    "orange.fr",
    "wanadoo.fr",
    "laposte.net",
    "sfr.fr",
    "neuf.fr",
    "aol.com",
    "gmx.com",
    "gmx.fr",
    "mail.com",
    "zoho.com",
    "tutanota.com",
]);

export function normalizedKey(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

/** Le libellé porte-t-il le nom du domaine (BNC ↔ bnc.nc) ? */
export function folderMatchesDomain(label: string, domain: string): boolean {
    const rootKey = normalizedKey(domain.split(".")[0] ?? "");
    const folderKey = normalizedKey(label);
    if (rootKey.length < 3 || folderKey.length < 3) return false;
    return folderKey.includes(rootKey) || rootKey.includes(folderKey);
}

export function rankFolderCandidates(
    input: { senderEmail: string; senderName: string; subject: string },
    scans: FolderScan[]
): FolderSuggestion[] {
    const domain = input.senderEmail.toLowerCase().split("@")[1] ?? "";
    const domainIsSpecific = Boolean(domain) && !FREEMAIL_DOMAINS.has(domain);

    const results: FolderSuggestion[] = [];

    for (const scan of scans) {
        if (scan.senderCount > 0) {
            results.push({
                path: scan.path,
                label: scan.label,
                score: 100 + Math.min(scan.senderCount, 20),
                reason: `cet expéditeur figure déjà ${scan.senderCount} fois dans ce dossier`,
            });
            continue;
        }

        if (!domainIsSpecific || scan.domainCount === 0) continue;
        if (!folderMatchesDomain(scan.label, domain)) continue;

        results.push({
            path: scan.path,
            label: scan.label,
            score: 50 + Math.min(scan.domainCount, 10),
            reason: `dossier « ${scan.label} » : ${scan.domainCount} email(s) du domaine ${domain}`,
        });
    }

    return results.sort((a, b) => b.score - a.score);
}

const folderListCache = new Map<string, { at: number; value: GmailFolder[] }>();
const FOLDER_CACHE_TTL_MS = 30_000;

async function suggestableFolders(): Promise<GmailFolder[]> {
    const cached = folderListCache.get("labels");
    if (cached && Date.now() - cached.at < FOLDER_CACHE_TTL_MS) return cached.value;

    const folders = (await listFolders())
        .filter((folder) => folder.kind === "label")
        .sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));

    folderListCache.set("labels", { at: Date.now(), value: folders });
    return folders;
}

const suggestionCache = new Map<string, { at: number; value: FolderSuggestionResult }>();
const SUGGESTION_TTL_MS = 10 * 60 * 1000;

export const DEFAULT_SUGGESTION_BATCH = 15;

/**
 * Analyse les libellés Gmail par lots : `offset` + `batch` permettent de tout
 * parcourir sans jamais dépasser la durée max d'une fonction serverless.
 * Aucune limite globale : le client enchaîne les lots jusqu'à `nextOffset === null`.
 */
export async function suggestFolderForMessage(
    input: { senderEmail: string; senderName: string; subject: string },
    options?: { refresh?: boolean; offset?: number; batch?: number }
): Promise<FolderSuggestionResult> {
    if (!isGmailConfigured()) throw new Error("Gmail n'est pas configuré.");

    const folders = await suggestableFolders();
    const total = folders.length;

    const offset = Math.max(0, Math.trunc(options?.offset ?? 0));
    const batch = Math.min(Math.max(Math.trunc(options?.batch ?? DEFAULT_SUGGESTION_BATCH), 1), 30);
    const slice = folders.slice(offset, offset + batch);
    const nextOffset = offset + slice.length < total ? offset + slice.length : null;

    const cacheKey = `${input.senderEmail.toLowerCase()}|${input.subject}|${offset}|${batch}`;
    const cached = suggestionCache.get(cacheKey);
    if (!options?.refresh && cached && Date.now() - cached.at < SUGGESTION_TTL_MS) {
        return cached.value;
    }

    if (slice.length === 0) {
        const empty: FolderSuggestionResult = {
            suggestions: [],
            scanned: total,
            processed: 0,
            withSender: 0,
            errors: 0,
            nextOffset: null,
        };
        suggestionCache.set(cacheKey, { at: Date.now(), value: empty });
        return empty;
    }

    const senderEmail = input.senderEmail.toLowerCase();
    const domain = senderEmail.split("@")[1] ?? "";
    const baseAddress = senderEmail.includes("+") ? `${senderEmail.split("+")[0]}@${domain}` : null;
    const domainIsSpecific = Boolean(domain) && !FREEMAIL_DOMAINS.has(domain);

    const client = createImapClient();
    client.on("error", () => undefined);
    await client.connect();

    const scans: FolderScan[] = [];
    let errors = 0;

    try {
        for (const folder of slice) {
            const lock = await client.getMailboxLock(folder.path, { readOnly: true });
            try {
                let senderCount = 0;
                let domainCount = 0;

                try {
                    const found = await client.search({ from: input.senderEmail }, { uid: true });
                    senderCount = Array.isArray(found) ? found.length : 0;
                } catch {
                    errors += 1;
                    senderCount = 0;
                }

                if (senderCount === 0 && baseAddress && baseAddress !== senderEmail) {
                    try {
                        const found = await client.search({ from: baseAddress }, { uid: true });
                        senderCount = Array.isArray(found) ? found.length : 0;
                    } catch {
                        errors += 1;
                        senderCount = 0;
                    }
                }

                // Le domaine n'est recherché que dans les dossiers dont le nom
                // correspond au domaine : inutile ailleurs, et coûteux en IMAP.
                if (domainIsSpecific && folderMatchesDomain(folder.label, domain)) {
                    try {
                        const found = await client.search({ from: `@${domain}` }, { uid: true });
                        domainCount = Array.isArray(found) ? found.length : 0;
                    } catch {
                        errors += 1;
                        domainCount = 0;
                    }
                }

                scans.push({ path: folder.path, label: folder.label, senderCount, domainCount });
            } finally {
                lock.release();
            }
        }
    } finally {
        await client.logout().catch(() => undefined);
    }

    const value: FolderSuggestionResult = {
        suggestions: rankFolderCandidates(input, scans),
        scanned: total,
        processed: scans.length,
        withSender: scans.filter((scan) => scan.senderCount > 0).length,
        errors,
        nextOffset,
    };

    suggestionCache.set(cacheKey, { at: Date.now(), value });
    return value;
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


/* ------------------------------------------------------------------ */
/* Factures fournisseurs (Lagoon, EEC, CDE, OPT)                       */
/* ------------------------------------------------------------------ */

export type InvoiceProvider = "lagoon" | "eec" | "cde" | "opt-internet" | "opt-mobile";

export interface InvoiceFile {
    part: string;
    original: string;
    proposed: string;
    type: string;
}

export interface InvoiceProposal {
    provider: InvoiceProvider;
    providerLabel: string;
    period: string;
    files: InvoiceFile[];
}

const MONTHS_FR: Record<string, number> = {
    janvier: 1,
    fevrier: 2,
    février: 2,
    mars: 3,
    avril: 4,
    mai: 5,
    juin: 6,
    juillet: 7,
    aout: 8,
    août: 8,
    septembre: 9,
    octobre: 10,
    novembre: 11,
    decembre: 12,
    décembre: 12,
};

const PROVIDER_LABEL: Record<InvoiceProvider, string> = {
    lagoon: "LAGOON",
    eec: "EEC",
    cde: "CDE",
    "opt-internet": "OPT Internet",
    "opt-mobile": "OPT Mobile",
};

function onlyDigits(value: string): string {
    return value.replace(/\D+/g, "");
}

function detectProvider(message: GmailMessageDetail): InvoiceProvider | null {
    const haystack = `${message.fromEmail} ${message.fromName} ${message.subject} ${message.currentText} ${message.historyText}`.toLowerCase();
    const digits = onlyDigits(haystack);

    if (/lagoon/.test(haystack)) return "lagoon";
    if (/\beec\b|engie/.test(haystack)) return "eec";
    if (/cal[ée]donienne des eaux|\bcde\b|eaux\.nc/.test(haystack)) return "cde";
    if (/opt\.nc|\bopt\b/.test(haystack)) {
        if (digits.includes("111150452") || /mobile|t[ée]l[ée]phonie|forfait/.test(haystack)) {
            return "opt-mobile";
        }
        if (digits.includes("9000019168") || /internet|adsl|fibre/.test(haystack)) {
            return "opt-internet";
        }
        return "opt-internet";
    }
    return null;
}

function monthFromText(text: string): { year: number; month: number } | null {
    const iso = text.match(/(20\d{2})[-\/.](\d{1,2})/);
    if (iso) {
        const year = Number(iso[1]);
        const month = Number(iso[2]);
        if (month >= 1 && month <= 12) return { year, month };
    }

    const french = text.match(/(?:^|\D)(\d{1,2})[\/.](20\d{2})(?!\d)/);
    if (french) {
        const month = Number(french[1]);
        const year = Number(french[2]);
        if (month >= 1 && month <= 12) return { year, month };
    }

    const named = text
        .toLowerCase()
        .match(/(janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)\s+(20\d{2})/);
    if (named) {
        return { year: Number(named[2]), month: MONTHS_FR[named[1]] ?? 1 };
    }

    return null;
}

function quarterFromText(text: string): { year: number; quarter: number } | null {
    const direct = text.match(/\bT([1-4])\b[^\d]{0,8}(20\d{2})/i);
    if (direct) return { quarter: Number(direct[1]), year: Number(direct[2]) };

    const reverse = text.match(/(20\d{2})[^\d]{0,8}\bT([1-4])\b/i);
    if (reverse) return { year: Number(reverse[1]), quarter: Number(reverse[2]) };

    const trimestre = text.match(/([1-4])(?:er|e|ème|eme)?\s*trimestre[^\d]{0,10}(20\d{2})/i);
    if (trimestre) return { quarter: Number(trimestre[1]), year: Number(trimestre[2]) };

    return null;
}

function periodFromMessage(
    message: GmailMessageDetail,
    provider: InvoiceProvider
): string {
    const haystack = `${message.subject}\n${message.currentText}\n${message.historyText}`;
    const received = new Date(message.date);
    const fallbackYear = Number.isNaN(received.getTime())
        ? new Date().getFullYear()
        : received.getFullYear();
    const fallbackMonth = Number.isNaN(received.getTime())
        ? new Date().getMonth() + 1
        : received.getMonth() + 1;

    if (provider === "cde") {
        const explicit = quarterFromText(haystack);
        if (explicit) {
            return `${explicit.year}-T${explicit.quarter}`;
        }
        const month = monthFromText(haystack);
        const year = month?.year ?? fallbackYear;
        const monthNumber = month?.month ?? fallbackMonth;
        const quarter = Math.floor((monthNumber - 1) / 3) + 1;
        return `${year}-T${quarter}`;
    }

    const month = monthFromText(haystack);
    const year = month?.year ?? fallbackYear;
    const monthNumber = month?.month ?? fallbackMonth;
    return `${year}-${String(monthNumber).padStart(2, "0")}`;
}

function pdfFiles(message: GmailMessageDetail): InvoiceFile[] {
    const pdfs = message.attachmentParts.filter(
        (part) =>
            part.type.toLowerCase() === "application/pdf" ||
            part.filename.toLowerCase().endsWith(".pdf")
    );

    if (pdfs.length === 0) return [];

    const clean = (value: string) => value.replace(/[\\/:*?"<>|]+/g, "-").trim();

    return pdfs.map((part, index) => ({
        part: part.part,
        original: part.filename,
        type: part.type || "application/pdf",
        proposed: clean(part.filename || `facture-${index + 1}.pdf`),
    }));
}

/**
 * Détecte une facture d'un fournisseur connu et propose un nom de fichier
 * normalisé : « 2026-08 - LAGOON - Facture.pdf », « 2026-T3 - CDE - Facture.pdf »…
 */
export function detectInvoiceFromMessage(message: GmailMessageDetail): InvoiceProposal | null {
    const provider = detectProvider(message);
    if (!provider) return null;

    const files = pdfFiles(message);
    if (files.length === 0) return null;

    const period = periodFromMessage(message, provider);
    const label = PROVIDER_LABEL[provider];

    return {
        provider,
        providerLabel: label,
        period,
        files: files.map((file, index) => ({
            ...file,
            proposed: `${period} - ${label} - Facture${files.length > 1 ? ` (${index + 1})` : ""}.pdf`,
        })),
    };
}
