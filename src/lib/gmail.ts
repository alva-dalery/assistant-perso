import { ImapFlow } from "imapflow";
import type { FetchMessageObject, MessageStructureObject } from "imapflow";
import nodemailer from "nodemailer";
import type { Readable } from "node:stream";
import { extractText, getDocumentProxy } from "unpdf";

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
const MAX_BODY_BYTES = 1_500_000;
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
    const responseText =
        error && typeof error === "object" && "responseText" in error
            ? String((error as { responseText?: unknown }).responseText ?? "")
            : "";
    const detail = responseText && responseText !== raw ? `${raw} (${responseText})` : raw;
    if (/EAUTH|Invalid login|535|Username and Password not accepted/i.test(detail)) {
        return "Mot de passe refusé par Gmail. Vérifiez GMAIL_USER et GMAIL_APP_PASSWORD (mot de passe d'application de 16 caractères, double authentification activée).";
    }
    if (/Too many simultaneous connections/i.test(detail)) {
        return "Trop de connexions simultanées sur Gmail (limite Gmail atteinte). Réessayez dans quelques secondes.";
    }
    if (/ENOTFOUND|ETIMEDOUT|ECONNECTION|ECONNRESET|EAI_AGAIN|socket/i.test(detail)) {
        return "Connexion aux serveurs Gmail impossible (réseau instable ou blocage du port IMAP/SMTP).";
    }
    return detail.slice(0, 300) || "Erreur inconnue lors du contact avec Gmail.";
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

/**
 * Ouvre INBOX en lecture seule, exécute `fn`, puis referme immédiatement
 * pour ne jamais saturer la limite de connexions simultanées de Gmail.
 * Réessaie une fois après un court délai si Gmail signale trop de connexions.
 */
async function withInbox<T>(
    fn: (client: ImapFlow, exists: number) => Promise<T>
): Promise<T> {
    const runOnce = async (): Promise<T> => {
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
    };

    try {
        return await runOnce();
    } catch (error) {
        const msg = describeGmailError(error);
        if (/Trop de connexions simultanées/i.test(msg)) {
            await new Promise((resolve) => setTimeout(resolve, 600));
            return await runOnce();
        }
        throw error;
    }
}

/* ------------------------------------------------------------------ */
/* Tri des messages : à traiter ou diffusion                          */
/* ------------------------------------------------------------------ */

export type GmailCategory =
    | "personnel"
    | "important"
    | "factures"
    | "commande"
    | "alertes"
    | "infos"
    | "kiosque"
    | "newsletter"
    | "promotion";

/** Informations de suivi d'un colis extraites du message. */
export interface GmailTracking {
    /** Magasin à l'origine de la commande (nom d'affichage ou domaine). */
    store: string | null;
    /** Numéro de commande détecté (ex. KS-12345). */
    orderNumber?: string | null;
    /** Transporteur reconnu (La Poste, Colissimo, DHL, OPT.nc…). */
    carrier: string | null;
    /** Numéros de suivi détectés (1 à 3). */
    numbers: string[];
    /** Dernier statut lisible (« En cours de livraison », « Livré »…). */
    status: string | null;
    /** Date ou créneau de livraison annoncée, telle qu'écrite dans l'email. */
    estimatedDelivery: string | null;
    /** Ville de livraison extraite de l'adresse de livraison. */
    deliveryCity?: string | null;
    /** Étapes de suivi lues dans l'email (de la plus récente à la plus ancienne). */
    history: string[];
    /** Lien de suivi (celui de l'email, sinon la page du transporteur). */
    url: string | null;
    /** Visuels des produits commandés extraits de l'email. */
    images?: string[];
    /** Intitulé du ou des produits commandés. */
    productTitle?: string | null;
    /** Intitulé associé à chaque URL d'image détectée. */
    imageLabels?: Record<string, string>;
}

