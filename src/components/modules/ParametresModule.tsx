import React, { useCallback, useEffect, useState } from "react";
import {
  Settings,
  Sparkles,
  Save,
  Link as LinkIcon,
  Shield,
  Smartphone,
  Watch,
  Key,
  CheckCircle2,
  RefreshCw,
  Mail,
  Calendar,
  Check,
  X,
  ExternalLink,
  QrCode,
  Copy,
  AlertCircle,
  HelpCircle,
  CheckCircle,
} from "lucide-react";
import { UserProfile } from "@/types";

interface ParametresModuleProps {
  user: UserProfile;
  onUpdateProfile: (updated: Partial<UserProfile>) => void;
  onRefreshAllData?: () => void;
}

export interface SyncAccount {
  id: "google" | "withings" | "apple_health" | "yuka";
  name: string;
  category: string;
  connected: boolean;
  accountEmail?: string;
  lastSync: string;
  details: string;
  syncing: boolean;
  iconBg: string;
}

export const ParametresModule: React.FC<ParametresModuleProps> = ({
  user,
  onUpdateProfile,
  onRefreshAllData,
}) => {
  const [formData, setFormData] = useState<UserProfile>(user);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"sync" | "profile" | "api">("sync");

  // Sync Accounts State
  const [accounts, setAccounts] = useState<Record<string, SyncAccount>>({
    google: {
      id: "google",
      name: "Google (Gmail & Google Agenda)",
      category: "Secrétariat & Planning",
      connected: false,
      accountEmail: "Non configuré",
      lastSync: "—",
      details: "Lecture des emails entrants pour les brouillons • Synchronisation agenda",
      syncing: false,
      iconBg: "bg-red-50 text-red-600 border-red-200",
    },
    withings: {
      id: "withings",
      name: "Withings Health Mate",
      category: "Sommeil, VFC & Poids",
      connected: true,
      accountEmail: "Compte Withings #48291",
      lastSync: "Aujourd'hui à 07:12 (Réveil)",
      details: "API OAuth2 officielle • Sleep Analyzer (score 86/100) & Body Scan",
      syncing: false,
      iconBg: "bg-indigo-50 text-indigo-600 border-indigo-200",
    },
    apple_health: {
      id: "apple_health",
      name: "Apple Santé (HealthKit)",
      category: "Biomarqueurs & Activité iPhone/Watch",
      connected: true,
      accountEmail: "iPhone 15 Pro d'Alex",
      lastSync: "Il y a 12 minutes",
      details: "Via Raccourci iOS automatique (webhook sécurisé) • 8 450 pas & VFC",
      syncing: false,
      iconBg: "bg-rose-50 text-rose-600 border-rose-200",
    },
    yuka: {
      id: "yuka",
      name: "Yuka Premium",
      category: "Nutrition & Qualité des aliments",
      connected: true,
      accountEmail: "alex.yuka.vip@gmail.com",
      lastSync: "Hier à 19:40",
      details: "Abonnement Premium actif • Scan additifs & composition frigo",
      syncing: false,
      iconBg: "bg-emerald-50 text-emerald-600 border-emerald-200",
    },
  });

  // Modal State for Connection details
  const [activeModal, setActiveModal] = useState<"google" | "withings" | "apple_health" | "yuka" | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  // Statut réel de la connexion Gmail (IMAP + SMTP, mot de passe d'application)
  const [gmailStatus, setGmailStatus] = useState<{
    configured: boolean;
    email: string | null;
    inboxCount: number | null;
    error?: string;
  } | null>(null);
  const [gmailChecking, setGmailChecking] = useState(false);
  const [gmailCheckedAt, setGmailCheckedAt] = useState<string | null>(null);

  const refreshGmailStatus = useCallback(async () => {
    setGmailChecking(true);
    try {
      const response = await fetch("/api/gmail/status", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 401) {
        setGmailStatus({
          configured: false,
          email: null,
          inboxCount: null,
          error:
            "Authentification du site expirée : rechargez la page, reconnectez-vous, puis relancez le test.",
        });
        return;
      }
      const data = (await response.json()) as {
        configured: boolean;
        email: string | null;
        inboxCount: number | null;
        error?: string;
      };
      setGmailStatus(data);
      setGmailCheckedAt(
        new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      );
    } catch {
      setGmailStatus({
        configured: false,
        email: null,
        inboxCount: null,
        error:
          "Impossible de joindre /api/gmail/status. Vérifiez que le déploiement est à jour, puis rechargez la page.",
      });
    } finally {
      setGmailChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshGmailStatus();
  }, [refreshGmailStatus]);

  // Trigger individual synchronization
  const handleSyncAccount = (id: string) => {
    setAccounts((prev) => ({
      ...prev,
      [id]: { ...prev[id], syncing: true },
    }));

    setTimeout(() => {
      setAccounts((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          syncing: false,
          lastSync: "À l'instant",
        },
      }));
    }, 1200);
  };

  // Toggle account connection
  const handleToggleConnect = (id: string) => {
    setAccounts((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        connected: !prev[id].connected,
        lastSync: !prev[id].connected ? "À l'instant" : "Déconnecté",
      },
    }));
    setActiveModal(null);
  };

  // Sync All Accounts at once
  const handleSyncAll = () => {
    setIsSyncingAll(true);
    Object.keys(accounts).forEach((key) => {
      setAccounts((prev) => ({
        ...prev,
        [key]: { ...prev[key], syncing: true },
      }));
    });

    setTimeout(() => {
      Object.keys(accounts).forEach((key) => {
        setAccounts((prev) => ({
          ...prev,
          [key]: { ...prev[key], syncing: false, lastSync: "À l'instant" },
        }));
      });
      setIsSyncingAll(false);
      if (onRefreshAllData) onRefreshAllData();
    }, 1500);
  };

  const handleSaveProfile = () => {
    onUpdateProfile(formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const webhookUrl = "http://localhost:3000/api/health/apple-sync?token=usr_alex_sec_99482";

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  return (
    <div className="w-full space-y-6">
      {/* Top Banner with Navigation Tabs */}
      <div className="p-6 rounded-[2.2rem] bg-white border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight font-jakarta flex items-center gap-2">
            <Settings className="h-6 w-6 text-slate-700" />
            <span>Paramètres & Synchronisation des Comptes</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Gérez la connexion de vos comptes Google, Withings, Apple Santé et Yuka pour alimenter votre assistant.
          </p>
        </div>

        {/* Tab Pills */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl text-xs font-semibold">
          <button
            onClick={() => setActiveTab("sync")}
            className={`px-4 py-2 rounded-xl transition-all ${activeTab === "sync"
              ? "bg-[#121316] text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
              }`}
          >
            Comptes Connectés (4)
          </button>
          <button
            onClick={() => setActiveTab("profile")}
            className={`px-4 py-2 rounded-xl transition-all ${activeTab === "profile"
              ? "bg-[#121316] text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
              }`}
          >
            Profil & Plume IA
          </button>
          <button
            onClick={() => setActiveTab("api")}
            className={`px-4 py-2 rounded-xl transition-all ${activeTab === "api"
              ? "bg-[#121316] text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
              }`}
          >
            Clés API & Sécurité
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TAB 1: COMPTES & SYNCHRONISATIONS (Yuka, Withings, etc.) */}
      {/* ======================================================== */}
      {activeTab === "sync" && (
        <div className="space-y-6">
          {/* Header Action: Sync All Button */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                État des flux de données
              </span>
              <p className="text-sm font-extrabold text-slate-800 mt-0.5">
                4/4 comptes synchronisés en continu
              </p>
            </div>

            <button
              onClick={handleSyncAll}
              disabled={isSyncingAll}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#121316] hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 active:scale-95"
            >
              <RefreshCw className={`h-4 w-4 text-[#f7da64] ${isSyncingAll ? "animate-spin" : ""}`} />
              <span>{isSyncingAll ? "Synchronisation générale..." : "Tout synchroniser maintenant"}</span>
            </button>
          </div>

          {/* The 4 Synchronized Account Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. GOOGLE (Gmail & Google Calendar) */}
            <div className="p-6 rounded-[2rem] bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center font-bold text-lg shadow-sm">
                      G
                    </div>
                    <div>
                      <h4 className="text-base font-extrabold text-slate-900">
                        {accounts.google.name}
                      </h4>
                      <p className="text-xs text-slate-500">{accounts.google.category}</p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] px-3 py-1 rounded-full font-bold border ${gmailStatus?.configured && !gmailStatus?.error
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : gmailStatus?.error
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}
                  >
                    {gmailStatus?.configured && !gmailStatus?.error
                      ? "Connecté ✓"
                      : gmailStatus?.error
                        ? "Erreur de connexion"
                        : "Non configuré"}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60 text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between font-medium gap-3">
                    <span className="text-slate-400 shrink-0">Compte associé :</span>
                    <span className="font-bold text-slate-800 truncate">{gmailStatus?.email ?? "Non configuré"}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-400">Boîte de réception :</span>
                    <span className="text-slate-700 font-mono">
                      {gmailStatus?.configured
                        ? gmailChecking
                          ? "Vérification…"
                          : `${gmailStatus.inboxCount ?? 0} messages`
                        : "—"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/50">
                    {gmailStatus?.configured
                      ? "IMAP + SMTP via mot de passe d'application Google"
                      : "Ajoutez GMAIL_USER et GMAIL_APP_PASSWORD dans les variables d'environnement."}
                  </p>
                  {gmailStatus?.error && (
                    <p className="text-[11px] text-rose-600 pt-1">{gmailStatus.error}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setActiveModal("google")}
                  className="text-xs font-bold text-slate-700 hover:text-slate-900 underline"
                >
                  Gérer les autorisations
                </button>

                <button
                  onClick={() => void refreshGmailStatus()}
                  disabled={gmailChecking}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-800 text-xs font-bold transition-all"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-slate-600 ${gmailChecking ? "animate-spin" : ""}`} />
                  <span>{gmailChecking ? "Vérification..." : "Tester la connexion"}</span>
                </button>
              </div>
            </div>

            {/* 2. WITHINGS (Sleep Analyzer & Body Scan) */}
            <div className="p-6 rounded-[2rem] bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center font-bold text-lg shadow-sm">
                      <Watch className="h-6 w-6 text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="text-base font-extrabold text-slate-900">
                        {accounts.withings.name}
                      </h4>
                      <p className="text-xs text-slate-500">{accounts.withings.category}</p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] px-3 py-1 rounded-full font-bold border ${accounts.withings.connected
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}
                  >
                    {accounts.withings.connected ? "Connecté ✓" : "Non connecté"}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60 text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-400">Périphériques :</span>
                    <span className="font-bold text-slate-800">Sleep Analyzer & Balance</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-400">Dernière synchro :</span>
                    <span className="text-slate-700 font-mono">{accounts.withings.lastSync}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/50">
                    {accounts.withings.details}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setActiveModal("withings")}
                  className="text-xs font-bold text-slate-700 hover:text-slate-900 underline"
                >
                  Paramètres OAuth2
                </button>

                <button
                  onClick={() => handleSyncAccount("withings")}
                  disabled={accounts.withings.syncing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-slate-600 ${accounts.withings.syncing ? "animate-spin" : ""}`} />
                  <span>{accounts.withings.syncing ? "Synchro..." : "Synchroniser"}</span>
                </button>
              </div>
            </div>

            {/* 3. APPLE HEALTH (HealthKit iOS) */}
            <div className="p-6 rounded-[2rem] bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center font-bold text-lg shadow-sm">
                      <Smartphone className="h-6 w-6 text-rose-600" />
                    </div>
                    <div>
                      <h4 className="text-base font-extrabold text-slate-900">
                        {accounts.apple_health.name}
                      </h4>
                      <p className="text-xs text-slate-500">{accounts.apple_health.category}</p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] px-3 py-1 rounded-full font-bold border ${accounts.apple_health.connected
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}
                  >
                    {accounts.apple_health.connected ? "Connecté ✓" : "Non connecté"}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60 text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-400">Canal de transmission :</span>
                    <span className="font-bold text-slate-800">Raccourci iOS Automatique</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-400">Dernière synchro :</span>
                    <span className="text-slate-700 font-mono">{accounts.apple_health.lastSync}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/50">
                    {accounts.apple_health.details}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setActiveModal("apple_health")}
                  className="text-xs font-bold text-slate-700 hover:text-slate-900 underline"
                >
                  Configurer le Raccourci iOS
                </button>

                <button
                  onClick={() => handleSyncAccount("apple_health")}
                  disabled={accounts.apple_health.syncing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-slate-600 ${accounts.apple_health.syncing ? "animate-spin" : ""}`} />
                  <span>{accounts.apple_health.syncing ? "Synchro..." : "Synchroniser"}</span>
                </button>
              </div>
            </div>

            {/* 4. YUKA (Yuka Premium) */}
            <div className="p-6 rounded-[2rem] bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold text-lg shadow-sm">
                      <Shield className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                      <h4 className="text-base font-extrabold text-slate-900">
                        {accounts.yuka.name}
                      </h4>
                      <p className="text-xs text-slate-500">{accounts.yuka.category}</p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] px-3 py-1 rounded-full font-bold border ${accounts.yuka.connected
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-slate-100 text-slate-500 border-slate-200"
                      }`}
                  >
                    {accounts.yuka.connected ? "Abonnement Actif ✓" : "Inactif"}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60 text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-400">Compte membre :</span>
                    <span className="font-bold text-slate-800">{accounts.yuka.accountEmail}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-400">Dernier scan frigo :</span>
                    <span className="text-slate-700 font-mono">{accounts.yuka.lastSync}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/50">
                    {accounts.yuka.details}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setActiveModal("yuka")}
                  className="text-xs font-bold text-slate-700 hover:text-slate-900 underline"
                >
                  Gérer l'accès Yuka
                </button>

                <button
                  onClick={() => handleSyncAccount("yuka")}
                  disabled={accounts.yuka.syncing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-slate-600 ${accounts.yuka.syncing ? "animate-spin" : ""}`} />
                  <span>{accounts.yuka.syncing ? "Synchro..." : "Synchroniser"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: PROFIL & PLUME IA                                 */}
      {/* ======================================================== */}
      {activeTab === "profile" && (
        <div className="p-6 rounded-[2.2rem] bg-white border border-slate-200/80 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-teal-600" />
                <span>Personnalisation de la Plume & du Ton de Rédaction</span>
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Ces directives enseignent à l'assistant comment écrire exactement comme vous (zéro style robotique).
              </p>
            </div>

            <button
              onClick={handleSaveProfile}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#121316] hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all"
            >
              {saved ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400 stroke-[3]" />
                  <span>Modifications enregistrées !</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 text-[#f7da64]" />
                  <span>Enregistrer ma plume</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="space-y-4">
              <div>
                <label className="text-slate-600 font-bold block mb-1">Votre Prénom ou Signature usuelle</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:outline-none focus:bg-white focus:border-slate-400 shadow-inner"
                />
              </div>

              <div>
                <label className="text-slate-600 font-bold block mb-1">
                  Morphologie & Coupes Vestimentaires Recommandées
                </label>
                <input
                  type="text"
                  value={formData.morphology}
                  onChange={(e) => setFormData({ ...formData, morphology: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:outline-none focus:bg-white focus:border-slate-400 shadow-inner"
                />
              </div>

              <div>
                <label className="text-slate-600 font-bold block mb-1">
                  Palette de Colorimétrie Saisonnière
                </label>
                <input
                  type="text"
                  value={formData.colorimetrySeason}
                  onChange={(e) => setFormData({ ...formData, colorimetrySeason: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-medium focus:outline-none focus:bg-white focus:border-slate-400 shadow-inner"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-600 font-bold block mb-1">
                Directives Stylistiques Secrétariat (Vos formules types, ton, tutoiement vs vouvoiement)
              </label>
              <textarea
                value={formData.emailWritingStyle}
                onChange={(e) => setFormData({ ...formData, emailWritingStyle: e.target.value })}
                rows={6}
                className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-medium leading-relaxed focus:outline-none focus:bg-white focus:border-slate-400 resize-none font-sans shadow-inner"
              />
              <p className="text-[11px] text-slate-400 mt-2">
                💡 Exemple : « Chaleureux, direct, professionnel sans lourdeur académique. Jamais de "J'espère que ce mail vous trouve en bonne santé". Signature cordiale : Alex. »
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: CLÉS API & SÉCURITÉ                               */}
      {/* ======================================================== */}
      {activeTab === "api" && (
        <div className="p-6 rounded-[2.2rem] bg-white border border-slate-200/80 shadow-sm space-y-5">
          <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Key className="h-5 w-5 text-amber-500" />
            <span>Moteur d'Intelligence Artificielle & Clés d'API</span>
          </h4>

          <div className="space-y-4 max-w-2xl text-xs">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Clé API Google Gemini (Multimodal & Rédaction)</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Actif (Gemini 2.5 Flash)
                </span>
              </div>
              <input
                type="password"
                defaultValue="AIzaSyB*********************************"
                className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-500 font-mono text-[11px]"
              />
              <p className="text-[11px] text-slate-400">
                Alimente la vision par ordinateur (photos vêtements, frigo) et la rédaction sans hallucination.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* CONNECTION MODALS                                       */}
      {/* ======================================================== */}

      {/* 1. GOOGLE MODAL */}
      {activeModal === "google" && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-[2.5rem] p-7 shadow-2xl border border-slate-200 space-y-5 relative">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-800 p-1"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center font-bold text-xl">
                G
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Connexion Gmail (IMAP + SMTP)
                </h3>
                <p className="text-xs text-slate-500">Mot de passe d'application Google</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60 text-xs space-y-2">
              <span className="font-bold text-slate-800 block">Ce que fait la connexion :</span>
              <ul className="space-y-1.5 text-slate-600">
                <li className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[3] mt-0.5" />
                  <span>Lecture des emails reçus (IMAP sécurisé, port 993)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[3] mt-0.5" />
                  <span>Création de brouillons Gmail : aucun envoi sans votre validation</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[3] mt-0.5" />
                  <span>Envoi de réponses via SMTP (port 465) uniquement après votre clic</span>
                </li>
              </ul>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/70 text-[11px] text-amber-900 space-y-1.5">
              <span className="font-bold block">Mise en place, une seule fois</span>
              <p>1. myaccount.google.com → Sécurité → activer la validation en deux étapes.</p>
              <p>2. Sécurité → Mots de passe des applications → générer « Assistant perso ».</p>
              <p>3. Vercel → Settings → Environment Variables : GMAIL_USER et GMAIL_APP_PASSWORD.</p>
              <p>4. Deployments → … → Redeploy (cache de build décoché), puis revenez ici.</p>
            </div>

            <div
              className={`p-4 rounded-2xl border text-[11px] space-y-1 ${gmailStatus?.configured && !gmailStatus?.error
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : gmailStatus?.error
                    ? "bg-rose-50 border-rose-200 text-rose-700"
                    : "bg-slate-50 border-slate-200 text-slate-600"
                }`}
            >
              <span className="font-bold block">
                {gmailStatus?.configured && !gmailStatus?.error
                  ? "Connexion réussie"
                  : gmailStatus?.error
                    ? "Échec de la connexion"
                    : "Variables absentes de ce déploiement"}
              </span>
              <p>
                {gmailStatus?.configured && !gmailStatus?.error
                  ? `${gmailStatus.inboxCount ?? 0} message(s) dans la boîte de réception · IMAP et SMTP opérationnels.`
                  : gmailStatus?.error
                    ? gmailStatus.error
                    : "GMAIL_USER et GMAIL_APP_PASSWORD ne sont pas visibles pour ce build. Ajoutez-les dans Settings → Environment Variables (Production), puis Deployments → … → Redeploy en décochant le cache de build."}
              </p>
              {gmailCheckedAt && <p className="opacity-70">Dernier test : {gmailCheckedAt}</p>}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => setActiveModal(null)}
                className="text-xs text-slate-500 hover:text-slate-800 font-bold"
              >
                Fermer
              </button>

              <button
                onClick={() => void refreshGmailStatus()}
                disabled={gmailChecking}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#121316] hover:bg-slate-800 disabled:opacity-60 text-white font-bold text-xs shadow-md"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${gmailChecking ? "animate-spin" : ""}`} />
                <span>{gmailChecking ? "Test en cours…" : "Tester la connexion"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. WITHINGS MODAL */}
      {activeModal === "withings" && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-[2.5rem] p-7 shadow-2xl border border-slate-200 space-y-5 relative">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-800 p-1"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center font-bold text-xl">
                <Watch className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Connexion Withings Health Mate (OAuth2)
                </h3>
                <p className="text-xs text-slate-500">Sleep Analyzer, Body Scan & ScanWatch</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60 text-xs space-y-2">
              <span className="font-bold text-slate-800 block">Données biométriques synchronisées :</span>
              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div className="p-2 rounded-xl bg-white border border-slate-200 flex items-center gap-2">
                  <span className="text-indigo-600 font-bold">✓</span>
                  <span>Score Sommeil</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-slate-200 flex items-center gap-2">
                  <span className="text-indigo-600 font-bold">✓</span>
                  <span>VFC (Variabilité)</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-slate-200 flex items-center gap-2">
                  <span className="text-indigo-600 font-bold">✓</span>
                  <span>Pouls au repos</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-slate-200 flex items-center gap-2">
                  <span className="text-indigo-600 font-bold">✓</span>
                  <span>Composition corporelle</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => handleToggleConnect("withings")}
                className="text-xs text-rose-600 hover:underline font-bold"
              >
                {accounts.withings.connected ? "Déconnecter Withings" : "Annuler"}
              </button>

              <button
                onClick={() => {
                  handleSyncAccount("withings");
                  setActiveModal(null);
                }}
                className="px-6 py-2.5 rounded-full bg-[#121316] hover:bg-slate-800 text-white font-bold text-xs shadow-md"
              >
                Synchroniser les appareils
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. APPLE HEALTH MODAL (Webhook / Raccourci iOS) */}
      {activeModal === "apple_health" && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-[2.5rem] p-7 shadow-2xl border border-slate-200 space-y-5 relative">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-800 p-1"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center font-bold text-xl">
                <Smartphone className="h-6 w-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Synchronisation Apple Santé (iOS)
                </h3>
                <p className="text-xs text-slate-500">HealthKit vers Assistant perso</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                <span className="font-bold text-slate-800 block">Étape 1 : Raccourci iOS Automatique</span>
                <p className="text-slate-600">
                  Sur iPhone, Apple Santé protège vos données en local. Un simple **Raccourci iOS** envoie automatiquement chaque matin vos pas et votre VFC à votre serveur Assistant perso.
                </p>
                <a
                  href="#raccourci"
                  className="inline-flex items-center gap-1.5 font-bold text-rose-600 hover:underline pt-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>Installer le Raccourci « Sync Assistant perso » sur mon iPhone</span>
                </a>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                <span className="font-bold text-slate-800 block">Étape 2 : URL Webhook Unique</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl}
                    className="flex-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-[11px] font-mono text-slate-600 truncate"
                  />
                  <button
                    onClick={handleCopyWebhook}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-[10px] shrink-0"
                  >
                    {copiedWebhook ? "Copié !" : "Copier"}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => handleToggleConnect("apple_health")}
                className="text-xs text-rose-600 hover:underline font-bold"
              >
                {accounts.apple_health.connected ? "Désactiver la réception" : "Annuler"}
              </button>

              <button
                onClick={() => {
                  handleSyncAccount("apple_health");
                  setActiveModal(null);
                }}
                className="px-6 py-2.5 rounded-full bg-[#121316] hover:bg-slate-800 text-white font-bold text-xs shadow-md"
              >
                Tester la réception
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. YUKA MODAL */}
      {activeModal === "yuka" && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-[2.5rem] p-7 shadow-2xl border border-slate-200 space-y-5 relative">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-800 p-1"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold text-xl">
                <Shield className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Compte Yuka & Abonnement Actif
                </h3>
                <p className="text-xs text-slate-500">Qualité nutritionnelle & détection additifs</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60 text-xs space-y-2">
              <span className="font-bold text-slate-800 block">Fonctionnalités activées :</span>
              <ul className="space-y-1.5 text-slate-600">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[3]" />
                  <span>Analyse instantanée des codes-barres lors des courses</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[3]" />
                  <span>Notation Nutri-Score & indice NOVA (anti-ultra-transformé)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-600 stroke-[3]" />
                  <span>Synchronisation avec l'inventaire du frigo (module Food)</span>
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => handleToggleConnect("yuka")}
                className="text-xs text-rose-600 hover:underline font-bold"
              >
                {accounts.yuka.connected ? "Déconnecter Yuka" : "Annuler"}
              </button>

              <button
                onClick={() => {
                  handleSyncAccount("yuka");
                  setActiveModal(null);
                }}
                className="px-6 py-2.5 rounded-full bg-[#121316] hover:bg-slate-800 text-white font-bold text-xs shadow-md"
              >
                Confirmer l'accès Premium
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
