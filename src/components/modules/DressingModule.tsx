import React, { useEffect, useState } from "react";
import {
  Shirt,
  Sparkles,
  Luggage,
  Sun,
  Check,
  Plus,
  Compass,
  Palette,
  Trash2,
  Loader2,
  X,
  RefreshCw,
  AlertCircle,
  ImagePlus,
} from "lucide-react";
import { aiPost } from "@/lib/aiClient";
import type {
  ClothingItem,
  OutfitSuggestion,
  PackingItem,
  UserProfile,
} from "@/types";

interface WeatherData {
  city: string;
  country: string;
  tempC: number;
  minC: number;
  maxC: number;
  conditionLabel: string;
  recommendation: string;
}

interface DressingModuleProps {
  user: UserProfile;
  clothes: ClothingItem[];
  outfits: OutfitSuggestion[];
  tripDestination: string;
  tripDays: number;
  packingList: PackingItem[];
  onAddClothing: (item: Omit<ClothingItem, "id">) => void;
  onDeleteClothing: (id: string) => void;
  onSaveOutfit: (outfit: OutfitSuggestion) => void;
  onUpdateTrip: (destination: string, days: number) => void;
  onSetPackingList: (items: PackingItem[]) => void;
  onTogglePackingItem: (id: string) => void;
  onAddPackingItem: (item: Omit<PackingItem, "id" | "checked">) => void;
  onDeletePackingItem: (id: string) => void;
}

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 360;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas indisponible"));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => reject(new Error("Image illisible"));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.readAsDataURL(file);
  });
}

