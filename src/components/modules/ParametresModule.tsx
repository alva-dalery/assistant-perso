import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Settings,
  Sparkles,
  Save,
  Key,
  RefreshCw,
  Check,
  X,
  Download,
  Upload,
  RotateCcw,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  CloudSun,
  ShoppingBag,
  Activity,
} from "lucide-react";
import {
  getAiHeaders,
  loadAiConfig,
  saveAiConfig,
  type DeepSeekModel,
} from "@/lib/aiClient";
import { exportBackupJson, importBackupJson } from "@/lib/storage";
import type { AppState, UserProfile } from "@/types";

interface ParametresModuleProps {
  user: UserProfile;
  onUpdateProfile: (updated: Partial<UserProfile>) => void;
  onRestoreState: (state: AppState) => void;
  onResetState: () => void;
  onNotify: (msg: string) => void;
}

interface AiStatusInfo {
  configured: boolean;
  source: "env" | "header" | "none";
  model: DeepSeekModel;
}

export const ParametresModule: React.FC<ParametresModuleProps> = ({
  user,
  onUpdateProfile,
  onRestoreState,
  onResetState,
  onNotify,
}) => {
  const [formData, setFormData] = useState<UserProfile>(user);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"sync" | "profile" | "api">("sync");
  const [showGmailModal, setShowGmailModal] = useState(false);

  // Gmail status
  const [gmailStatus, setGmailStatus] = useState<{
    configured: boolean;
    email: string | null;
    inboxCount: number | null;
    error?: string;
  } | null>(null);
  const [gmailChecking, setGmailChecking] = useState(false);
  const [gmailCheckedAt, setGmailCheckedAt] = useState<string | null>(null);

  // DeepSeek config state
  const [aiKeyInput, setAiKeyInput] = useState("");
  const [showAiKey, setShowAiKey] = useState(false);
  const [aiModel, setAiModel] = useState<DeepSeekModel>("deepseek-chat");
  const [aiStatus, setAiStatus] = useState<AiStatusInfo | null>(null);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Import/Export state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setFormData(user);
  }, [user]);

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
            "Authentification du site expirée : rechargez la page et reconnectez-vous.",
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
        error: "Impossible de joindre /api/gmail/status.",
      });
    } finally {
      setGmailChecking(false);
    }
  }, []);

  const refreshAiStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/status", {
        cache: "no-store",
        credentials: "same-origin",
        headers: getAiHeaders(),
      });
      if (res.ok) {
        const data = (await res.json()) as AiStatusInfo;
        setAiStatus(data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const localAi = loadAiConfig();
    if (localAi.apiKey) setAiKeyInput(localAi.apiKey);
    if (localAi.model) setAiModel(localAi.model);
    void refreshGmailStatus();
    void refreshAiStatus();
  }, [refreshGmailStatus, refreshAiStatus]);

  const handleSaveProfile = () => {
    onUpdateProfile(formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveAiSettings = async () => {
    saveAiConfig({ apiKey: aiKeyInput, model: aiModel });
    await refreshAiStatus();
    onNotify("Configuration DeepSeek enregistrée localement.");
  };

  const handleTestAi = async () => {
    setAiTesting(true);
    setAiTestResult(null);
    saveAiConfig({ apiKey: aiKeyInput, model: aiModel });

    try {
      const res = await fetch("/api/ai/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAiHeaders(),
        },
        credentials: "same-origin",
        body: JSON.stringify({
          apiKey: aiKeyInput.trim() || undefined,
          model: aiModel,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        model?: string;
        source?: string;
        latencyMs?: number;
        error?: string;
      };

      await refreshAiStatus();
      if (res.ok && data.ok) {
        setAiTestResult({
          ok: true,
          message: `Connexion réussie (${data.model}, source : ${
            data.source === "env" ? "serveur .env" : "clé locale"
          }, ${data.latencyMs ?? 0} ms).`,
        });
      } else {
        setAiTestResult({
          ok: false,
          message: data.error || "Échec du test DeepSeek.",
        });
      }
    } catch {
      setAiTestResult({
        ok: false,
        message: "Impossible de joindre /api/ai/status.",
      });
    } finally {
      setAiTesting(false);
    }
  };

  const handleExportJson = () => {
    const json = exportBackupJson();
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `assistant-perso-sauvegarde-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify("Sauvegarde JSON téléchargée (sans clés API).");
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const result = importBackupJson(text);
      if (!result.ok || !result.state) {
        onNotify(result.error || "Import impossible.");
        return;
      }
      onRestoreState(result.state);
    } catch {
      onNotify("Impossible de lire ce fichier.");
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Top Banner with Tabs */}
      <div className="p-6 rounded-[2.2rem] bg-white border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight font-jakarta flex items-center gap-2">
            <Settings className="h-6 w-6 text-slate-700" />
            <span>Paramètres, IA DeepSeek & Sauvegardes</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            État réel des services connectés, profil personnel, sauvegarde locale JSON et configuration DeepSeek.
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl text-xs font-semibold">
          <button
            onClick={() => setActiveTab("sync")}
            className={`px-4 py-2 rounded-xl transition-all ${
              activeTab === "sync"
                ? "bg-[#121316] text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Services & Flux
          </button>
          <button
            onClick={() => setActiveTab("profile")}
            className={`px-4 py-2 rounded-xl transition-all ${
              activeTab === "profile"
                ? "bg-[#121316] text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Profil & Sauvegarde
          </button>
          <button
            onClick={() => setActiveTab("api")}
            className={`px-4 py-2 rounded-xl transition-all ${
              activeTab === "api"
                ? "bg-[#121316] text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            IA DeepSeek & Clés
          </button>
        </div>
      </div>

      {/* TAB 1: SERVICES & FLUX */}
      {activeTab === "sync" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 1. Gmail réel */}
          <div className="p-6 rounded-[2rem] bg-white border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center font-bold text-lg shadow-sm">
                    G
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-slate-900">
                      Gmail (IMAP + SMTP)
                    </h4>
                    <p className="text-xs text-slate-500">Secrétariat & Factures</p>
                  </div>
                </div>

                <span
                  className={`text-[10px] px-3 py-1 rounded-full font-bold border ${
                    gmailStatus?.configured && !gmailStatus?.error
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : gmailStatus?.error
                        ? "bg-rose-50 text-rose-700 border-rose-200"
                        : "bg-slate-100 text-slate-500 border-slate-200"
                  }`}
                >
                  {gmailStatus?.configured && !gmailStatus?.error
                    ? "Connecté ✓"
                    : gmailStatus?.error
                      ? "Erreur"
                      : "Non configuré"}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60 text-xs text-slate-600 space-y-1">
                <div className="flex justify-between font-medium gap-3">
                  <span className="text-slate-400 shrink-0">Compte associé :</span>
                  <span className="font-bold text-slate-800 truncate">
                    {gmailStatus?.email ?? "Non configuré"}
                  </span>
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
                {gmailStatus?.error && (
                  <p className="text-[11px] text-rose-600 pt-1">{gmailStatus.error}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setShowGmailModal(true)}
                className="text-xs font-bold text-slate-700 hover:text-slate-900 underline"
              >
                Instructions de configuration
              </button>

              <button
                onClick={() => void refreshGmailStatus()}
                disabled={gmailChecking}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-800 text-xs font-bold transition-all"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 text-slate-600 ${gmailChecking ? "animate-spin" : ""}`}
                />
                <span>{gmailChecking ? "Vérification..." : "Tester la connexion"}</span>
              </button>
            </div>
          </div>

          {/* 2. DeepSeek API */}
          <div className="p-6 rounded-[2rem] bg-white border border-slate-200/80 shadow-sm flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-sky-50 text-sky-600 border border-sky-200 flex items-center justify-center font-bold shadow-sm">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-slate-900">Moteur IA DeepSeek</h4>
                    <p className="text-xs text-slate-500">
                      Brain Dump, Emails, Projets, Litiges, Food, Coach
                    </p>
                  </div>
                </div>

                <span
                  className={`text-[10px] px-3 py-1 rounded-full font-bold border ${
                    aiStatus?.configured
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-amber-50 text-amber-800 border-amber-200"
                  }`}
                >
                  {aiStatus?.configured ? "Configuré ✓" : "Clé requise"}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60 text-xs text-slate-600 space-y-1">
                <div className="flex justify-between font-medium">
                  <span className="text-slate-400">Source de la clé :</span>
                  <span className="font-bold text-slate-800">
                    {aiStatus?.source === "env"
                      ? "Variable serveur (.env)"
                      : aiStatus?.source === "header"
                        ? "Navigateur (localStorage)"
                        : "Aucune"}
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-slate-400">Modèle actif :</span>
                  <span className="text-slate-700 font-mono">{aiStatus?.model || aiModel}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setActiveTab("api")}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
              >
                Configurer & tester DeepSeek →
              </button>
            </div>
          </div>

          {/* 3. Open Food Facts + Open-Meteo */}
          <div className="p-6 rounded-[2rem] bg-white border border-slate-200/80 shadow-sm space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
                  <ShoppingBag className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-slate-900">
                    Open Food Facts & Open-Meteo
                  </h4>
                  <p className="text-xs text-slate-500">APIs publiques gratuites sans compte</p>
                </div>
              </div>
              <span className="text-[10px] px-3 py-1 rounded-full font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                Actif ✓
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Le scanner alimentaire du module <strong>Food</strong> interroge directement la base Open Food Facts (codes-barres & recherche). Le module <strong>Dressing / Valise</strong> récupère la météo en direct via Open-Meteo.
            </p>
          </div>

          {/* 4. Biomarqueurs Santé */}
          <div className="p-6 rounded-[2rem] bg-white border border-slate-200/80 shadow-sm space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-slate-900">
                    Biomarqueurs Santé
                  </h4>
                  <p className="text-xs text-slate-500">Sommeil, VFC, Pouls, Pas</p>
                </div>
              </div>
              <span className="text-[10px] px-3 py-1 rounded-full font-bold bg-slate-100 text-slate-600 border border-slate-200">
                Saisie manuelle
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Sans backend OAuth Withings / Apple HealthKit, vos mesures du jour se mettent à jour manuellement dans le module <strong>Santé</strong> et sont sauvegardées dans votre navigateur.
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: PROFIL & SAUVEGARDE */}
      {activeTab === "profile" && (
        <div className="space-y-6">
          <div className="p-6 rounded-[2.2rem] bg-white border border-slate-200/80 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 flex-wrap gap-3">
              <div>
                <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-teal-600" />
                  <span>Profil Personnel & Directives IA</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Utilisé par DeepSeek pour vos brouillons d'emails, vos tenues, la météo et le coaching TDAH.
                </p>
              </div>

              <button
                onClick={handleSaveProfile}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#121316] hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all"
              >
                {saved ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-400 stroke-[3]" />
                    <span>Enregistré !</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 text-[#f7da64]" />
                    <span>Enregistrer le profil</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="space-y-4">
                <div>
                  <label className="text-slate-600 font-bold block mb-1">Prénom</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label className="text-slate-600 font-bold block mb-1 flex items-center gap-1.5">
                    <CloudSun className="h-3.5 w-3.5 text-amber-500" />
                    <span>Ville par défaut (météo Dressing)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.city || ""}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Ex: Lyon, Paris, Bordeaux..."
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label className="text-slate-600 font-bold block mb-1">
                    Morphologie & Coupes recommandées
                  </label>
                  <input
                    type="text"
                    value={formData.morphology}
                    onChange={(e) => setFormData({ ...formData, morphology: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label className="text-slate-600 font-bold block mb-1">
                    Palette de Colorimétrie Saisonnière
                  </label>
                  <input
                    type="text"
                    value={formData.colorimetrySeason}
                    onChange={(e) =>
                      setFormData({ ...formData, colorimetrySeason: e.target.value })
                    }
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-medium"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-slate-600 font-bold block mb-1">
                    Directives Stylistiques Secrétariat (Plume IA)
                  </label>
                  <textarea
                    value={formData.emailWritingStyle}
                    onChange={(e) =>
                      setFormData({ ...formData, emailWritingStyle: e.target.value })
                    }
                    rows={4}
                    className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-medium leading-relaxed resize-none"
                  />
                </div>

                <div>
                  <label className="text-slate-600 font-bold block mb-1">
                    Préférences TDAH & Coaching
                  </label>
                  <textarea
                    value={formData.tdahNotes}
                    onChange={(e) => setFormData({ ...formData, tdahNotes: e.target.value })}
                    rows={3}
                    className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 font-medium leading-relaxed resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sauvegarde locale Export / Import */}
          <div className="p-6 rounded-[2.2rem] bg-white border border-slate-200/80 shadow-sm space-y-4 text-xs">
            <div>
              <h4 className="text-base font-extrabold text-slate-900">
                Sauvegarde locale (Export / Import JSON)
              </h4>
              <p className="text-slate-500 mt-0.5">
                Toutes vos données (projets, litiges, dressing, frigo, rappels, culture, colis) sont enregistrées automatiquement dans ce navigateur. Exportez un fichier JSON pour changer d'appareil ou archiver. Les clés API ne sont jamais incluses dans l'export.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleExportJson}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold"
              >
                <Download className="h-4 w-4" />
                <span>Exporter mes données (.json)</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold"
              >
                <Upload className="h-4 w-4" />
                <span>Importer une sauvegarde</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={(e) => void handleImportFile(e)}
                className="hidden"
              />

              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="ml-auto flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-rose-700 hover:bg-rose-50 font-bold"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Réinitialiser les données</span>
                </button>
              ) : (
                <div className="ml-auto flex items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-2xl">
                  <span className="text-rose-900 font-bold">Confirmer la remise à zéro ?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onResetState();
                      setConfirmReset(false);
                    }}
                    className="px-3 py-1 rounded-xl bg-rose-600 text-white font-bold"
                  >
                    Oui, réinitialiser
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-2 py-1 text-slate-600 font-semibold"
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: IA DEEPSEEK & CLÉS API */}
      {activeTab === "api" && (
        <div className="p-6 rounded-[2.2rem] bg-white border border-slate-200/80 shadow-sm space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Key className="h-5 w-5 text-amber-500" />
              <span>Moteur IA DeepSeek & Clé API</span>
            </h4>
            <span
              className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
                aiStatus?.configured
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-amber-50 text-amber-800 border-amber-200"
              }`}
            >
              {aiStatus?.configured
                ? `Prêt (${aiStatus.source === "env" ? "serveur .env" : "clé navigateur"})`
                : "Aucune clé configurée"}
            </span>
          </div>

          <div className="space-y-4 max-w-2xl text-xs">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4">
              <div>
                <label className="font-bold text-slate-800 block mb-1">
                  Modèle DeepSeek utilisé
                </label>
                <select
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value as DeepSeekModel)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-semibold"
                >
                  <option value="deepseek-chat">
                    deepseek-chat (Rapide & polyvalent — recommandé)
                  </option>
                  <option value="deepseek-reasoner">
                    deepseek-reasoner (Raisonnement approfondi — plus lent)
                  </option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">
                  Clé API DeepSeek locale (stockée uniquement dans ce navigateur)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type={showAiKey ? "text" : "password"}
                    value={aiKeyInput}
                    onChange={(e) => setAiKeyInput(e.target.value)}
                    placeholder="sk-..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 font-mono text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAiKey((v) => !v)}
                    className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                    title={showAiKey ? "Masquer" : "Afficher"}
                  >
                    {showAiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Si <code>DEEPSEEK_API_KEY</code> est déjà définie dans <code>.env.local</code> ou sur Vercel, elle est utilisée automatiquement côté serveur sans avoir à la coller ici.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => void handleSaveAiSettings()}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold"
                >
                  Enregistrer
                </button>
                <button
                  type="button"
                  onClick={() => void handleTestAi()}
                  disabled={aiTesting}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold flex items-center gap-1.5 disabled:opacity-40"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${aiTesting ? "animate-spin" : ""}`} />
                  <span>{aiTesting ? "Test en cours..." : "Tester la connexion DeepSeek"}</span>
                </button>
              </div>

              {aiTestResult && (
                <div
                  className={`p-3 rounded-xl border flex items-start gap-2 ${
                    aiTestResult.ok
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : "bg-rose-50 border-rose-200 text-rose-900"
                  }`}
                >
                  {aiTestResult.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  )}
                  <span>{aiTestResult.message}</span>
                </div>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/70 text-[11px] text-amber-950 space-y-1">
              <span className="font-bold block">Recommandé en production (Vercel / local) :</span>
              <p>
                Ajoutez <code>DEEPSEEK_API_KEY=sk-...</code> dans votre fichier <code>.env.local</code> (puis redémarrez le serveur) ou dans <strong>Vercel → Settings → Environment Variables</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Gmail Modal */}
      {showGmailModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-[2.5rem] p-7 shadow-2xl border border-slate-200 space-y-5 relative">
            <button
              onClick={() => setShowGmailModal(false)}
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

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/70 text-[11px] text-amber-900 space-y-1.5">
              <span className="font-bold block">Mise en place, une seule fois</span>
              <p>1. myaccount.google.com → Sécurité → activer la validation en deux étapes.</p>
              <p>2. Sécurité → Mots de passe des applications → générer « Assistant perso ».</p>
              <p>3. Ajoutez GMAIL_USER et GMAIL_APP_PASSWORD dans .env.local ou Vercel.</p>
              {gmailCheckedAt && <p className="opacity-70">Dernier test : {gmailCheckedAt}</p>}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowGmailModal(false)}
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
    </div>
  );
};