export interface GmailClassification {
    category: GmailCategory;
    needsReply: boolean;
    reason: string;
    orderNumber?: string | null;
    trackingNumber?: string | null;
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

/** Factures et paiements à régler (EEC, Calédonienne des eaux, OPT, Lagoon…). */
const FACTURE_SUBJECT =
    /(facture|avis d.échéance|échéance|prélèvement|paiement|payer|régler|solde dû|rappel de paiement|remboursement|quittance)/i;

const NC_INVOICE_PROVIDER =
    /(lagoon|eec\.nc|engie\.nc|\beec\b|cal[ée]donienne des eaux|cde\.nc|helia\.nc|opt\.nc|\bopt\b)/i;

/** Alertes de sécurité, partages de données de compte, connexions, codes 2FA. */
const ALERT_SUBJECT =
    /(alerte de s[ée]curit[ée]|security alert|alerte|suspicious|connexion (?:inhabituelle|d[ée]tect[ée]e|nouvelle|non reconnue)|nouvelle connexion|new sign-?in|tentative de connexion|mot de passe|password|code de v[ée]rification|code de s[ée]curit[ée]|2fa|double authentification|partag[ée].{0,45}donn[ée]es.{0,45}compte|partage de donn[ée]es|donn[ée]es de (?:votre )?compte|acc[èe]s (?:accord[ée]|partag[ée]|r[ée]voqu[ée])|autorisation d.acc[èe]s|compte compromis|activity alert|nouvel appareil|appareil connect[ée])/i;

const ALERT_SENDER =
    /(security|alert|alerts|account-security|accounts\.google\.com|security-noreply)/i;

/** Newsletters de presse regroupées dans l'onglet Kiosque (Le Monde, Mediapart). */
const KIOSQUE_LE_MONDE = /(?:@|\.)lemonde\.fr\b/i;
const KIOSQUE_MEDIAPART = /(?:@|\.)mediapart\.fr\b/i;

/** Emails de bienvenue / création de compte (à lire, jamais à répondre). */
const WELCOME_SUBJECT =
    /(bienvenue|welcome\b|merci pour votre inscription|votre compte est (?:pr[êe]t|cr[ée][ée]|activ[ée])|activer votre compte|confirmez votre (?:adresse|inscription|email)|premiers pas|getting started)/i;

/** Documents de référence, CGU/CGV, échéanciers, contrats (à lire). */
const REGULATORY_OR_ECHEANCIER =
    /(mise [àa] jour de (?:nos|vos) (?:documents|conditions|tarifs|politique|services)|documents? de r[ée]f[ée]rence|conditions g[ée]n[ée]rales|cgu\b|cgv\b|politique de confidentialit[ée]|[ée]ch[ée]ancier|contrat\s*n[°o.]|relev[ée] (?:annuel|mensuel|de compte)|avis d.information)/i;

/** Administratif important : impôts, cotisations, assurances, convocations. */
const IMPORTANT_SUBJECT =
    /(impôt|impots|imposition|fiscal|déclaration|taxe|tva|ruamm|cps|cotisation|amende|majoration|mise en demeure|huissier|assurance|sinistre|convocation)/i;

/** À lire sans réponse attendue : abonnements, réunions, confirmations. */
const INFO_SUBJECT =
    /(abonnement|renouvellement|renouvelé|expire|expiration|prend fin|fin de contrat|résiliation|réunion|compte rendu|confirmation|confirmée?|réservation|commande|livraison|expédition|embarquement|billet|invitation|planning|agenda|information)/i;

/** Confirmations transactionnelles & annonces produit (Google Play/Pay, Apple, reçus…). */
const TRANSACTIONAL_OR_PRODUCT_INFO =
    /(confirmation de (?:votre )?(?:commande|paiement|achat|r[ée]servation|inscription)|re[çc]u (?:de |pour )?(?:votre )?(?:paiement|commande|achat)|votre commande google play|b[ée]n[ée]ficiez d.une exp[ée]rience|appareils? de confiance|paiement plus rapide|nouvelle fonctionnalit[ée]|d[ée]couvrez (?:nos|les))/i;

const AUTO_BODY_MARKERS =
    /(ne r[ée]pondez pas|do not reply|se d[ée]sabonner|se d[ée]sinscrire|unsubscribe|g[ée]rer vos pr[ée]f[ée]rences|cet e-?mail (?:a [ée]t[ée] |est )?envoy[ée] automatiquement|message g[ée]n[ée]r[ée] automatiquement)/i;

const NO_REPLY_LOCAL =
    /^(no-?reply|do-?not-?reply|ne-?pas-?repondre|nepasrepondre|notifications?|notify|alerts?|newsletter|news|infolettre|promo|promotions?|marketing|mailer|mailing|bounce|bounces|system|automated?|robot|service-?client|support|payments?|billing|googleplay|googlepay|orders?)([._-].*)?$/i;

/* ---------------------- Suivi de colis / commandes ---------------------- */

interface CarrierRule {
    name: string;
    /** Domaine ou nom d'expéditeur. */
    sender: RegExp;
    /** Domaine des liens de suivi. */
    host?: RegExp;
    /** Motif de numéro de suivi propre au transporteur. */
    number?: RegExp;
    /** Page de suivi du transporteur. */
    url?: (value: string) => string;
}

const CARRIERS: CarrierRule[] = [
    {
        name: "Colissimo",
        sender: /(laposte|colissimo|colisprive)/i,
        host: /(laposte\.fr|colissimo)/i,
        number: /\b[A-Z]{2}\d{9}[A-Z]{2}\b|\b[6-9][A-Z]\d{11,12}\b/,
        url: (value) =>
            `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(value)}`,
    },
    {
        name: "Chronopost",
        sender: /chronopost/i,
        host: /chronopost/i,
        number: /\b[A-Z]{2}\d{9}[A-Z]{2}\b|\b[6-9][A-Z]\d{11,12}\b/,
        url: (value) =>
            `https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT=${encodeURIComponent(
                value
            )}`,
    },
    {
        name: "DHL",
        sender: /dhl/i,
        host: /dhl\./i,
        number: /\b(?:JD\d{16,20}|[A-Z]{3}\d{7,10}|\d{10})\b/,
        url: (value) =>
            `https://www.dhl.com/fr-fr/home/tracking.html?tracking-id=${encodeURIComponent(value)}`,
    },
    {
        name: "UPS",
        sender: /(^|[.@-])ups([.-]|$)/i,
        host: /ups\.com/i,
        number: /\b1Z[0-9A-Z]{16}\b/i,
        url: (value) =>
            `https://www.ups.com/track?loc=fr_FR&tracknum=${encodeURIComponent(value)}`,
    },
    {
        name: "FedEx",
        sender: /fedex/i,
        host: /fedex\./i,
        number: /\b\d{12,15}\b/,
        url: (value) =>
            `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(value)}`,
    },
    {
        name: "GLS",
        sender: /gls[-.]?france|(^|[.@-])gls([.-]|$)/i,
        host: /gls-(group|france)/i,
        number: /\b[A-Z0-9]{8,20}\b/,
        url: (value) =>
            `https://gls-group.com/FR/fr/suivi-colis?match=${encodeURIComponent(value)}`,
    },
    {
        name: "Mondial Relay",
        sender: /mondialrelay/i,
        host: /mondialrelay/i,
        number: /\b\d{8,14}\b/,
        url: (value) =>
            `https://www.mondialrelay.fr/suivi-de-colis?numeroExpedition=${encodeURIComponent(
                value
            )}`,
    },
    {
        name: "Amazon",
        sender: /amazon/i,
        host: /amazon\./i,
        number: /\bTB[AC]\d{10,14}\b/i,
        url: (value) =>
            `https://www.amazon.fr/progress-tracker?trackingId=${encodeURIComponent(value)}`,
    },
    {
        name: "AliExpress / Cainiao",
        sender: /(aliexpress|cainiao)/i,
        host: /(aliexpress|cainiao)/i,
        number: /\b(?:LP\d{14,16}|[A-Z]{2}\d{9}[A-Z]{2})\b/,
        url: (value) =>
            `https://global.cainiao.com/detail.htm?mailNoList=${encodeURIComponent(value)}`,
    },
    {
        name: "OPT.nc — Colis Poste",
        sender: /opt\.nc/i,
        host: /opt\.nc/i,
        number: /\b[A-Z]{2}\d{9}[A-Z]{2}\b|\b\d{10,13}\b/,
    },
    { name: "Vinted", sender: /vinted/i, host: /vinted/i },
    { name: "Shein", sender: /shein/i, host: /shein/i },
    { name: "Temu", sender: /temu/i, host: /temu/i },
];

/** Objet typique d'une notification d'expédition ou de livraison. */
const STRONG_TRACKING_SUBJECT =
    /(suivi de (?:votre |mon )?colis|votre colis|colis (?:n[°o]|num[ée]ro|exp[ée]di|livr[ée]|en route|en cours)|num[ée]ro de suivi|tracking (?:number|no|num[ée]ro)|(?:votre|ma)\s+commande\s*(?:n[°o]|num[ée]ro|#|:|-)\s*[A-Z0-9]|(?:your|my)\s+order\s*(?:number|no|#|:|-)\s*[A-Z0-9]|commande (?:exp[ée]di[ée]e?|livr[ée]e?|confirm[ée]e|en route|en cours)|votre commande[^.\n]{0,40}(?:est|a [ée]t[ée]|vient d.[êe]tre|sera)[^.\n]{0,25}(?:exp[ée]di|en route|en cours|arriv|livr|pr[êe]te|confirm|pr[ée]par)|exp[ée]dition de votre commande|en cours de livraison|livraison (?:pr[ée]vue|aujourd|demain|imminente)|pris en charge par|shipment (?:notification|confirmation|update)|shipping (?:confirmation|update|notification)|(?:your|the) (?:package|parcel|order) (?:is|has|was|will)[^.\n]{0,45}(?:on its way|shipped|dispatched|delivered|arriving|delivery)|order (?:shipped|dispatched|delivered|confirmed)|out for delivery|on (?:its|the) way)/i;

/** Raison affichée pour un email classé « Commande ». */
function trackingReason(fromEmail: string): string {
    const carrier = CARRIERS.find((rule) => rule.sender.test(fromEmail))?.name;
    return carrier ? `Suivi de colis — ${carrier}` : "Suivi de colis (aucune réponse attendue)";
}

/** Expéditeur identifiable comme transporteur ou marchand. */
const CARRIER_SENDER =
    /(laposte|colissimo|colisprive|chronopost|dhl|(^|[.@-])ups([.-]|$)|fedex|gls[-.]?france|mondialrelay|amazon|aliexpress|cainiao|vinted|shein|temu|opt\.nc)/i;

const TRACKING_TOPIC =
    /(livraison|colis|commande|exp[ée]di|suivi|tracking|transporteur|shipment|shipping|delivery|package|parcel|order)/i;

const TRACKING_PATTERNS: RegExp[] = [
    /\b1Z[0-9A-Z]{16}\b/g, // UPS
    /\bTB[AC]\d{10,14}\b/g, // Amazon
    /\b(?:JD|JJD)\d{16,20}\b/g, // DHL eCommerce
    /\bLP\d{14,16}\b/g, // Cainiao / AliExpress
    /\b[A-Z]{2}\d{9}[A-Z]{2}\b/g, // format international S10 (La Poste / Colissimo / OPT)
    /\b[689][A-Z][0-9A-Z]{11,13}\b/g, // Colissimo (6A..., 8R..., 6G..., 9V...)
];

const TRACKING_KEYWORD_NUMBER =
    /(?:n[°o]\s*(?:de\s*)?suivi|num[ée]ro\s*de\s*suivi|num[ée]ro\s*d.exp[ée]dition|num[ée]ro\s*de\s*colis|tracking(?:\s*(?:number|no|num[ée]ro))?|tracking_number|trackingNo|parcelNumber)\s*[:#="']+\s*([A-Z0-9][A-Z0-9-]{7,34})/gi;

/** Transporteurs reconnaissables au seul format du numéro. */
const SIGNATURE_CARRIERS: Array<{ pattern: RegExp; name: string }> = [
    { pattern: /^1Z[0-9A-Z]{16}$/i, name: "UPS" },
    { pattern: /^TB[AC]\d{10,14}$/i, name: "Amazon" },
    { pattern: /^JD\d{16,20}$/i, name: "DHL" },
    { pattern: /^LP\d{14,16}$/i, name: "AliExpress / Cainiao" },
    { pattern: /^[689][A-Z][0-9A-Z]{11,13}$/i, name: "Colissimo" },
];

const TRACKING_STATUS: Array<{ label: string; match: RegExp }> = [
    {
        label: "Livré",
        match: /(colis (?:a [ée]t[ée] |a bien [ée]t[ée] )?livr[ée]|livr[ée] le|delivered|remis au destinataire)/i,
    },
    {
        label: "Échec de livraison",
        match: /([ée]chec de livraison|n'a pas pu [êe]tre livr[ée]|livraison (?:impossible|infructueuse)|delivery (?:failed|unsuccessful|attempt))/i,
    },
    {
        label: "Disponible en point relais",
        match: /(disponible en point|available for pickup|en attente de retrait|pr[êe]t [àa] [êe]tre retir[ée])/i,
    },
    { label: "En cours de livraison", match: /(en cours de livraison|out for delivery|sera livr[ée])/i },
    {
        label: "Retard signalé",
        match: /(retard de livraison|livraison retard[ée]e|prend un peu de temps|un peu de retard|delayed)/i,
    },
    {
        label: "En transit",
        match: /(en cours d.acheminement|en transit|in transit|a quitt[ée]|en route)/i,
    },
    {
        label: "Pris en charge",
        match: /(pris en charge|colis accept[ée]|en pr[ée]paration|pr[ée]paration de votre commande|order processed|shipment information received)/i,
    },
    { label: "Expédié", match: /(exp[ée]di[ée]|shipped|dispatched)/i },
    {
        label: "Commande confirmée",
        match: /(commande\s+(?:confirm[ée]e|enregistr[ée]e|re[çc]ue|valid[ée]e)|merci pour (?:votre|ta) commande|order\s+confirmed|thank you for your order)/i,
    },
];

const SINGLE_DATE_TOKEN =
    "(?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\\s+)?(?:\\d{1,2}[/.\\s-]\\d{1,2}(?:[/.\\s-]\\d{2,4})?|\\d{1,2}\\s+(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)(?:\\s+20\\d{2})?|aujourd['’]hui|demain)";

const TIME_SLOT_TOKEN =
    "(?:(?:entre|de|à partir de)?\\s*\\d{1,2}(?:[:h]\\d{2}|h)\\s*(?:et|à|[-–—])\\s*\\d{1,2}(?:[:h]\\d{2}|h)|(?:avant|à)\\s*\\d{1,2}(?:[:h]\\d{2}|h))";

const DELIVERY_LABEL_PREFIX =
    "(?:date\\s+(?:pr[ée]vue|estim[ée]e|attendue|pr[ée]visionnelle)\\s+(?:de|pour\\s+la)\\s+livraison|(?:date\\s+de\\s+)?livraison\\s+(?:pr[ée]vue|estim[ée]e|pr[ée]visionnelle|attendue)|estimated\\s+delivery(?:\\s+date)?|arriv[ée]e\\s+(?:pr[ée]vue|estim[ée]e?)|sera\\s+livr[ée]|livr[ée]\\s+(?:entre|du)|livraison\\s+(?=demain|aujourd))";

const DELIVERY_RANGE_RE = new RegExp(
    `${DELIVERY_LABEL_PREFIX}[\\s\\S]{0,45}?(?:entre\\s+(?:le\\s+)?|du\\s+|between\\s+)?(${SINGLE_DATE_TOKEN})\\s*(?:et|au|and|[-–—])\\s*(?:le\\s+)?(${SINGLE_DATE_TOKEN})`,
    "i"
);

const DELIVERY_DATE_WITH_TIME_RE = new RegExp(
    `${DELIVERY_LABEL_PREFIX}[\\s\\S]{0,35}?(?:le|:|-)?\\s*(${SINGLE_DATE_TOKEN})(?:[,\\s]{1,10}(${TIME_SLOT_TOKEN}))?`,
    "i"
);

const TIME_SLOT_STANDALONE_RE = new RegExp(TIME_SLOT_TOKEN, "i");

function formatCityName(raw: string): string {
    const cleaned = raw
        .replace(/\s+cedex(?:\s+\d+)?$/i, "")
        .replace(/[.,;:]+$/, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!cleaned) return "";
    if (cleaned === cleaned.toUpperCase()) {
        return cleaned
            .toLowerCase()
            .replace(/(^|[\s-])([a-zà-öø-ÿ])/g, (_m, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`);
    }
    return cleaned;
}

const NON_CITY_WORDS =
    /\b(?:facture|commande|livraison|colis|suivi|adresse|votre|notre|bonjour|merci|cliquez|voir|t[ée]l[ée]charger|num[ée]ro|article|produit|montant|total|date|statut|client|france|nouvelle-cal[ée]donie|new caledonia|cedex|email|tel|bp|exp[ée]dition|destinataire|facturation|paiement)\b/i;

function isValidCityCandidate(city: string): boolean {
    if (city.length < 2 || city.length > 35) return false;
    if (!/[a-zA-ZÀ-ÿ]{2,}/.test(city)) return false;
    if (NON_CITY_WORDS.test(city)) return false;
    return true;
}

const POSTAL_CITY_RE =
    /\b(?:FR-)?(\d{5})(?:[ \t]*[-–—,][ \t]*|[ \t]+)([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’ -]{1,35}?)(?=[ \t]*(?:\r?\n|,|France|Nouvelle-Cal[ée]donie|New Caledonia|\d|$))/g;

const CITY_POSTAL_RE =
    /\b([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’ -]{2,35}?)(?:[ \t]*[-–—,][ \t]*|[ \t]+)(?:FR-)?(\d{5})\b/g;

function extractCityFromBlock(block: string): string | null {
    POSTAL_CITY_RE.lastIndex = 0;
    for (const m of block.matchAll(POSTAL_CITY_RE)) {
        const city = formatCityName(m[2] ?? "");
        if (isValidCityCandidate(city)) return city;
    }
    CITY_POSTAL_RE.lastIndex = 0;
    for (const m of block.matchAll(CITY_POSTAL_RE)) {
        const city = formatCityName(m[1] ?? "");
        if (isValidCityCandidate(city)) return city;
    }
    return null;
}

/** Extrait la ville de livraison depuis l'adresse de livraison de l'email. */
function extractDeliveryCity(text: string): string | null {
    if (!text) return null;
    const deliverySectionRe =
        /(?:adresse\s+de\s+livraison|lieu\s+de\s+livraison|adresse\s+d.exp[ée]dition|adresse\s+d.envoi|livr[ée]\s+[àa]|livraison\s+[àa]|shipping\s+address|delivery\s+address|ship\s+to|deliver\s+to|destinataire)\b([\s\S]{0,450})/gi;

    for (const section of text.matchAll(deliverySectionRe)) {
        const block = section[1] ?? "";
        const found = extractCityFromBlock(block);
        if (found) return found;
    }

    POSTAL_CITY_RE.lastIndex = 0;
    for (const m of text.matchAll(POSTAL_CITY_RE)) {
        const idx = m.index ?? 0;
        const before = text.slice(Math.max(0, idx - 120), idx);
        if (/(?:facturation|billing|si[èe]ge\s+social|rcs|siret)/i.test(before)) continue;
        const city = formatCityName(m[2] ?? "");
        if (isValidCityCandidate(city)) return city;
    }

    return null;
}

const WEEKDAY_ABBR: Record<string, string> = {
    lundi: "lun.",
    mardi: "mar.",
    mercredi: "mer.",
    jeudi: "jeu.",
    vendredi: "ven.",
    samedi: "sam.",
    dimanche: "dim.",
};

const MONTH_ABBR: Record<string, string> = {
    janvier: "janv.",
    fevrier: "févr.",
    février: "févr.",
    mars: "mars",
    avril: "avr.",
    mai: "mai",
    juin: "juin",
    juillet: "juil.",
    aout: "août",
    août: "août",
    septembre: "sept.",
    octobre: "oct.",
    novembre: "nov.",
    decembre: "déc.",
    décembre: "déc.",
};

function normalizeTimeToken(raw: string): string {
    const match = raw.trim().match(/^(\d{1,2})(?:[:h](\d{2})|h)?$/i);
    if (!match) return raw.trim();
    const hour = String(Number(match[1]));
    const min = match[2];
    return min && min !== "00" ? `${hour}h${min}` : `${hour}h`;
}

function formatCompactDateToken(raw: string): string {
    let out = raw.replace(/\s+/g, " ").trim().replace(/^le\s+/i, "");
    // Numeric date: DD/MM(/YYYY) or DD-MM(-YYYY)
    const numMatch = out.match(
        /^(?:(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+)?(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?$/i
    );
    if (numMatch) {
        const day = Number(numMatch[2]);
        const month = Number(numMatch[3]);
        const yearRaw = numMatch[4];
        const year = yearRaw
            ? yearRaw.length === 2
                ? 2000 + Number(yearRaw)
                : Number(yearRaw)
            : new Date().getFullYear();
        const d = new Date(year, month - 1, day);
        if (!Number.isNaN(d.getTime())) {
            const formatted = new Intl.DateTimeFormat("fr-FR", {
                weekday: "short",
                day: "numeric",
                month: "short",
            }).format(d);
            return formatted.replace(/\s+/g, " ").trim();
        }
    }

    out = out.replace(
        /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/gi,
        (m) => WEEKDAY_ABBR[m.toLowerCase()] ?? m
    );
    out = out.replace(
        /\b(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\b/gi,
        (m) => MONTH_ABBR[m.toLowerCase()] ?? m
    );
    out = out.replace(/\s+20\d{2}\b/, "");
    return out.trim();
}

function formatCompactTimeSlot(raw: string): string {
    let out = raw.replace(/\s+/g, " ").trim();
    const range = out.match(
        /^(?:entre|de|à partir de)?\s*(\d{1,2}(?:[:h]\d{2}|h))\s*(?:et|à|[-–—])\s*(\d{1,2}(?:[:h]\d{2}|h))$/i
    );
    if (range) {
        return `${normalizeTimeToken(range[1])}-${normalizeTimeToken(range[2])}`;
    }
    const single = out.match(/^(avant|à)\s+(\d{1,2}(?:[:h]\d{2}|h))$/i);
    if (single) {
        return `${single[1].toLowerCase()} ${normalizeTimeToken(single[2])}`;
    }
    return out;
}

function extractEstimatedDelivery(text: string): string | null {
    const rangeMatch = text.match(DELIVERY_RANGE_RE);
    if (rangeMatch?.[1] && rangeMatch?.[2]) {
        return `${formatCompactDateToken(rangeMatch[1])} – ${formatCompactDateToken(rangeMatch[2])}`;
    }
    const singleMatch = text.match(DELIVERY_DATE_WITH_TIME_RE);
    if (!singleMatch?.[1]) return null;
    const datePart = formatCompactDateToken(singleMatch[1]);
    let timePart = singleMatch[2]?.replace(/\s+/g, " ").trim();
    if (!timePart && singleMatch.index !== undefined) {
        const after = text.slice(
            singleMatch.index + singleMatch[0].length,
            singleMatch.index + singleMatch[0].length + 60
        );
        const nearbyTime = after.match(TIME_SLOT_STANDALONE_RE);
        if (nearbyTime?.[0]) {
            timePart = nearbyTime[0].replace(/\s+/g, " ").trim();
        }
    }
    const compactTime = timePart ? formatCompactTimeSlot(timePart) : "";
    return compactTime ? `${datePart} ${compactTime}` : datePart;
}

function urlsInText(text: string): string[] {
    return (text.match(/https?:\/\/[^\s<>"')]+/gi) ?? []).map((url) =>
        url.replace(/[.,;:!?]+$/, "")
    );
}

function trackingNumbersIn(text: string): string[] {
    const found = new Set<string>();
    for (const pattern of TRACKING_PATTERNS) {
        for (const match of text.matchAll(pattern)) found.add(match[0].toUpperCase());
    }
    for (const match of text.matchAll(TRACKING_KEYWORD_NUMBER)) {
        const value = match[1].toUpperCase().replace(/[-\s]+$/, "");
        const digits = (value.match(/\d/g) ?? []).length;
        if (value.length >= 8 && digits >= 4) found.add(value);
    }
    return [...found].slice(0, 3);
}

/** Magasin à l'origine de la commande (nom affiché ou domaine). */
function storeFromSender(fromName: string, fromEmail: string): string | null {
    const name = (fromName ?? "").trim();
    if (name && !name.includes("@") && !CARRIER_SENDER.test(name)) {
        return name.slice(0, 60);
    }
    const domain = (fromEmail.split("@")[1] ?? "").toLowerCase();
    if (!domain || CARRIER_SENDER.test(domain)) return null;
    const root = domain
        .split(".")
        .filter(
            (part) =>
                part &&
                !["www", "mail", "email", "news", "shop", "e", "no-reply", "noreply", "info"].includes(part)
        )[0];
    if (!root) return null;
    return root
        .replace(/[-_]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
        .slice(0, 60);
}

const HISTORY_DATE =
    /(?:\d{1,2}[\/.\s-]\d{1,2}(?:[\/.\s-]\d{2,4})?|\d{1,2}\s+(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)(?:\s+20\d{2})?)/i;

/** Étapes de suivi lisibles dans le corps de l'email (lignes datées + statut). */
function trackingHistory(body: string): string[] {
    const events: string[] = [];
    const lines = body
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter((line) => line.length >= 8 && line.length <= 160);

    for (const line of lines) {
        if (!HISTORY_DATE.test(line)) continue;
        if (!TRACKING_STATUS.some((entry) => entry.match.test(line))) continue;
        if (events.includes(line)) continue;
        events.push(line);
        if (events.length >= 8) break;
    }

    if (events.length === 0) {
        for (const line of lines) {
            if (!TRACKING_STATUS.some((entry) => entry.match.test(line))) continue;
            if (events.includes(line)) continue;
            events.push(line);
            if (events.length >= 3) break;
        }
    }

    return events;
}

function htmlLinksIn(html: string): Array<{ url: string; label: string }> {
    if (!html) return [];
    const results: Array<{ url: string; label: string }> = [];
    const linkRe = /<a\b[^>]*\bhref\s*=\s*(?:"(https?:\/\/[^"]+)"|'(https?:\/\/[^']+)')[^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(linkRe)) {
        const rawUrl = (match[1] ?? match[2] ?? "").replace(/&amp;/gi, "&").trim();
        const label = (match[3] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (rawUrl) results.push({ url: rawUrl, label });
    }
    return results;
}

const EXCLUDED_TRACKING_LINK =
    /(unsubscribe|d[ée]sabon|privacy|confidentialit|terms|cgv|cgu|facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com|tiktok\.com|pinterest\.com)/i;

const TRACKING_LINK_SIGNAL =
    /(suivi|suivre|track|colis|shipment|parcel|expedition|delivery|parcellab|sendcloud|narvar|aftership|laposte|colissimo|chronopost|dhl|ups|fedex|dpd|mondialrelay|gls)/i;

const ORDER_NUMBER_PATTERNS: RegExp[] = [
    /(?:n[°o]\s*(?:de\s*)?commande|num[ée]ro\s*(?:de\s*)?commande|r[ée]f[ée]rence\s*(?:de\s*)?commande|commande\s*(?:n[°o]|num[ée]ro|ref|r[ée]f[ée]rence|id)|order\s*(?:number|no|num[ée]ro|id))\s*[:#\s-]*#?([A-Z0-9][A-Z0-9._-]{2,28})/gi,
    /(?:commande|order)\s*#\s*([A-Z0-9][A-Z0-9._-]{2,28})/gi,
];

function isValidOrderNumberCandidate(raw: string): boolean {
    const cleaned = raw.trim().replace(/[.,;:!?)\]]+$/, "");
    if (cleaned.length < 3 || cleaned.length > 30) return false;
    if (!/\d/.test(cleaned)) return false;
    if (/^20\d{2}$/.test(cleaned)) return false;
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(cleaned)) return false;
    if (/^(?:EUR|USD|XPF|CHF|GBP|HTTP|HTTPS)$/i.test(cleaned)) return false;
    return true;
}

/** Extrait le numéro de commande depuis l'objet ou le corps de l'email. */
function extractOrderNumber(input: { subject: string; text: string }): string | null {
    const sources = [input.subject, input.text];
    for (const source of sources) {
        if (!source) continue;
        for (const pattern of ORDER_NUMBER_PATTERNS) {
            pattern.lastIndex = 0;
            for (const match of source.matchAll(pattern)) {
                const candidate = (match[1] ?? "").trim().replace(/[.,;:!?)\]]+$/, "");
                if (isValidOrderNumberCandidate(candidate)) {
                    return candidate.toUpperCase();
                }
            }
        }
    }
    if (/(commande|order|exp[ée]di|livraison|colis)/i.test(input.subject)) {
        const hashMatch = input.subject.match(/#([A-Z0-9][A-Z0-9._-]{2,24})/i);
        if (hashMatch && isValidOrderNumberCandidate(hashMatch[1])) {
            return hashMatch[1].toUpperCase();
        }
    }
    return null;
}

const EXCLUDED_IMAGE_URL =
    /(?:1x1|pixel|spacer|transparent|beacon|wf\/open|email-open|doubleclick|facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com|tiktok\.com|pinterest\.com|whatsapp|app-store|appstore|google-play|play-store|trustpilot|visa|mastercard|paypal|amex|klarna|apple-pay|favicon)/i;

const EXCLUDED_IMAGE_ALT_OR_CLASS =
    /\b(?:logo|favicon|wordmark|facebook|instagram|twitter|tiktok|youtube|linkedin|pinterest|whatsapp|social|banner|badge|icon|arrow|star|rating)\b/i;

function parseHtmlAttr(tag: string, name: string): string {
    const re = new RegExp(`(?<![a-z-])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
    const match = tag.match(re);
    return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function parsePixelSize(raw: string): number | null {
    if (!raw) return null;
    const m = raw.match(/(\d+)/);
    return m ? Number(m[1]) : null;
}

function decodeBasicEntities(raw: string): string {
    return raw
        .replace(/&amp;/gi, "&")
        .replace(/&nbsp;/gi, " ")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;|&rsquo;|&lsquo;/gi, "'")
        .replace(/&ndash;|&mdash;/gi, "-")
        .replace(/&eacute;/gi, "é")
        .replace(/&egrave;/gi, "è")
        .replace(/&ecirc;/gi, "ê")
        .replace(/&agrave;/gi, "à")
        .replace(/&ccedil;/gi, "ç")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const GENERIC_IMAGE_ALT =
    /^(?:image|photo|img|picture|product|produit|item|article|thumbnail|aperçu|visuel)$/i;

const NON_PRODUCT_LINE =
    /^(?:qty|quantit[ée]|qt[ée]|prix|price|total|sous-total|subtotal|livraison|shipping|taille|size|couleur|color|colis|suivi|voir|view|commander|order|x\s*\d+|\d+(?:[.,]\d{2})?\s*(?:€|eur|usd|\$|£|xpf))/i;

function extractNearbyProductLabel(html: string, afterIndex: number): string | null {
    const slice = html.slice(afterIndex, afterIndex + 2200);
    if (!slice) return null;
    const withBreaks = slice.replace(/<(?:br|\/p|\/div|\/td|\/tr|\/li|\/h[1-6]|\/a)\b[^>]*>/gi, "\n");
    const lines = withBreaks
        .split(/\n/)
        .map((line) => decodeBasicEntities(line))
        .filter((line) => line.length >= 4 && line.length <= 90);
    for (const line of lines) {
        if (!/[a-zA-ZÀ-ÿ]{3,}/.test(line)) continue;
        if (/^https?:\/\//i.test(line)) continue;
        if (NON_PRODUCT_LINE.test(line)) continue;
        if (EXCLUDED_IMAGE_ALT_OR_CLASS.test(line)) continue;
        return line;
    }
    return null;
}

/** Extrait les visuels et intitulés des produits commandés depuis le HTML de l'email. */
function extractProductVisuals(html: string): {
    images: string[];
    imageLabels: Record<string, string>;
    productTitle: string | null;
} {
    if (!html) return { images: [], imageLabels: {}, productTitle: null };
    const scored: Array<{ url: string; score: number; label: string | null }> = [];
    const seen = new Set<string>();
    const imgRe = /<img\b[^>]*>/gi;

    for (const match of html.matchAll(imgRe)) {
        const tag = match[0];
        const rawSrc = (parseHtmlAttr(tag, "src") || parseHtmlAttr(tag, "data-src"))
            .replace(/&amp;/gi, "&")
            .trim();
        if (!rawSrc) continue;
        const isAllowedSrc =
            /^https?:\/\//i.test(rawSrc) ||
            rawSrc.startsWith("/api/gmail/attachment?") ||
            /^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(rawSrc);
        if (!isAllowedSrc) continue;
        if (EXCLUDED_IMAGE_URL.test(rawSrc)) continue;
        if (/[/_-](?:logo|favicon|spacer|pixel|icon|arrow|badge)[._/-]/i.test(rawSrc)) continue;

        const alt = decodeBasicEntities(parseHtmlAttr(tag, "alt"));
        const className = parseHtmlAttr(tag, "class");
        const style = parseHtmlAttr(tag, "style");
        if (EXCLUDED_IMAGE_ALT_OR_CLASS.test(`${alt} ${className}`)) continue;

        const width =
            parsePixelSize(parseHtmlAttr(tag, "width")) ??
            parsePixelSize(style.match(/(?<![a-z-])width\s*:\s*(\d+)\s*px/i)?.[1] ?? "");
        const height =
            parsePixelSize(parseHtmlAttr(tag, "height")) ??
            parsePixelSize(style.match(/(?<![a-z-])height\s*:\s*(\d+)\s*px/i)?.[1] ?? "");

        if ((width !== null && width < 48) || (height !== null && height < 48)) continue;

        if (seen.has(rawSrc)) continue;
        seen.add(rawSrc);

        const cleanAlt =
            alt.length >= 4 && alt.length <= 90 && !GENERIC_IMAGE_ALT.test(alt) ? alt : null;
        const label =
            cleanAlt ??
            (match.index !== undefined
                ? extractNearbyProductLabel(html, match.index + tag.length)
                : null);

        let score = 0;
        if ((width !== null && width >= 80) || (height !== null && height >= 80)) score += 3;
        if (cleanAlt) score += 2;
        if (/(?:product|item|cdn|shopify|media|catalog|goods|article|upload|thumb|image)/i.test(rawSrc)) {
            score += 2;
        }
        if (/\.(?:jpe?g|webp|png)(?:\?|$)/i.test(rawSrc)) score += 1;

        scored.push({ url: rawSrc, score, label });
    }

    const top = scored.sort((a, b) => b.score - a.score).slice(0, 4);
    const images = top.map((entry) => entry.url);
    const imageLabels: Record<string, string> = {};
    const titles: string[] = [];
    for (const entry of top) {
        if (entry.label) {
            imageLabels[entry.url] = entry.label;
            if (!titles.includes(entry.label)) titles.push(entry.label);
        }
    }
    const productTitle = titles.length > 0 ? titles.slice(0, 2).join(" · ") : null;

    return { images, imageLabels, productTitle };
}

function extractProductTitleFromText(text: string): string | null {
    if (!text) return null;
    // Ex: "1 x Tromso Backpack Sandstone" ou "1x Sac à dos..."
    const qtyMatch = text.match(
        /(?:^|\n)\s*\d{1,2}\s*[x×]\s+([A-ZÀ-ÖØ-Ý0-9][^\n]{3,75})/m
    );
    if (qtyMatch?.[1]) {
        const candidate = qtyMatch[1].replace(/\s+\d+[.,]\d{2}\s*(?:€|eur|\$|£|xpf).*$/i, "").trim();
        if (candidate.length >= 4 && !NON_PRODUCT_LINE.test(candidate)) {
            return candidate;
        }
    }
    return null;
}

/**
 * Reconnaît un suivi de colis et rassemble les informations utiles
 * (transporteur, numéro, statut, date de livraison, lien de suivi, visuels).
 */
export function extractTracking(input: {
    subject: string;
    fromEmail: string;
    fromName: string;
    text: string;
    html?: string;
    date?: Date | string | null;
}): GmailTracking | null {
    const body = input.text ?? "";
    const sender = `${input.fromEmail} ${input.fromName}`;
    const htmlLinks = htmlLinksIn(input.html ?? "");
    const textUrls = urlsInText(body);
    const allUrls = [...new Set([...htmlLinks.map((l) => l.url), ...textUrls])];

    const numbers = trackingNumbersIn(`${body}\n${allUrls.join("\n")}`);
    const orderNumber = extractOrderNumber({ subject: input.subject, text: body });
    const { images, imageLabels, productTitle: visualProductTitle } = extractProductVisuals(
        input.html ?? ""
    );
    const productTitle = visualProductTitle ?? extractProductTitleFromText(body);

    const signature = SIGNATURE_CARRIERS.find((entry) =>
        numbers.some((number) => entry.pattern.test(number))
    );
    const carrier =
        CARRIERS.find((rule) => rule.sender.test(sender)) ??
        (signature ? CARRIERS.find((rule) => rule.name === signature.name) : undefined) ??
        CARRIERS.find((rule) => rule.host && allUrls.some((url) => rule.host!.test(url)));

    const rawStatus =
        TRACKING_STATUS.find((entry) => entry.match.test(`${input.subject}\n${body}`))?.label ??
        null;
    const estimatedDelivery = extractEstimatedDelivery(`${input.subject}\n${body}`);
    const status =
        rawStatus === "En cours de livraison" &&
        estimatedDelivery &&
        /sera\s+livr[ée]/i.test(`${input.subject}\n${body}`)
            ? `Sera livré ${estimatedDelivery}`
            : rawStatus;
    const htmlPlain = input.html ? htmlToText(input.html) : "";
    const deliveryCity =
        extractDeliveryCity(body) ?? (htmlPlain ? extractDeliveryCity(htmlPlain) : null);

    const byHost = carrier?.host ? allUrls.find((url) => carrier.host!.test(url)) : undefined;
    const byAnchor = htmlLinks.find(
        (l) => !EXCLUDED_TRACKING_LINK.test(l.url) && TRACKING_LINK_SIGNAL.test(l.label)
    )?.url;
    const byKeyword = allUrls.find(
        (url) => !EXCLUDED_TRACKING_LINK.test(url) && TRACKING_LINK_SIGNAL.test(url)
    );
    const byTemplate =
        carrier?.url && numbers.length > 0 ? carrier.url(numbers[0]) : null;
    const url = byHost ?? byAnchor ?? byKeyword ?? byTemplate ?? null;

    if (!carrier && numbers.length === 0 && !status && !estimatedDelivery && !url && !orderNumber) {
        return null;
    }

    const parsedDate = input.date ? new Date(input.date) : null;
    const datePrefix =
        parsedDate && !Number.isNaN(parsedDate.getTime())
            ? new Intl.DateTimeFormat("fr-FR", {
                  day: "numeric",
                  month: "short",
              })
                  .format(parsedDate)
                  .replace(/\.$/, "")
            : null;

    const fullText = `${input.subject}\n${body}`;
    const conciseEvent = (() => {
        const scheduledMatch = fullText.match(
            /(sera livr[ée][^\n.!?]{0,65})/i
        );
        if (scheduledMatch) {
            if (estimatedDelivery) {
                return `Sera livré ${estimatedDelivery}`;
            }
            return scheduledMatch[1].replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase());
        }
        const failDetailMatch = fullText.match(
            /([ée]chec de livraison[^\n.!?]{0,50}|colis n['’]a pas pu [êe]tre livr[ée][^\n.!?]{0,30})/i
        );
        if (failDetailMatch) {
            return failDetailMatch[1].replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase());
        }
        if (/prend un peu de temps/i.test(fullText)) return "Colis prend un peu de temps";
        if (status === "Retard signalé") return "Colis prend un peu de temps";
        if (status === "En transit" || status === "Expédié") return "Colis en route";
        if (status === "Pris en charge") return "Colis en préparation";
        if (status === "Livré") return "Colis livré";
        if (status) return status;

        // Dernier recours : objet nettoyé (sans nom de boutique ni n° de commande), court.
        const cleanedSubj = input.subject
            .replace(/^[^-–—:]{2,35}\s*[-–—:]\s*/, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 60);
        return cleanedSubj || "Mise à jour commande";
    })();

    const emailEvent = datePrefix ? `${datePrefix} · ${conciseEvent}` : conciseEvent;
    const history = [emailEvent];

    return {
        store: storeFromSender(input.fromName, input.fromEmail),
        orderNumber,
        carrier: carrier?.name ?? null,
        numbers,
        status,
        estimatedDelivery,
        deliveryCity,
        history,
        url,
        images,
        productTitle,
        imageLabels,
    };
}

/**
 * Extrait transporteur, numéros de suivi (ex. Colissimo) et statut depuis une page de suivi externe.
 */
export function extractTrackingFromExternalPage(pageText: string, finalUrl: string): {
    numbers: string[];
    carrier: string | null;
    status: string | null;
    directCarrierUrl: string | null;
} {
    const combined = `${finalUrl}\n${pageText}`;
    const numbers = trackingNumbersIn(combined);

    const signature = SIGNATURE_CARRIERS.find((entry) =>
        numbers.some((number) => entry.pattern.test(number))
    );
    const carrierRule =
        (signature ? CARRIERS.find((rule) => rule.name === signature.name) : undefined) ??
        CARRIERS.find((rule) => rule.sender.test(combined) || (rule.host && rule.host.test(finalUrl)));

    const status = TRACKING_STATUS.find((entry) => entry.match.test(pageText))?.label ?? null;
    const directCarrierUrl =
        carrierRule?.url && numbers.length > 0 ? carrierRule.url(numbers[0]) : null;

    return {
        numbers,
        carrier: carrierRule?.name ?? null,
        status,
        directCarrierUrl,
    };
}

/* ---------------------- Bibliothèque (BM Lyon) ---------------------- */

const LIBRARY_SENDER = /@(?:[\w-]+\.)*bm-lyon\.fr$/i;

const LOAN_DATE =
    /(\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}|\d{1,2}\s+(?:janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+\d{4})/i;

const LOAN_LABEL =
    /^(?:titre|document|ouvrage|auteur|cote|support|date de retour|retour|[àa] rendre|[ée]ch[ée]ance|emprunt)\b\s*[:\-]?/i;

const LOAN_MONTHS: Record<string, number> = {
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

function loanIsoDate(raw: string): string | null {
    const numeric = raw.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
    if (numeric) {
        const day = Number(numeric[1]);
        const month = Number(numeric[2]);
        let year = Number(numeric[3]);
        if (year < 100) year += 2000;
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
            return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
        return null;
    }
    const long = raw.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
    if (long) {
        const month = LOAN_MONTHS[long[2].toLowerCase()];
        const day = Number(long[1]);
        if (month && day >= 1 && day <= 31) {
            return `${long[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
    }
    return null;
}

/** Écart entre la colonne « Titre » et « Date de retour » d'un tableau. */
function loanTableOffset(lines: string[]): number | null {
    for (let header = 0; header < lines.length; header += 1) {
        if (!/^titre\s*$/i.test(lines[header])) continue;
        for (let cursor = header + 1; cursor <= Math.min(lines.length - 1, header + 5); cursor += 1) {
            if (/^(?:date de retour|retour)$/i.test(lines[cursor])) {
                return cursor - header;
            }
        }
    }
    return null;
}

/** Titre (et auteur) rattaché à une ligne de date de retour. */
function loanTitle(
    lines: string[],
    index: number,
    tableOffset: number | null
): { title: string; author: string | null } | null {
    const windowStart = Math.max(0, index - 8);
    for (let cursor = index; cursor >= windowStart; cursor -= 1) {
        const labelled = lines[cursor].match(/^(?:titre|document|ouvrage)\s*[:\-]\s*(.+)$/i);
        if (!labelled) continue;
        // Auteur le plus proche (au-dessus ou en dessous du titre).
        const authors: Array<{ distance: number; value: string }> = [];
        for (let offset = -3; offset <= 4; offset += 1) {
            const line = lines[cursor + offset];
            if (!line) continue;
            const match = line.match(/^auteur\s*[:\-]\s*(.+)$/i);
            if (match) authors.push({ distance: Math.abs(offset), value: match[1].trim() });
        }
        authors.sort((a, b) => a.distance - b.distance);
        return { title: labelled[1].trim(), author: authors[0]?.value ?? null };
    }

    // Tableau « Titre / Auteur / Date de retour » : la ligne du titre est
    // décalée du même nombre de lignes que l'en-tête.
    if (tableOffset && index - tableOffset >= 0) {
        const candidate = lines[index - tableOffset];
        if (
            candidate &&
            candidate.length >= 3 &&
            candidate.length <= 140 &&
            !LOAN_DATE.test(candidate) &&
            !LOAN_LABEL.test(candidate) &&
            /[A-Za-zÀ-ÿ]/.test(candidate)
        ) {
            const author = lines[index - tableOffset + 1];
            const usableAuthor =
                author && !LOAN_DATE.test(author) && !LOAN_LABEL.test(author) && author.length <= 80
                    ? author
                    : null;
            return { title: candidate, author: usableAuthor };
        }
    }

    let before = lines[index]
        .split(LOAN_DATE)[0]
        .replace(
            /\s*(?:[-–—|:]\s*)?(?:date de retour|retour|[àa] rendre|[ée]ch[ée]ance)(?:\s*(?:le|:|-))?\s*$/i,
            ""
        )
        .replace(/[|·•\-–—:\s]+$/, "")
        .trim();

    if (before.length >= 3 && !LOAN_LABEL.test(before)) {
        const parts = before.split(/\s+[-–—|]\s+/);
        if (parts.length >= 2 && parts[0].length >= 3 && parts[1].length >= 2) {
            before = parts[0].trim();
            return { title: before, author: parts[1].trim() };
        }
        const inParentheses = before.match(/^(.+?)\s*\(([^)]+)\)$/);
        if (inParentheses) {
            return { title: inParentheses[1].trim(), author: inParentheses[2].trim() };
        }
        return { title: before, author: null };
    }

    for (let cursor = index - 1; cursor >= Math.max(0, index - 4); cursor -= 1) {
        const line = lines[cursor];
        if (LOAN_DATE.test(line)) continue;
        if (LOAN_LABEL.test(line)) continue;
        if (line.length < 3 || line.length > 140) continue;
        if (!/[A-Za-zÀ-ÿ]/.test(line)) continue;
        return { title: line, author: null };
    }

    return null;
}

/**
 * Liste des livres empruntés dans un email de bibliothèque (BM Lyon),
 * avec la date de retour de chaque ouvrage.
 */
export function extractBookLoans(input: {
    subject: string;
    fromEmail: string;
    text: string;
}): GmailBookLoan[] {
    if (!LIBRARY_SENDER.test(input.fromEmail)) return [];

    const lines = input.text
        .replace(/\r/g, "")
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean);

    if (lines.length === 0) return [];
    if (!/(pr[êe]t|emprunt|rendre|retour|biblioth[èe]que)/i.test(`${input.subject} ${input.text}`)) {
        return [];
    }

    const loans: GmailBookLoan[] = [];
    const seen = new Set<string>();
    const tableOffset = loanTableOffset(lines);

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const match = line.match(LOAN_DATE);
        if (!match) continue;
        if (/emprunt|inscription|naissance|carte/i.test(line)) continue;

        const picked = loanTitle(lines, index, tableOffset);
        if (!picked) continue;

        const key = picked.title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        loans.push({
            title: picked.title.slice(0, 140),
            author: picked.author ? picked.author.slice(0, 80) : null,
            dueDate: loanIsoDate(match[1]),
            dueLabel: match[1].trim(),
        });

        if (loans.length >= 15) break;
    }

    return loans;
}

function headerValue(headers: string, name: string): string {
    const regex = new RegExp(`^${name}:\\s*(.+)$`, "im");
    const match = headers.match(regex);
    return match ? match[1].trim() : "";
}

function decodeQuotedPrintableSnippet(raw: string): string {
    const joined = raw.replace(/=\r?\n/g, "");
    try {
        const bytes: number[] = [];
        for (let i = 0; i < joined.length; i += 1) {
            if (
                joined[i] === "=" &&
                i + 2 < joined.length &&
                /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))
            ) {
                bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
                i += 2;
            } else {
                const code = joined.charCodeAt(i);
                if (code < 128) {
                    bytes.push(code);
                } else {
                    const utf8 = Buffer.from(joined[i], "utf8");
                    for (const b of utf8) bytes.push(b);
                }
            }
        }
        return Buffer.from(bytes).toString("utf8");
    } catch {
        return joined;
    }
}

function extractBodySnippet(raw: string): string {
    if (!raw) return "";
    const decoded = decodeQuotedPrintableSnippet(raw);
    const withoutHeaders = decoded
        .replace(/^--[^\n]+$/gm, " ")
        .replace(/^(?:Content-Type|Content-Transfer-Encoding|Content-Disposition|MIME-Version):[^\n]*$/gim, " ");
    return htmlToText(withoutHeaders).slice(0, 1200);
}

/**
 * Classe un message en inspectant en-têtes, expéditeur, objet ET extrait du contenu.
 */
export function classifyMessage(
    fromEmail: string,
    subject: string,
    headers: string,
    bodySnippet = ""
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
    const snippetHead = bodySnippet.slice(0, 600);
    const combinedText = `${subject}\n${snippetHead}`;
    const looksAutomated =
        NO_REPLY_LOCAL.test(localPart) || AUTO_BODY_MARKERS.test(bodySnippet);

    const promoSubject = PROMO_SUBJECT.test(subject);
    const hasSeveralRecipients = /,/.test(headerValue(headers, "to"));
    const isQuestion =
        subject.includes("?") ||
        /^(question|demande|renseignements?|peux-tu|pouvez-vous|pourriez-vous|merci de|besoin de|confirmer|valider)\b/i.test(
            subject.trim()
        ) ||
        /\b(peux-tu|pouvez-vous|pourriez-vous|dis-moi|dites-moi|qu'en penses-tu|merci de me|merci de nous|merci d'avance|est-ce que|seriez-vous)\b/i.test(
            snippetHead
        );

    // 1. Alertes de sécurité, connexions et partages de données de compte (prioritaire même si list-headers).
    if (
        ALERT_SUBJECT.test(subject) ||
        ALERT_SUBJECT.test(snippetHead) ||
        ALERT_SENDER.test(fromEmail)
    ) {
        return {
            category: "alertes",
            needsReply: false,
            reason: "Alerte de sécurité ou partage de données de compte",
        };
    }

    // 2. Suivi de colis / commandes.
    if (
        !promoSubject &&
        (STRONG_TRACKING_SUBJECT.test(subject) ||
            STRONG_TRACKING_SUBJECT.test(snippetHead) ||
            Boolean(extractOrderNumber({ subject, text: snippetHead })) ||
            (CARRIER_SENDER.test(fromEmail) && TRACKING_TOPIC.test(combinedText)))
    ) {
        return {
            category: "commande",
            needsReply: false,
            reason: trackingReason(fromEmail),
        };
    }

    // 3. Échéanciers annuels, contrats, documents de référence (à lire, pas facture ni pub).
    if (REGULATORY_OR_ECHEANCIER.test(subject) || REGULATORY_OR_ECHEANCIER.test(snippetHead)) {
        return {
            category: "infos",
            needsReply: false,
            reason: "Document contractuel, échéancier ou mise à jour réglementaire (à lire)",
        };
    }

    // 4. Factures EEC, Calédonienne des eaux, OPT et Lagoon.
    if (
        (NC_INVOICE_PROVIDER.test(fromEmail) ||
            NC_INVOICE_PROVIDER.test(subject) ||
            NC_INVOICE_PROVIDER.test(bodySnippet)) &&
        (FACTURE_SUBJECT.test(subject) || FACTURE_SUBJECT.test(bodySnippet))
    ) {
        return {
            category: "factures",
            needsReply: false,
            reason: "Facture fournisseur (EEC / Calédonienne des eaux / OPT / Lagoon)",
        };
    }

    // 5. Emails de bienvenue / création de compte (jamais à répondre).
    if (WELCOME_SUBJECT.test(subject) || WELCOME_SUBJECT.test(snippetHead)) {
        return {
            category: "infos",
            needsReply: false,
            reason: "Message de bienvenue ou activation de compte (à lire)",
        };
    }

    // 5b. Confirmations transactionnelles / annonces produit (Google Play/Pay, reçus, etc.).
    if (
        TRANSACTIONAL_OR_PRODUCT_INFO.test(subject) ||
        TRANSACTIONAL_OR_PRODUCT_INFO.test(snippetHead)
    ) {
        return {
            category: "infos",
            needsReply: false,
            reason: "Confirmation transactionnelle ou information produit (à lire)",
        };
    }

    // 5c. Kiosque : newsletters de presse (Le Monde, Mediapart).
    const listId = headerValue(headers, "list-id");
    if (KIOSQUE_LE_MONDE.test(fromEmail) || KIOSQUE_LE_MONDE.test(listId)) {
        return {
            category: "kiosque",
            needsReply: false,
            reason: "Newsletter presse — Le Monde",
        };
    }
    if (KIOSQUE_MEDIAPART.test(fromEmail) || KIOSQUE_MEDIAPART.test(listId)) {
        return {
            category: "kiosque",
            needsReply: false,
            reason: "Newsletter presse — Mediapart",
        };
    }

    // 6. Diffusion de masse : newsletters et publicités.
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

    // 7. Vrai email d'une personne réelle avec question ou demande directe.
    if (isQuestion && !looksAutomated && !isAuto) {
        return {
            category: "personnel",
            needsReply: true,
            reason: "Question ou demande directe, réponse attendue",
        };
    }

    // 8. Autres factures / paiements automatiques (hors EEC/CDE/OPT/Lagoon) -> à lire si automatisé.
    if (FACTURE_SUBJECT.test(subject) && (looksAutomated || isAuto)) {
        return {
            category: "infos",
            needsReply: false,
            reason: "Notification de paiement ou reçu automatique (à lire)",
        };
    }

    // 9. Administratif important ou infos automatiques -> À lire.
    if (IMPORTANT_SUBJECT.test(subject) && (looksAutomated || isAuto)) {
        return {
            category: "important",
            needsReply: false,
            reason: "Notification administrative importante (à lire)",
        };
    }

    if (INFO_SUBJECT.test(subject) && (looksAutomated || isAuto)) {
        return {
            category: "infos",
            needsReply: false,
            reason: "Information à lire (aucune réponse attendue)",
        };
    }

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

    // 10. Expéditeur humain identifié : par défaut à répondre.
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

/** Livre emprunté dans une bibliothèque (BM Lyon). */
export interface GmailBookLoan {
    title: string;
    author: string | null;
    /** Date de retour au format ISO (AAAA-MM-JJ) si lisible. */
    dueDate: string | null;
    /** Date de retour telle qu'écrite dans l'email. */
    dueLabel: string | null;
}

export interface GmailMessageDetail extends GmailMessageSummary {
    to: string;
    cc: string;
    text: string;
    /** Corps HTML nettoyé (images `cid:` et distantes conservées) pour l'affichage fidèle. */
    html?: string;
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
    /** Suivi de colis, si l'email en contient un. */
    tracking: GmailTracking | null;
    /** Livres empruntés, pour les emails de la bibliothèque (BM Lyon). */
    loans: GmailBookLoan[];
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
    /** Identifiant MIME Content-ID (sans chevrons), utilisé pour les images `cid:`. */
    contentId?: string;
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
            const contentId =
                typeof node.id === "string" && node.id.trim()
                    ? node.id.replace(/^<|>$/g, "").trim()
                    : undefined;
            const isInline =
                disposition.includes("inline") ||
                (Boolean(contentId) && !isAttachment) ||
                (isImage && !isAttachment);

            if ((filename || isAttachment || isImage) && node.type?.startsWith("image/") === true) {
                found.push({
                    part: node.part ?? "1",
                    filename: filename || "image",
                    type: node.type,
                    size: typeof node.size === "number" ? node.size : null,
                    inline: isInline,
                    contentId,
                });
            } else if (filename || isAttachment) {
                found.push({
                    part: node.part ?? "1",
                    filename: filename || "pièce jointe",
                    type: node.type || "application/octet-stream",
                    size: typeof node.size === "number" ? node.size : null,
                    inline: isInline,
                    contentId,
                });
            }

            if (node.childNodes?.length) walk(node.childNodes);
        }
    };

    if (structure.childNodes?.length) walk(structure.childNodes);
    else {
        const filename =
            structure.dispositionParameters?.filename || structure.parameters?.name || "";
        const contentId =
            typeof structure.id === "string" && structure.id.trim()
                ? structure.id.replace(/^<|>$/g, "").trim()
                : undefined;
        if (filename) {
            found.push({
                part: structure.part ?? "1",
                filename,
                type: structure.type || "application/octet-stream",
                size: typeof structure.size === "number" ? structure.size : null,
                inline: true,
                contentId,
            });
        }
    }

    return found;
}

function sanitizeEmailHtml(rawHtml: string, uid: number, parts: GmailPartInfo[]): string {
    let html = rawHtml
        // Supprimer les balises actives ou dangereuses
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
        .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, "")
        .replace(/<embed\b[^>]*>/gi, "")
        .replace(/<base\b[^>]*>/gi, "")
        .replace(/<meta\b[^>]*http-equiv=["']?refresh["']?[^>]*>/gi, "")
        // Supprimer les gestionnaires d'événements inline (onclick, onerror, etc.)
        .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        // Neutraliser les URLs javascript: / vbscript: / data:text/html
        .replace(/(href|src)\s*=\s*(["'])\s*(?:javascript|vbscript|data:text\/html):[^"']*\2/gi, '$1=$2#$2');

    // Réécrire les images cid:... vers notre proxy sécurisé /api/gmail/attachment
    html = html.replace(/src\s*=\s*(["'])cid:([^"']+)\1/gi, (_full, quote: string, rawCid: string) => {
        const cid = rawCid.trim().toLowerCase();
        const match =
            parts.find((p) => p.contentId && p.contentId.toLowerCase() === cid) ||
            parts.find((p) => p.contentId && cid.startsWith(p.contentId.toLowerCase())) ||
            parts.find((p) => p.filename && cid.includes(p.filename.toLowerCase()));
        if (!match) return `src=${quote}${quote}`;
        const params = new URLSearchParams({
            uid: String(uid),
            part: match.part,
            type: match.type,
            name: match.filename,
        });
        return `src=${quote}/api/gmail/attachment?${params.toString()}${quote}`;
    });

    // Ouvrir tous les liens dans un nouvel onglet
    html = html.replace(/<a\b(?![^>]*\btarget=)([^>]*)>/gi, '<a target="_blank" rel="noreferrer noopener"$1>');

    const baseStyle = `<style>
      html { margin: 0; padding: 0; }
      body { margin: 0; padding: 0; background: #ffffff; color: #1e293b; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow-wrap: break-word; }
      img { max-width: 100%; height: auto; }
      pre { white-space: pre-wrap; }
    </style>`;

    if (/<head\b[^>]*>/i.test(html)) {
        return html.replace(/<head\b([^>]*)>/i, `<head$1>${baseStyle}`);
    }
    if (/<html\b[^>]*>/i.test(html)) {
        return html.replace(/<html\b([^>]*)>/i, `<html$1><head>${baseStyle}</head>`);
    }
    return `<!doctype html><html><head><meta charset="utf-8">${baseStyle}</head><body>${html}</body></html>`;
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
    headers = message.headers ? message.headers.toString("utf8") : "",
    bodySnippet?: string
): GmailMessageSummary {
    const envelope = message.envelope;
    const from = envelope?.from?.[0];
    const internalDate = (message as FetchMessageObject & { internalDate?: Date }).internalDate;
    const rawDate = internalDate ?? envelope?.date;
    const date = rawDate instanceof Date ? rawDate : new Date(rawDate ?? Date.now());
    const subject = envelope?.subject?.trim() || "(sans objet)";
    const fromEmail = from?.address ?? "";
    const rawPart = message.bodyParts?.get("TEXT")?.toString("utf8") ?? "";
    const snippet = bodySnippet !== undefined ? bodySnippet : extractBodySnippet(rawPart);
    const classification = classifyMessage(fromEmail, subject, headers, snippet);
    const answered = message.flags ? message.flags.has("\\Answered") : false;
    const finalClassification = answered
        ? {
              ...classification,
              needsReply: false,
              reason: `Déjà répondu — ${classification.reason}`,
          }
        : classification;
    const orderNumber =
        finalClassification.category === "commande"
            ? extractOrderNumber({ subject, text: snippet })
            : null;
    const trackingNumber =
        finalClassification.category === "commande"
            ? (trackingNumbersIn(`${subject}\n${snippet}`)[0] ?? null)
            : null;
    return {
        uid: message.uid,
        subject,
        fromName: from?.name?.trim() || fromEmail || "Expéditeur inconnu",
        fromEmail,
        date: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
        seen: message.flags ? message.flags.has("\\Seen") : false,
        answered,
        ...finalClassification,
        orderNumber,
        trackingNumber,
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
        const images = attachmentParts.filter((item) => item.type.startsWith("image/"));
        const attachments = attachmentParts.map((item) => item.filename);
        const inlineImages = images.filter((item) => item.inline).map((item) => item.filename);
        const plainPart = findPart(message.bodyStructure, "text/plain");
        const htmlPart = findPart(message.bodyStructure, "text/html");
        const part = plainPart ?? htmlPart;

        let text = "";
        let rawHtml = "";
        const downloadPart = async (target: { part?: string }): Promise<string> => {
            const dl = await client.download(String(uid), target.part ?? "1", { uid: true });
            return dl && dl.content ? readLimited(dl.content, MAX_BODY_BYTES) : "";
        };

        if (plainPart && htmlPart && plainPart.part !== htmlPart.part) {
            const [plainResult, htmlResult] = await Promise.all([
                downloadPart(plainPart).catch(() => ""),
                downloadPart(htmlPart).catch(() => ""),
            ]);
            text = plainResult;
            rawHtml = htmlResult;
            if (!text.trim() && rawHtml) {
                text = htmlToText(rawHtml);
            }
        } else if (part) {
            const downloaded = await downloadPart(part);
            if (part.type === "text/html") {
                rawHtml = downloaded;
                text = htmlToText(downloaded);
            } else {
                text = downloaded;
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

        const html = rawHtml.trim() ? sanitizeEmailHtml(rawHtml, uid, attachmentParts) : undefined;

        const base = toSummary(
            message,
            message.headers?.toString("utf8") ?? "",
            breakdown.currentText || fullText
        );

        const tracking =
            base.category === "kiosque"
                ? null
                : extractTracking({
                      subject: envelope?.subject ?? "",
                      fromEmail: envelope?.from?.[0]?.address ?? "",
                      fromName: envelope?.from?.[0]?.name ?? "",
                      text: breakdown.currentText || visibleText,
                      html: html ?? rawHtml,
                      date: envelope?.date ?? message.internalDate ?? null,
                  });

        const loans = extractBookLoans({
            subject: envelope?.subject ?? "",
            fromEmail: envelope?.from?.[0]?.address ?? "",
            text: breakdown.currentText || visibleText,
        });
        // Le corps du message peut révéler un suivi qu'un en-tête de diffusion
        // masquait (boutiques qui expédient via une régie marketing).
        const trackingUpgrade: Partial<GmailClassification> =
            tracking && ["newsletter", "promotion", "infos", "important"].includes(base.category)
                ? {
                      category: "commande",
                      needsReply: false,
                      reason: tracking.carrier
                          ? `Suivi de colis — ${tracking.carrier}`
                          : "Suivi de colis (aucune réponse attendue)",
                  }
                : {};

        return {
            ...base,
            ...trackingUpgrade,
            to: addressList(envelope?.to),
            cc: addressList(envelope?.cc),
            text: visibleText,
            html,
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
            tracking,
            loans,
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
        let moved = false;
        try {
            const result = await client.messageMove(String(uid), target.path, { uid: true });
            moved = result !== false;
        } catch {
            // Repli COPY + DELETE si Gmail refuse UID MOVE sur ce libellé (caractères spéciaux, etc.)
            const copied = await client.messageCopy(String(uid), target.path, { uid: true });
            if (copied !== false) {
                await client.messageDelete(String(uid), { uid: true });
                moved = true;
            }
        }
        if (!moved) {
            throw new Error("Gmail a refusé le déplacement de ce message.");
        }
        return { moved: true, destination: target.path };
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
    /** Libellé de période : « AOÛT 2026 » ou « 2026-T3 ». */
    period: string;
    /** Date de facture retenue (AAAA-MM-JJ). */
    invoiceDate: string;
    files: InvoiceFile[];
    /** Montant total détecté, par exemple « 27 350 XPF » (null si illisible). */
    amount: string | null;
    /** Lien présent dans l'email (facture en ligne, ex. EEC Engie). */
    link?: string;
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

const MONTH_LABELS = [
    "JANVIER",
    "FÉVRIER",
    "MARS",
    "AVRIL",
    "MAI",
    "JUIN",
    "JUILLET",
    "AOÛT",
    "SEPTEMBRE",
    "OCTOBRE",
    "NOVEMBRE",
    "DÉCEMBRE",
];

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

/** OPT.nc Internet et Mobile se distinguent uniquement par le n° de compte du PDF. */
const OPT_ACCOUNTS: Array<{ digits: string; provider: InvoiceProvider }> = [
    { digits: "9000019168", provider: "opt-internet" },
    { digits: "111150452", provider: "opt-mobile" },
];

/** Vrai si le nombre apparaît isolé (pas noyé dans un nombre plus long). */
function containsNumber(haystack: string, digits: string): boolean {
    let index = haystack.indexOf(digits);
    while (index !== -1) {
        const before = haystack[index - 1];
        const after = haystack[index + digits.length];
        if ((!before || !/[0-9]/.test(before)) && (!after || !/[0-9]/.test(after))) {
            return true;
        }
        index = haystack.indexOf(digits, index + 1);
    }
    return false;
}

/**
 * Lit le n° de compte OPT.nc dans le texte du PDF :
 *   9000019168 → OPT.nc Internet · 1.11150452 → OPT.nc Mobile.
 */
export function optVariantFromText(text: string): InvoiceProvider | null {
    // Les factures écrivent souvent « 1.11150452 » ou « 1 111 50452 ».
    const compact = text.replace(/[^0-9A-Za-z]/g, "");
    for (const account of OPT_ACCOUNTS) {
        if (containsNumber(compact, account.digits)) return account.provider;
    }
    return null;
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

function quarterFromText(text: string): { year: number; quarter: number } | null {
    const direct = text.match(/\bT([1-4])\b[^\d]{0,8}(20\d{2})/i);
    if (direct) return { quarter: Number(direct[1]), year: Number(direct[2]) };

    const reverse = text.match(/(20\d{2})[^\d]{0,8}\bT([1-4])\b/i);
    if (reverse) return { year: Number(reverse[1]), quarter: Number(reverse[2]) };

    const trimestre = text.match(/([1-4])(?:er|e|ème|eme)?\s*trimestre[^\d]{0,10}(20\d{2})/i);
    if (trimestre) return { quarter: Number(trimestre[1]), year: Number(trimestre[2]) };

    const reverseTrim = text.match(/(20\d{2})[^\d]{0,10}([1-4])(?:er|e|ème|eme)?\s*trimestre/i);
    if (reverseTrim) return { year: Number(reverseTrim[1]), quarter: Number(reverseTrim[2]) };

    return null;
}

/** Mois écrit en toutes lettres dans l'objet ou le corps (« Mois de Octobre 2026 »). */
function namedMonthFromText(text: string): { year: number; month: number } | null {
    const match = text
        .toLowerCase()
        .match(
            /(janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre)\s+(20\d{2})/
        );
    if (!match) return null;
    const month = MONTHS_FR[match[1]];
    if (!month) return null;
    return { year: Number(match[2]), month };
}

/** Date de facture : explicitement citée, sinon date de réception. */
function invoiceDateOf(message: GmailMessageDetail): { day: number; month: number; year: number } {
    const text = `${message.subject}\n${message.currentText}\n${message.historyText}`;

    const nearInvoice = text.match(
        /(?:facture|date)[^\n]{0,40}?(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2})/i
    );
    const anyDate = text.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2})\b/);
    const match = nearInvoice ?? anyDate;

    if (match) {
        const day = Number(match[1]);
        const month = Number(match[2]);
        const year = Number(match[3]);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return { day, month, year };
        }
    }

    const received = new Date(message.date);
    if (Number.isNaN(received.getTime())) {
        const now = new Date();
        return { day: now.getDate(), month: now.getMonth() + 1, year: now.getFullYear() };
    }
    return { day: received.getDate(), month: received.getMonth() + 1, year: received.getFullYear() };
}

/** Les premières dates du mois se rapportent à la période précédente. */
function billingMonth(date: { day: number; month: number; year: number }): {
    year: number;
    month: number;
} {
    if (date.day > 5) return { year: date.year, month: date.month };
    if (date.month === 1) return { year: date.year - 1, month: 12 };
    return { year: date.year, month: date.month - 1 };
}

function isoDate(date: { day: number; month: number; year: number }): string {
    return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
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

/** Lien vers la facture en ligne (certains fournisseurs n'envoient pas de PDF). */
function invoiceLink(message: GmailMessageDetail): string | undefined {
    const text = `${message.currentText}\n${message.historyText}`;
    const urls = (text.match(/https?:\/\/[^\s<>"')]+/gi) ?? []).map((url) =>
        url.replace(/[.,;:!?]+$/, "")
    );

    if (urls.length === 0) return undefined;

    return (
        urls.find((url) => /\.pdf(\?|$)/i.test(url)) ??
        urls.find((url) => /facture|invoice|eec|engie/i.test(url)) ??
        urls[0]
    );
}

const MAX_INVOICE_PDF_BYTES = 8 * 1024 * 1024;

/** Extrait le texte d'un PDF (pdf.js via unpdf) : sert au n° de compte OPT.nc. */
async function readPdfText(buffer: Buffer): Promise<string> {
    if (buffer.length === 0) return "";
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    try {
        const { text } = await extractText(pdf, { mergePages: true });
        return Array.isArray(text) ? text.join("\n") : text;
    } finally {
        await pdf.cleanup?.();
    }
}

/** Première pièce jointe PDF d'un message. */
function firstPdfPart(message: GmailMessageDetail): GmailPartInfo | null {
    return (
        message.attachmentParts.find(
            (part) =>
                part.type.toLowerCase() === "application/pdf" ||
                part.filename.toLowerCase().endsWith(".pdf")
        ) ?? null
    );
}

/** Texte du PDF joint (téléchargé à la demande) ; null s'il est illisible. */
async function invoicePdfText(message: GmailMessageDetail): Promise<string | null> {
    const part = firstPdfPart(message);
    if (!part || !part.part) return null;
    if (part.size && part.size > MAX_INVOICE_PDF_BYTES) return null;
    try {
        const { buffer } = await downloadPart(message.uid, part.part);
        return await readPdfText(buffer);
    } catch {
        return null;
    }
}

/**
 * Analyse complète d'une facture. Pour OPT.nc, le PDF joint est lu afin de
 * distinguer Internet (compte 9000019168) de Mobile (compte 1.11150452) :
 * l'objet de l'email ne permet pas de les différencier.
 */
export async function analyzeInvoice(
    message: GmailMessageDetail
): Promise<InvoiceProposal | null> {
    if (!detectProvider(message)) return null;
    // Le PDF donne le montant, et le n° de compte pour OPT.nc.
    const pdfText = await invoicePdfText(message);
    return detectInvoiceFromMessage(message, pdfText ?? undefined);
}

const AMOUNT_RE = /(\d[\d\s.,]*)\s*(xpf|f\s?cfp|cfp|eur|€)/gi;
const AMOUNT_KEYWORD = /net\s+à\s+payer|montant|total|somme|à\s+payer|règlement/i;

function parseAmount(raw: string): number {
    const cleaned = raw.replace(/[\s\u00a0\u202f]/g, "");
    const grouped = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(cleaned);
    const normalized = grouped
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, ".");
    const value = Number(normalized);
    return Number.isFinite(value) ? value : 0;
}

/**
 * Montant total d'une facture (XPF/FCFP ou €). Les lignes contenant
 * « net à payer », « total » ou « montant » sont prioritaires, puis on garde
 * le montant le plus élevé — jamais les dates ni les numéros de compte.
 */
export function amountFromText(text: string): string | null {
    const found: Array<{ value: number; label: string; keyword: boolean }> = [];

    for (const line of text.split(/\r?\n/)) {
        const keyword = AMOUNT_KEYWORD.test(line);
        for (const match of line.matchAll(AMOUNT_RE)) {
            const value = parseAmount(match[1]);
            if (value < 50) continue;
            const raw = match[1].replace(/[\s\u00a0\u202f]+/g, " ").trim();
            const currency = /€|eur/i.test(match[2]) ? "€" : "XPF";
            found.push({ value, label: `${raw} ${currency}`, keyword });
        }
    }

    if (found.length === 0) return null;

    const preferred = found.filter((item) => item.keyword);
    const pool = preferred.length > 0 ? preferred : found;
    return pool.reduce((best, item) => (item.value > best.value ? item : best), pool[0]).label;
}

export function detectInvoiceFromMessage(
    message: GmailMessageDetail,
    pdfText?: string
): InvoiceProposal | null {
    // Pour OPT.nc, le n° de compte lu dans le PDF fait foi sur l'objet de l'email.
    const provider = (pdfText ? optVariantFromText(pdfText) : null) ?? detectProvider(message);
    if (!provider) return null;

    const date = invoiceDateOf(message);
    const text = `${message.subject}\n${message.currentText}\n${message.historyText}`;
    // Un mois écrit en toutes lettres (« Mois de Octobre 2026 ») fait foi :
    // il décrit la période facturée, sans décalage de début de mois.
    const explicitMonth = namedMonthFromText(text);
    const monthRef = explicitMonth ?? billingMonth(date);
    const label = PROVIDER_LABEL[provider];

    let period: string;
    if (provider === "cde") {
        // Un trimestre écrit dans l'objet (« T3 2026 ») fait foi.
        const explicitQuarter = quarterFromText(text);
        const year = explicitQuarter?.year ?? monthRef.year;
        const quarter =
            explicitQuarter?.quarter ?? Math.floor((monthRef.month - 1) / 3) + 1;
        period = `${year}-T${quarter}`;
    } else {
        period = `${monthRef.year}-${String(monthRef.month).padStart(2, "0")}`;
    }

    const link = invoiceLink(message);
    const pdfs = pdfFiles(message);
    // Le PDF est la source la plus fiable ; l'email sert de repli.
    const amount = (pdfText ? amountFromText(pdfText) : null) ?? amountFromText(text);

    // Certains fournisseurs (EEC Engie) envoient un lien plutôt qu'une pièce jointe :
    // on crée alors une entrée virtuelle pour le renommage et l'aperçu.
    const prepared: InvoiceFile[] =
        pdfs.length > 0
            ? pdfs
            : link
              ? [{ part: "", original: link, type: "application/pdf", proposed: "" }]
              : [];

    if (prepared.length === 0) return null;

    return {
        provider,
        providerLabel: label,
        period,
        invoiceDate: isoDate(date),
        amount,
        link,
        files: prepared.map((file, index) => ({
            ...file,
            proposed: `${period} - ${label} - Facture${
                prepared.length > 1 ? ` (${index + 1})` : ""
            }.pdf`,
        })),
    };
}

const INVOICE_ALLOWED_HOSTS = ["engie.nc", "eec.nc", "eec-engie.nc", "opt.nc", "lagoon.nc", "cde.nc", "helia.nc"];

function allowedInvoiceHost(value: string): boolean {
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
        const host = parsed.hostname.toLowerCase();
        return INVOICE_ALLOWED_HOSTS.some(
            (domain) => host === domain || host.endsWith(`.${domain}`)
        );
    } catch {
        return false;
    }
}

/**
 * Récupère le PDF d'une facture en ligne (domaines fournisseurs uniquement).
 * Vérifie que la réponse est bien un PDF : un lien de portail qui renvoie une
 * page HTML (session expirée, authentification) produit une erreur explicite
 * au lieu d'un aperçu cassé.
 */
export async function downloadInvoiceLink(
    url: string
): Promise<{ buffer: Buffer; contentType: string }> {
    if (!allowedInvoiceHost(url)) {
        throw new Error("Lien de facture non autorisé (domaine inconnu).");
    }

    // Les fournisseurs publient parfois un lien http : on tente https d'abord.
    const securedUrl = url.startsWith("http://") ? `https://${url.slice("http://".length)}` : url;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);

    try {
        const response = await fetch(securedUrl, {
            redirect: "follow",
            signal: controller.signal,
            headers: {
                "User-Agent": "AssistantPerso/1.0",
                Accept: "application/pdf,*/*;q=0.8",
            },
        });

        if (!response.ok) {
            throw new Error(`Le fournisseur a refusé le fichier (${response.status}).`);
        }
        if (!allowedInvoiceHost(response.url)) {
            throw new Error("Le lien redirige vers un domaine non autorisé.");
        }

        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > 15 * 1024 * 1024) {
            throw new Error("Fichier trop volumineux (15 Mo maximum).");
        }

        const buffer = Buffer.from(arrayBuffer);
        const header = buffer.subarray(0, 5).toString("latin1");
        const declared = (response.headers.get("content-type") ?? "").toLowerCase();

        if (header !== "%PDF-" && !declared.includes("application/pdf")) {
            if (declared.includes("text/html") || header.startsWith("<")) {
                throw new Error(
                    "Le lien ouvre une page web et non un PDF : une connexion au site du fournisseur est probablement requise."
                );
            }
            throw new Error("Le lien ne renvoie pas un fichier PDF exploitable.");
        }

        return { buffer, contentType: "application/pdf" };
    } finally {
        clearTimeout(timer);
    }
}


/** Vérifie qu'un lien de facture renvoie bien un PDF (sans bloquer l'aperçu). */
export async function checkInvoiceLink(
    url: string
): Promise<{ ok: boolean; error?: string }> {
    const secured = url.startsWith("http://") ? `https://${url.slice("http://".length)}` : url;
    if (!allowedInvoiceHost(secured)) {
        return { ok: false, error: "Lien de facture non autorisé." };
    }

    const attempt = async (
        extraHeaders: Record<string, string>
    ): Promise<{ ok: boolean; error?: string }> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        try {
            const response = await fetch(secured, {
                redirect: "follow",
                signal: controller.signal,
                headers: {
                    "User-Agent": "AssistantPerso/1.0",
                    Accept: "application/pdf,*/*;q=0.8",
                    ...extraHeaders,
                },
            });

            if (!response.ok) {
                return {
                    ok: false,
                    error: `Le fournisseur a refusé le fichier (${response.status}).`,
                };
            }
            if (!allowedInvoiceHost(response.url)) {
                return { ok: false, error: "Le lien redirige vers un domaine non autorisé." };
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            const header = buffer.subarray(0, 5).toString("latin1");
            const declared = (response.headers.get("content-type") ?? "").toLowerCase();

            if (header === "%PDF-" || declared.includes("application/pdf")) {
                return { ok: true };
            }
            if (declared.includes("text/html") || header.startsWith("<")) {
                return {
                    ok: false,
                    error:
                        "Le lien ouvre une page web et non un PDF : une connexion au site du fournisseur est probablement requise.",
                };
            }
            return { ok: false, error: "Le lien ne renvoie pas un fichier PDF." };
        } catch (error) {
            return {
                ok: false,
                error:
                    error instanceof Error && error.name === "AbortError"
                        ? "Le site du fournisseur ne répond pas."
                        : "Vérification du lien impossible.",
            };
        } finally {
            clearTimeout(timer);
        }
    };

    // Certains serveurs refusent les requêtes « Range » : on retente sans.
    const ranged = await attempt({ Range: "bytes=0-4" });
    if (ranged.ok) return ranged;
    return attempt({});
}


/**
 * Analyse en lot les emails de factures avec une seule connexion IMAP :
 * seuls 20 Ko de texte sont lus par message, ce qui rend le chargement rapide.
 */
export async function detectInvoicesForUids(
    uids: number[]
): Promise<Array<{ uid: number; proposal: InvoiceProposal | null; error?: string }>> {
    const unique = [...new Set(uids.filter((uid) => Number.isInteger(uid) && uid > 0))].slice(0, 25);
    if (unique.length === 0) return [];

    return withInbox(async (client) => {
        const results: Array<{ uid: number; proposal: InvoiceProposal | null; error?: string }> = [];

        for (const uid of unique) {
            try {
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

                if (!message) throw new Error("Message introuvable dans la boîte de réception.");

                const part =
                    findPart(message.bodyStructure, "text/plain") ??
                    findPart(message.bodyStructure, "text/html");

                let text = "";
                if (part) {
                    const download = await client.download(String(uid), part.part ?? "1", {
                        uid: true,
                    });
                    if (download && download.content) {
                        text = await readLimited(download.content, 20_000);
                        if (part.type === "text/html") text = htmlToText(text);
                    }
                }

                const breakdown = splitThread(text);
                const attachmentParts = collectParts(message.bodyStructure);
                const images = attachmentParts.filter(
                    (item) => item.type.startsWith("image/") && item.inline
                );

                const detail = {
                    ...toSummary(message, message.headers?.toString("utf8") ?? ""),
                    to: "",
                    cc: "",
                    text,
                    summary: "",
                    currentText: breakdown.currentText,
                    historyText: breakdown.historyText,
                    exchanges: breakdown.exchanges,
                    attachments: attachmentParts.map((item) => item.filename),
                    inlineImages: images.map((item) => item.filename),
                    attachmentParts,
                    images,
                    messageId: "",
                    inReplyTo: "",
                } as GmailMessageDetail;

                const pdfPart = firstPdfPart(detail);
                let pdfText: string | null = null;

                // Le PDF apporte le montant et, pour OPT.nc, le n° de compte.
                if (pdfPart?.part) {
                    try {
                        const download = await client.download(String(uid), pdfPart.part, {
                            uid: true,
                        });
                        if (download?.content) {
                            const chunks: Buffer[] = [];
                            let size = 0;
                            for await (const chunk of download.content as AsyncIterable<
                                Buffer | string
                            >) {
                                if (size >= MAX_INVOICE_PDF_BYTES) break;
                                const chunkBuffer = Buffer.isBuffer(chunk)
                                    ? chunk
                                    : Buffer.from(chunk);
                                chunks.push(chunkBuffer);
                                size += chunkBuffer.length;
                            }
                            download.content.destroy();
                            pdfText = await readPdfText(Buffer.concat(chunks));
                        }
                    } catch {
                        pdfText = null;
                    }
                }

                results.push({
                    uid,
                    proposal: detectInvoiceFromMessage(detail, pdfText ?? undefined),
                });
            } catch (error) {
                results.push({ uid, proposal: null, error: describeGmailError(error) });
            }
        }

        return results;
    });
}