export const DressingModule: React.FC<DressingModuleProps> = ({
  user,
  clothes,
  outfits,
  tripDestination,
  tripDays,
  packingList,
  onAddClothing,
  onDeleteClothing,
  onSaveOutfit,
  onUpdateTrip,
  onSetPackingList,
  onTogglePackingItem,
  onAddPackingItem,
  onDeletePackingItem,
}) => {
  const [activeTab, setActiveTab] = useState<"garde_robe" | "morpho_couleurs" | "valise">(
    "garde_robe"
  );
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Météo locale Open-Meteo
  const [cityInput, setCityInput] = useState(user.city || "Lyon");
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Composition de tenue IA
  const [occasion, setOccasion] = useState("Journée active & travail");
  const [outfitLoading, setOutfitLoading] = useState(false);
  const [outfitError, setOutfitError] = useState<string | null>(null);

  // Modal ajout vêtement
  const [showAddModal, setShowAddModal] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [itemCategory, setItemCategory] = useState<ClothingItem["category"]>("haut");
  const [itemColor, setItemColor] = useState("");
  const [itemSeason, setItemSeason] = useState<ClothingItem["season"]>("toutes");
  const [itemTags, setItemTags] = useState("");
  const [itemMorpho, setItemMorpho] = useState(true);
  const [itemColorMatch, setItemColorMatch] = useState(true);
  const [itemPhoto, setItemPhoto] = useState<string | undefined>(undefined);
  const [analyzingItem, setAnalyzingItem] = useState(false);
  const [itemAiAdvice, setItemAiAdvice] = useState<string | null>(null);
  const [itemAiError, setItemAiError] = useState<string | null>(null);

  // Onglet Valise
  const [tripWeather, setTripWeather] = useState<WeatherData | null>(null);
  const [packingLoading, setPackingLoading] = useState(false);
  const [packingError, setPackingError] = useState<string | null>(null);
  const [newPackLabel, setNewPackLabel] = useState("");
  const [newPackNote, setNewPackNote] = useState("");

  const fetchWeather = async (city: string, forTrip = false) => {
    if (!city.trim()) return;
    if (!forTrip) setWeatherLoading(true);
    try {
      const res = await fetch(`/api/weather?city=${encodeURIComponent(city.trim())}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!res.ok) return null;
      const data = (await res.json()) as WeatherData;
      if (forTrip) setTripWeather(data);
      else setWeather(data);
      return data;
    } catch {
      return null;
    } finally {
      if (!forTrip) setWeatherLoading(false);
    }
  };

  useEffect(() => {
    void fetchWeather(user.city || "Lyon", false);
  }, [user.city]);

  const handleSuggestOutfit = async () => {
    if (outfitLoading) return;
    setOutfitLoading(true);
    setOutfitError(null);
    try {
      const weatherDesc = weather
        ? `${weather.tempC}°C (min ${weather.minC}°C / max ${weather.maxC}°C), ${weather.conditionLabel} à ${weather.city}`
        : "17°C, temps doux";

      const res = await aiPost<{
        title: string;
        occasion: string;
        temperatureRange: string;
        itemIds: string[];
        whyItWorks: string;
      }>("/api/ai/dressing", {
        action: "suggest_outfit",
        clothes,
        weather: weatherDesc,
        occasion,
        morphology: user.morphology,
        colorimetrySeason: user.colorimetrySeason,
      });

      const selectedItems = clothes.filter((c) => res.itemIds.includes(c.id));
      onSaveOutfit({
        id: `outfit-${Date.now()}`,
        title: res.title,
        occasion: res.occasion,
        temperatureRange: res.temperatureRange,
        items: selectedItems.length > 0 ? selectedItems : clothes.slice(0, 3),
        whyItWorks: res.whyItWorks,
      });
    } catch (err) {
      setOutfitError(err instanceof Error ? err.message : "Erreur composition tenue IA.");
    } finally {
      setOutfitLoading(false);
    }
  };

  const handleAnalyzeItemAi = async () => {
    if ((!itemName.trim() && !itemDesc.trim()) || analyzingItem) return;
    setAnalyzingItem(true);
    setItemAiError(null);
    try {
      const res = await aiPost<{
        category: ClothingItem["category"];
        color: string;
        season: ClothingItem["season"];
        tags: string[];
        morphoMatch: boolean;
        colorimetryMatch: boolean;
        advice: string;
      }>("/api/ai/dressing", {
        action: "analyze_item",
        itemName: itemName.trim(),
        itemDescription: itemDesc.trim(),
        itemColor: itemColor.trim(),
        morphology: user.morphology,
        colorimetrySeason: user.colorimetrySeason,
      });
      setItemCategory(res.category);
      if (res.color) setItemColor(res.color);
      setItemSeason(res.season);
      if (Array.isArray(res.tags)) setItemTags(res.tags.join(", "));
      setItemMorpho(Boolean(res.morphoMatch));
      setItemColorMatch(Boolean(res.colorimetryMatch));
      setItemAiAdvice(res.advice || null);
    } catch (err) {
      setItemAiError(err instanceof Error ? err.message : "Analyse IA impossible.");
    } finally {
      setAnalyzingItem(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file);
      setItemPhoto(compressed);
    } catch {
      setItemAiError("Impossible de traiter cette image.");
    }
  };

  const handleCreateClothing = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;
    onAddClothing({
      name: itemName.trim(),
      category: itemCategory,
      color: itemColor.trim() || "Neutre",
      photoUrl: itemPhoto,
      tags: itemTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      season: itemSeason,
      morphoMatch: itemMorpho,
      colorimetryMatch: itemColorMatch,
    });
    setItemName("");
    setItemDesc("");
    setItemColor("");
    setItemTags("");
    setItemPhoto(undefined);
    setItemAiAdvice(null);
    setShowAddModal(false);
  };

  const handleGeneratePackingAi = async () => {
    if (!tripDestination.trim() || packingLoading) return;
    setPackingLoading(true);
    setPackingError(null);
    try {
      const w = await fetchWeather(tripDestination, true);
      const weatherSummary = w
        ? `${w.tempC}°C (${w.minC}°C - ${w.maxC}°C), ${w.conditionLabel}, ${w.recommendation}`
        : undefined;

      const res = await aiPost<{
        items: Array<{ label: string; note: string; category?: string }>;
      }>("/api/ai/dressing", {
        action: "packing_list",
        destination: tripDestination,
        days: tripDays,
        weatherSummary,
        clothes,
      });

      const nextList: PackingItem[] = res.items.map((item, idx) => ({
        id: `pack-ai-${Date.now()}-${idx}`,
        label: item.label,
        note: item.note || "",
        category: item.category || "Valise",
        checked: false,
      }));
      onSetPackingList(nextList);
    } catch (err) {
      setPackingError(err instanceof Error ? err.message : "Erreur génération valise.");
    } finally {
      setPackingLoading(false);
    }
  };

  const currentOutfit = outfits[0];
  const filteredClothes =
    categoryFilter === "all"
      ? clothes
      : clothes.filter((c) => c.category === categoryFilter);

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm">
        <div>
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Shirt className="h-5 w-5 text-indigo-600" />
            <span>Dressing</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Garde-robe persistée • Météo en direct (Open-Meteo) • Tenues & Valise DeepSeek
          </p>
        </div>

        <div className="flex items-center bg-slate-100 p-1 rounded-2xl text-xs font-semibold">
          <button
            onClick={() => setActiveTab("garde_robe")}
            className={`px-3.5 py-1.5 rounded-xl transition-all ${
              activeTab === "garde_robe"
                ? "bg-white text-indigo-950 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Garde-robe & Tenues
          </button>
          <button
            onClick={() => setActiveTab("morpho_couleurs")}
            className={`px-3.5 py-1.5 rounded-xl transition-all ${
              activeTab === "morpho_couleurs"
                ? "bg-white text-indigo-950 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Morpho & Couleurs
          </button>
          <button
            onClick={() => setActiveTab("valise")}
            className={`px-3.5 py-1.5 rounded-xl transition-all ${
              activeTab === "valise"
                ? "bg-white text-indigo-950 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Valise Météo
          </button>
        </div>
      </div>

      {/* TAB 1: Garde-robe & Tenue du jour */}
      {activeTab === "garde_robe" && (
        <div className="space-y-6">
          {/* Weather + AI Outfit */}
          <div className="p-6 rounded-3xl bg-white card-glow-purple border border-indigo-100 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                  {currentOutfit ? currentOutfit.title : "Tenue du jour"}
                </span>
                {weather && (
                  <p className="text-xs text-slate-600 flex items-center gap-1.5">
                    <Sun className="h-3.5 w-3.5 text-amber-500" />
                    <span>
                      <strong>{weather.city}</strong> : {weather.tempC}°C ({weather.minC}°–{weather.maxC}°C) ·{" "}
                      {weather.conditionLabel} — {weather.recommendation}
                    </span>
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input
                  type="text"
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  placeholder="Ville météo"
                  className="w-28 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                />
                <button
                  type="button"
                  onClick={() => void fetchWeather(cityInput, false)}
                  disabled={weatherLoading}
                  title="Actualiser la météo"
                  className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${weatherLoading ? "animate-spin" : ""}`} />
                </button>
                <input
                  type="text"
                  value={occasion}
                  onChange={(e) => setOccasion(e.target.value)}
                  placeholder="Occasion..."
                  className="w-40 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                />
                <button
                  type="button"
                  onClick={() => void handleSuggestOutfit()}
                  disabled={outfitLoading}
                  className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center gap-1.5 disabled:opacity-40"
                >
                  {outfitLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  <span>Composer (DeepSeek)</span>
                </button>
              </div>
            </div>

            {outfitError && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                {outfitError}
              </p>
            )}

            {currentOutfit && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {currentOutfit.items.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/60 space-y-1"
                    >
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        {item.category}
                      </span>
                      <p className="text-xs font-bold text-slate-800">{item.name}</p>
                      <p className="text-[11px] text-indigo-600 font-semibold">{item.color}</p>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-slate-600 italic">« {currentOutfit.whyItWorks} »</p>
              </>
            )}
          </div>

          {/* Clothes Inventory */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 px-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h4 className="text-sm font-bold text-slate-800">
                  Mon Inventaire ({clothes.length} pièces)
                </h4>
                <div className="flex flex-wrap gap-1 text-[11px]">
                  {[
                    { id: "all", label: "Tout" },
                    { id: "haut", label: "Hauts" },
                    { id: "bas", label: "Bas" },
                    { id: "veste", label: "Vestes" },
                    { id: "chaussures", label: "Chaussures" },
                    { id: "accessoire", label: "Accessoires" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setCategoryFilter(f.id)}
                      className={`px-2.5 py-1 rounded-full font-semibold ${
                        categoryFilter === f.id
                          ? "bg-slate-900 text-white"
                          : "bg-white border border-slate-200 text-slate-600"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Ajouter un vêtement</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredClothes.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-2 hover:border-slate-300 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    {c.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.photoUrl}
                        alt={c.name}
                        className="w-full h-32 object-cover rounded-2xl border border-slate-100"
                      />
                    )}

                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 py-0.5 rounded-md bg-slate-100">
                        {c.category}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          c.colorimetryMatch
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {c.colorimetryMatch ? "Palette idéale" : "À nuancer"}
                      </span>
                    </div>

                    <h5 className="text-xs font-bold text-slate-900">{c.name}</h5>
                    <p className="text-xs text-slate-500">Couleur : {c.color}</p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.slice(0, 3).map((t, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteClothing(c.id)}
                      aria-label="Supprimer cette pièce"
                      className="text-slate-300 hover:text-rose-600 p-1 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Morphologie & Colorimétrie */}
      {activeTab === "morpho_couleurs" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
              <Compass className="h-5 w-5" />
              <span>Morphologie : {user.morphology}</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Ce profil est transmis à DeepSeek lors de l'analyse de vos vêtements et de la composition de vos tenues. Modifiable dans Paramètres → Profil.
            </p>
            <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200/60 space-y-1">
              <span className="text-xs font-bold text-teal-900">✓ Coupes recommandées :</span>
              <ul className="text-xs text-teal-800 space-y-1 list-disc list-inside">
                <li>Cols en V ou ronds dégagés (adoucissent la carrure).</li>
                <li>Surchemises et vestes droites ouvertes (verticalité).</li>
                <li>Pantalons coupe droite ou carotte (volume équilibré).</li>
              </ul>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-amber-700 font-bold text-sm">
              <Palette className="h-5 w-5" />
              <span>Colorimétrie : {user.colorimetrySeason}</span>
            </div>
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/60 space-y-2">
              <span className="text-xs font-bold text-amber-900">✓ Votre palette signature :</span>
              <div className="flex flex-wrap gap-2">
                <span className="text-[11px] px-2.5 py-1 rounded-xl bg-amber-200/80 text-amber-900 font-bold">
                  Terracotta / Rouille
                </span>
                <span className="text-[11px] px-2.5 py-1 rounded-xl bg-lime-200/80 text-lime-900 font-bold">
                  Vert Olive / Kaki
                </span>
                <span className="text-[11px] px-2.5 py-1 rounded-xl bg-orange-200/80 text-orange-900 font-bold">
                  Camel & Cognac
                </span>
                <span className="text-[11px] px-2.5 py-1 rounded-xl bg-yellow-100 text-yellow-900 font-bold border border-yellow-300/40">
                  Écru chaud
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Valise Météo */}
      {activeTab === "valise" && (
        <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Luggage className="h-5 w-5 text-teal-600" />
                <span>Préparation de Valise Intelligente</span>
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Météo en direct (Open-Meteo) + checklist générée par DeepSeek selon votre dressing.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={tripDestination}
                onChange={(e) => onUpdateTrip(e.target.value, tripDays)}
                placeholder="Destination (ex: Tokyo, Lisbonne...)"
                className="px-3.5 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-medium"
              />
              <input
                type="number"
                min={1}
                max={60}
                value={tripDays}
                onChange={(e) => onUpdateTrip(tripDestination, Math.max(1, Number(e.target.value) || 1))}
                className="w-20 px-3 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-mono"
              />
              <span className="text-xs text-slate-400">jours</span>
              <button
                type="button"
                onClick={() => void handleGeneratePackingAi()}
                disabled={packingLoading || !tripDestination.trim()}
                className="px-4 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
              >
                {packingLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                )}
                <span>Générer la valise IA + météo</span>
              </button>
            </div>
          </div>

          {packingError && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{packingError}</span>
            </div>
          )}

          {tripWeather && (
            <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-amber-900 font-semibold">
                <Sun className="h-4 w-4 text-amber-600" />
                <span>
                  Météo {tripWeather.city} : {tripWeather.tempC}°C ({tripWeather.minC}°–{tripWeather.maxC}°C) ·{" "}
                  {tripWeather.conditionLabel}
                </span>
              </div>
              <span className="text-[11px] text-amber-800 font-medium">
                {tripWeather.recommendation}
              </span>
            </div>
          )}

          {/* Ajout manuel rapide dans la valise */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newPackLabel.trim()) return;
              onAddPackingItem({
                label: newPackLabel.trim(),
                note: newPackNote.trim() || "Ajout manuel",
                category: "Valise",
              });
              setNewPackLabel("");
              setNewPackNote("");
            }}
            className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs"
          >
            <input
              type="text"
              value={newPackLabel}
              onChange={(e) => setNewPackLabel(e.target.value)}
              placeholder="Ajouter un article à la valise..."
              className="sm:col-span-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
            />
            <input
              type="text"
              value={newPackNote}
              onChange={(e) => setNewPackNote(e.target.value)}
              placeholder="Note (optionnelle)"
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
            />
            <button
              type="submit"
              disabled={!newPackLabel.trim()}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold disabled:opacity-40"
            >
              + Ajouter
            </button>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 text-xs">
            {packingList.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 rounded-2xl border flex items-start justify-between gap-2 transition-all ${
                  item.checked
                    ? "bg-slate-50 border-slate-200/60 opacity-60"
                    : "bg-white border-slate-200/70 hover:border-teal-500/50 shadow-sm"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onTogglePackingItem(item.id)}
                  className="flex items-start gap-2.5 text-left flex-1 min-w-0"
                >
                  <div
                    className={`h-4 w-4 rounded-md mt-0.5 flex items-center justify-center shrink-0 border ${
                      item.checked
                        ? "bg-teal-600 border-teal-600 text-white"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    {item.checked && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`font-bold text-slate-800 ${
                        item.checked ? "line-through" : ""
                      }`}
                    >
                      {item.label}
                    </p>
                    <p className="text-[10px] text-slate-500">{item.note}</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onDeletePackingItem(item.id)}
                  aria-label="Retirer de la valise"
                  className="text-slate-300 hover:text-rose-600 shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal ajout vêtement */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateClothing}
            className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 relative text-xs max-h-[90vh] overflow-y-auto"
          >
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-800"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-base font-extrabold text-slate-900">
              Ajouter une pièce au dressing
            </h3>

            <div className="space-y-3">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Nom de la pièce *</label>
                <input
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="Ex: Veste en lin sable coupe droite"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
                  required
                />
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  Description / matière / coupe (pour analyse IA)
                </label>
                <input
                  type="text"
                  value={itemDesc}
                  onChange={(e) => setItemDesc(e.target.value)}
                  placeholder="Ex: Col V fluide, couleur chaude camel, mi-saison"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100">
                  <ImagePlus className="h-4 w-4 text-indigo-600" />
                  <span>{itemPhoto ? "Photo chargée ✓" : "Joindre photo (locale)"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handlePhotoUpload(e)}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void handleAnalyzeItemAi()}
                  disabled={analyzingItem || (!itemName.trim() && !itemDesc.trim())}
                  className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-bold border border-indigo-200 flex items-center gap-1.5 disabled:opacity-40"
                >
                  {analyzingItem ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  <span>Analyser morpho & colorimétrie (IA)</span>
                </button>
              </div>

              {itemPhoto && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={itemPhoto}
                  alt="Aperçu"
                  className="h-28 w-28 object-cover rounded-2xl border border-slate-200"
                />
              )}

              {itemAiError && (
                <p className="text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2">
                  {itemAiError}
                </p>
              )}

              {itemAiAdvice && (
                <p className="text-teal-900 bg-teal-50 border border-teal-200 rounded-xl p-2.5">
                  💡 {itemAiAdvice}
                </p>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Catégorie</label>
                  <select
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value as ClothingItem["category"])}
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <option value="haut">Haut</option>
                    <option value="bas">Bas</option>
                    <option value="veste">Veste</option>
                    <option value="chaussures">Chaussures</option>
                    <option value="accessoire">Accessoire</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Couleur</label>
                  <input
                    type="text"
                    value={itemColor}
                    onChange={(e) => setItemColor(e.target.value)}
                    placeholder="Camel"
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Saison</label>
                  <select
                    value={itemSeason}
                    onChange={(e) => setItemSeason(e.target.value as ClothingItem["season"])}
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
                  >
                    <option value="toutes">Toutes</option>
                    <option value="ete">Été</option>
                    <option value="mi-saison">Mi-saison</option>
                    <option value="hiver">Hiver</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  Tags (séparés par des virgules)
                </label>
                <input
                  type="text"
                  value={itemTags}
                  onChange={(e) => setItemTags(e.target.value)}
                  placeholder="casual, lin, fluide"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
                />
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={itemMorpho}
                    onChange={(e) => setItemMorpho(e.target.checked)}
                  />
                  <span>Accord morpho</span>
                </label>
                <label className="flex items-center gap-2 font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={itemColorMatch}
                    onChange={(e) => setItemColorMatch(e.target.checked)}
                  />
                  <span>Palette colorimétrie idéale</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-xl text-slate-500 font-semibold"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold"
              >
                Enregistrer la pièce
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
