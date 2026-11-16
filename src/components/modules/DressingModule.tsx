import React, { useState } from "react";
import {
  Shirt,
  Sparkles,
  Luggage,
  Sun,
  CloudRain,
  Check,
  Plus,
  Compass,
  Palette,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { ClothingItem, OutfitSuggestion } from "@/types";

interface DressingModuleProps {
  clothes: ClothingItem[];
  outfits: OutfitSuggestion[];
  onAddClothesPhoto: () => void;
}

export const DressingModule: React.FC<DressingModuleProps> = ({
  clothes,
  outfits,
  onAddClothesPhoto,
}) => {
  const [activeTab, setActiveTab] = useState<"garde_robe" | "morpho_couleurs" | "valise">("garde_robe");

  // Packing list state
  const [tripDestination, setTripDestination] = useState("Bangkok & Chiang Mai (Thaïlande)");
  const [tripDays, setTripDays] = useState(14);
  const [packedItems, setPackedItems] = useState<Record<string, boolean>>({
    "c-1": false,
    "c-2": true,
    "c-3": true,
    "c-4": false,
    "lin-1": false,
    "maillot-1": false,
    "adaptateur-1": true,
    "creme-soleil-1": false,
  });

  const togglePacked = (id: string) => {
    setPackedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      {/* Module Navigation Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm">
        <div>
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Shirt className="h-5 w-5 text-indigo-600" />
            <span>Dressing</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Inventaire photo • Morphologie & Colorimétrie • Valise météo intelligente
          </p>
        </div>

        {/* Tabs */}
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

      {/* TAB 1: Garde-robe & Tenues du Jour */}
      {activeTab === "garde_robe" && (
        <div className="space-y-6">
          {/* Daily Outfit Suggestion Banner */}
          <div className="p-6 rounded-3xl bg-white card-glow-purple border border-indigo-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                Tenue recommandée pour aujourd'hui (17°C • Temps frais & éclaircies)
              </span>
              <span className="text-xs px-3 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                100% accord morpho
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
              {outfits[0].items.map((item) => (
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

            <p className="text-xs text-slate-600 italic pt-1">
              « {outfits[0].whyItWorks} »
            </p>
          </div>

          {/* Clothes Inventory */}
          <div>
            <div className="flex items-center justify-between mb-4 px-1">
              <h4 className="text-sm font-bold text-slate-800">
                Mon Inventaire Vêtements ({clothes.length} pièces enregistrées)
              </h4>
              <button
                onClick={onAddClothesPhoto}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Scanner / Ajouter photo</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {clothes.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-2 hover:border-slate-300 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 py-0.5 rounded-md bg-slate-100">
                      {c.category}
                    </span>
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
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

                  <div className="flex flex-wrap gap-1 pt-1">
                    {c.tags.map((t, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Morphologie & Colorimétrie */}
      {activeTab === "morpho_couleurs" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Morpho Card */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                <Compass className="h-5 w-5" />
                <span>Analyse Morphologie : Silhouette V (Trapèze)</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Épaules carrées et développées, taille et bassin plus étroits. L'objectif est d'harmoniser sans tasser le haut du corps.
              </p>

              <div className="space-y-2.5">
                <div className="p-3.5 rounded-2xl bg-teal-50 border border-teal-200/60 space-y-1">
                  <span className="text-xs font-bold text-teal-900">
                    ✓ Coupes qui vous subliment :
                  </span>
                  <ul className="text-xs text-teal-800 space-y-1 list-disc list-inside">
                    <li>Cols en V ou ronds dégagés (adoucissent la carrure).</li>
                    <li>Surchemises et vestes droites ouvertes (verticalité).</li>
                    <li>Pantalons coupe droite ou carotte (volume équilibré).</li>
                  </ul>
                </div>

                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200/60 space-y-1">
                  <span className="text-xs font-bold text-rose-900">
                    ✕ Coupes à éviter :
                  </span>
                  <ul className="text-xs text-rose-800 space-y-1 list-disc list-inside">
                    <li>Épaulettes trop rigides ou vestes cintrées.</li>
                    <li>Skinny jeans très serrés aux chevilles.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Colorimetrie Card */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-sm">
                <Palette className="h-5 w-5" />
                <span>Colorimétrie : Saison Automne Chaud</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Votre carnation et vos reflets naturels ressortent avec des nuances terreuses, chaudes et profondes.
              </p>

              <div className="space-y-2.5">
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/60 space-y-1">
                  <span className="text-xs font-bold text-amber-900">
                    ✓ Votre palette signature :
                  </span>
                  <div className="flex flex-wrap gap-2 pt-1.5">
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

                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-xs font-bold text-slate-700">
                    ✕ Teintes qui éteignent le teint :
                  </span>
                  <p className="text-xs text-slate-500">
                    Blanc optique froid, noir dur près du visage, bleu électrique saturé, gris souris terne.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Assistant Valise Météo */}
      {activeTab === "valise" && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Luggage className="h-5 w-5 text-teal-600" />
                  <span>Préparation de Valise Intelligente</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  L'IA calcule la météo locale sur place et compose votre dressing optimisé.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tripDestination}
                  onChange={(e) => setTripDestination(e.target.value)}
                  className="px-3.5 py-1.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 font-medium focus:outline-none focus:border-teal-500"
                />
                <span className="text-xs text-slate-400 font-medium">({tripDays} jours)</span>
              </div>
            </div>

            {/* Simulated Weather */}
            <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-amber-900 font-semibold">
                <Sun className="h-4 w-4 text-amber-600" />
                <span>Météo Thaïlande : 30°C - 33°C • Climat tropical chaud & humide</span>
              </div>
              <span className="text-[11px] text-amber-700 font-medium">Recommandation : lin & matières aérées</span>
            </div>

            {/* Checklist */}
            <div className="space-y-2.5 pt-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Checklist à cocher dans la valise :
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 text-xs">
                {[
                  { id: "c-2", label: "3x T-shirts écru coton respirant", note: "Déjà dans votre dressing" },
                  { id: "c-3", label: "1x Pantalon Chino léger kaki (temples)", note: "Indispensable temples bouddhistes" },
                  { id: "lin-1", label: "2x Chemisettes lin / coton sable", note: "Matière aérée anti-chaleur" },
                  { id: "c-1", label: "1x Surchemise terracotta (clim avion & train)", note: "Indispensable climatisations" },
                  { id: "maillot-1", label: "2x Maillots de bain séchage rapide", note: "Îles & plages" },
                  { id: "creme-soleil-1", label: "Crème solaire minérale 50 + Répulsif DEET", note: "Pharmacie voyage" },
                  { id: "adaptateur-1", label: "Adaptateur prise universel + Powerbank", note: "Bagage cabine" },
                ].map((item) => {
                  const isChecked = !!packedItems[item.id];
                  return (
                    <div
                      key={item.id}
                      onClick={() => togglePacked(item.id)}
                      className={`p-3.5 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all select-none ${
                        isChecked
                          ? "bg-slate-50 border-slate-200/60 opacity-60 line-through"
                          : "bg-white border-slate-200/70 hover:border-teal-500/50 shadow-sm"
                      }`}
                    >
                      <div
                        className={`h-4 w-4 rounded-md mt-0.5 flex items-center justify-center shrink-0 border ${
                          isChecked
                            ? "bg-teal-600 border-teal-600 text-white"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{item.label}</p>
                        <p className="text-[10px] text-slate-500 no-underline">{item.note}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
