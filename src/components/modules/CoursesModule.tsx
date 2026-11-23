import React, { useRef, useState } from "react";
import {
  ShoppingBag,
  Sparkles,
  Search,
  Plus,
  Coins,
  Camera,
  Check,
  Trash2,
  Loader2,
  AlertCircle,
  ChefHat,
  Wand2,
  X,
} from "lucide-react";
import { aiPost } from "@/lib/aiClient";
import type { EnergyLevel, PantryItem, RecipeItem, ShoppingItem } from "@/types";
import type { ScannedFoodProduct } from "@/app/api/food/scan/route";

interface CoursesModuleProps {
  energyLevel: EnergyLevel;
  pantry: PantryItem[];
  recipes: RecipeItem[];
  shoppingList: ShoppingItem[];
  onAddPantryItem: (item: Omit<PantryItem, "id">) => void;
  onAddMultiplePantryItems: (items: Array<Omit<PantryItem, "id">>) => void;
  onUpdatePantryStatus: (id: string, status: PantryItem["status"]) => void;
  onDeletePantryItem: (id: string) => void;
  onSetRecipes: (recipes: RecipeItem[]) => void;
  onAddShoppingItem: (item: Omit<ShoppingItem, "id" | "checked">) => void;
  onToggleShoppingItem: (id: string) => void;
  onDeleteShoppingItem: (id: string) => void;
  onClearCheckedShopping: () => void;
}

export const CoursesModule: React.FC<CoursesModuleProps> = ({
  energyLevel,
  pantry,
  recipes,
  shoppingList,
  onAddPantryItem,
  onAddMultiplePantryItems,
  onUpdatePantryStatus,
  onDeletePantryItem,
  onSetRecipes,
  onAddShoppingItem,
  onToggleShoppingItem,
  onDeleteShoppingItem,
  onClearCheckedShopping,
}) => {
  // Scanner Open Food Facts
  const [searchQuery, setSearchQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedProducts, setScannedProducts] = useState<ScannedFoodProduct[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Ajout manuel frigo & Saisie IA rapide
  const [showManualPantry, setShowManualPantry] = useState(false);
  const [pantryName, setPantryName] = useState("");
  const [pantryCat, setPantryCat] = useState<PantryItem["category"]>("frais");
  const [pantryQty, setPantryQty] = useState("1");

  const [showAiPantry, setShowAiPantry] = useState(false);
  const [photoNotice, setPhotoNotice] = useState(false);
  const [aiPantryText, setAiPantryText] = useState("");
  const [aiPantryLoading, setAiPantryLoading] = useState(false);
  const [aiPantryError, setAiPantryError] = useState<string | null>(null);
  const aiPantryRef = useRef<HTMLTextAreaElement | null>(null);

  // Recettes IA
  const [selectedRecipeIdx, setSelectedRecipeIdx] = useState(0);
  const [craving, setCraving] = useState("");
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipesError, setRecipesError] = useState<string | null>(null);

  // Ajout liste de courses
  const [shopName, setShopName] = useState("");
  const [shopCategory, setShopCategory] = useState("Frais & Légumes");
  const [shopPrice, setShopPrice] = useState("3.00");

  const handleSearchOpenFoodFacts = async () => {
    const q = searchQuery.trim();
    if (!q || scanning) return;
    setScanning(true);
    setScanError(null);
    setHasSearched(true);

    try {
      const res = await fetch(`/api/food/scan?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = (await res.json()) as { products?: ScannedFoodProduct[]; error?: string };
      if (!res.ok) {
        setScanError(data.error || "Erreur lors de la recherche Open Food Facts.");
        setScannedProducts([]);
      } else {
        setScannedProducts(data.products ?? []);
      }
    } catch {
      setScanError("Impossible de contacter le scanner Open Food Facts.");
      setScannedProducts([]);
    } finally {
      setScanning(false);
    }
  };

  const handleAddManualPantry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pantryName.trim()) return;
    onAddPantryItem({
      name: pantryName.trim(),
      category: pantryCat,
      quantity: pantryQty.trim() || "1",
      status: "disponible",
    });
    setPantryName("");
    setPantryQty("1");
    setShowManualPantry(false);
  };

  const handleParsePantryAi = async () => {
    if (!aiPantryText.trim() || aiPantryLoading) return;
    setAiPantryLoading(true);
    setAiPantryError(null);

    try {
      const data = await aiPost<{
        items: Array<{
          name: string;
          category: PantryItem["category"];
          quantity: string;
          yukaScore: number;
          yukaVerdict: PantryItem["yukaVerdict"];
        }>;
      }>("/api/ai/food", {
        action: "parse_pantry",
        text: aiPantryText.trim(),
      });
      if (data.items.length === 0) {
        setAiPantryError("Aucun aliment détecté dans le texte.");
      } else {
        onAddMultiplePantryItems(
          data.items.map((item) => ({
            ...item,
            status: "disponible",
          }))
        );
        setAiPantryText("");
        setShowAiPantry(false);
        setPhotoNotice(false);
      }
    } catch (err) {
      setAiPantryError(err instanceof Error ? err.message : "Erreur d'analyse IA.");
    } finally {
      setAiPantryLoading(false);
    }
  };

  const handleGenerateRecipes = async () => {
    if (recipesLoading) return;
    setRecipesLoading(true);
    setRecipesError(null);

    try {
      const res = await aiPost<{
        recipes: Array<Omit<RecipeItem, "id">>;
      }>("/api/ai/food", {
        action: "generate_recipes",
        pantry: pantry.filter((p) => p.status !== "a_racheter"),
        energyLevel,
        craving: craving.trim() || undefined,
      });
      if (res.recipes.length > 0) {
        const stamped: RecipeItem[] = res.recipes.map((r, i) => ({
          id: `rec-ai-${Date.now()}-${i}`,
          ...r,
        }));
        onSetRecipes(stamped);
        setSelectedRecipeIdx(0);
      }
    } catch (err) {
      setRecipesError(err instanceof Error ? err.message : "Erreur génération recettes.");
    } finally {
      setRecipesLoading(false);
    }
  };

  const handleAddMissingToShopping = (recipe: RecipeItem) => {
    const existingNames = new Set(shoppingList.map((s) => s.name.toLowerCase()));
    const missing = recipe.ingredients.filter(
      (ing) => !ing.inStock && !existingNames.has(ing.name.toLowerCase())
    );
    for (const ing of missing) {
      onAddShoppingItem({
        name: ing.name,
        category: "Recette du jour",
        priceEst: 2.5,
      });
    }
  };

  const handleAddShopping = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName.trim()) return;
    onAddShoppingItem({
      name: shopName.trim(),
      category: shopCategory,
      priceEst: Math.max(0, Number(shopPrice) || 0),
    });
    setShopName("");
  };

  const activeRecipe = recipes[selectedRecipeIdx] || recipes[0];
  const totalCost = shoppingList.reduce((acc, curr) => acc + curr.priceEst, 0);
  const checkedCount = shoppingList.filter((s) => s.checked).length;

  return (
    <div className="space-y-6">
      {/* Module Title */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-emerald-600" />
            <span>Food</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Scanner Open Food Facts en direct • Inventaire frigo • Recettes DeepSeek & Liste de courses
          </p>
        </div>

        <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs">
          Open Food Facts actif (gratuit)
        </span>
      </div>

      {/* Scanner Open Food Facts */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-3">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          <span>Scanner ou Vérifier un produit (Base réelle Open Food Facts)</span>
        </h4>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleSearchOpenFoodFacts()}
              placeholder="Code-barre (ex: 3017620422003) ou produit (ex: flocons avoine, chocolat noir 85%)..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 shadow-inner"
            />
          </div>
          <button
            onClick={() => void handleSearchOpenFoodFacts()}
            disabled={scanning || !searchQuery.trim()}
            className="px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-sm disabled:opacity-40 flex items-center gap-2"
          >
            {scanning && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Analyser</span>
          </button>
        </div>

        {scanError && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{scanError}</span>
          </div>
        )}

        {hasSearched && !scanning && !scanError && scannedProducts.length === 0 && (
          <p className="text-xs text-slate-500 pt-1">
            Aucun produit trouvé sur Open Food Facts pour « {searchQuery} ».
          </p>
        )}

        {scannedProducts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {scannedProducts.map((prod) => {
              const badgeStyle =
                prod.score >= 75
                  ? "text-emerald-800 bg-emerald-100 border-emerald-300"
                  : prod.score >= 55
                    ? "text-amber-800 bg-amber-100 border-amber-300"
                    : "text-rose-800 bg-rose-100 border-rose-300";
              return (
                <div
                  key={prod.code}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {prod.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={prod.imageUrl}
                        alt={prod.name}
                        className="h-12 w-12 rounded-xl object-cover bg-white border border-slate-200 shrink-0"
                      />
                    )}
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs font-bold text-slate-900 truncate">{prod.name}</p>
                      <p className="text-[11px] text-slate-500 truncate">{prod.brand}</p>
                      <p className="text-[11px] text-slate-600">{prod.additivesLabel}</p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            onAddPantryItem({
                              name: prod.name,
                              category: prod.suggestedCategory,
                              quantity: "1",
                              status: "disponible",
                              yukaScore: prod.score,
                              yukaVerdict: prod.verdict,
                            })
                          }
                          className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white border border-slate-200 hover:border-emerald-400 text-slate-800"
                        >
                          + Frigo
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onAddShoppingItem({
                              name: prod.name,
                              category: prod.suggestedCategory,
                              priceEst: 3.0,
                            })
                          }
                          className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white border border-slate-200 hover:border-slate-400 text-slate-800"
                        >
                          + Courses
                        </button>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`text-[11px] px-2.5 py-1 rounded-full font-bold border shrink-0 ${badgeStyle}`}
                  >
                    {prod.score}/100 · {prod.verdict}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Grid: Fridge Inventory & Recipe Ideas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Fridge & Pantry */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2 px-1">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Dans mon frigo & placards ({pantry.length} aliments)
            </h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowManualPantry((v) => !v)}
                className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Ajouter</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAiPantry((v) => !v);
                  setPhotoNotice(false);
                }}
                className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800"
              >
                <Wand2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Saisie IA rapide</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhotoNotice(true);
                  setShowAiPantry(true);
                  setTimeout(() => aiPantryRef.current?.focus(), 50);
                }}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200"
                title="Note sur la reconnaissance photo"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>Photo</span>
              </button>
            </div>
          </div>

          {showManualPantry && (
            <form
              onSubmit={handleAddManualPantry}
              className="p-4 rounded-2xl bg-white border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs shadow-sm"
            >
              <input
                type="text"
                value={pantryName}
                onChange={(e) => setPantryName(e.target.value)}
                placeholder="Aliment (ex: Skyr nature)"
                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
                required
              />
              <select
                value={pantryCat}
                onChange={(e) => setPantryCat(e.target.value as PantryItem["category"])}
                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
              >
                <option value="frais">Frais</option>
                <option value="epicerie">Épicerie</option>
                <option value="boissons">Boissons</option>
                <option value="surgeles">Surgelés</option>
              </select>
              <input
                type="text"
                value={pantryQty}
                onChange={(e) => setPantryQty(e.target.value)}
                placeholder="Qté (ex: 4 pots)"
                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold"
              >
                Enregistrer
              </button>
            </form>
          )}

          {showAiPantry && (
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-950">
                  Remplissage rapide du frigo par DeepSeek
                </span>
                <button
                  type="button"
                  onClick={() => setShowAiPantry(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {photoNotice && (
                <p className="text-[11px] text-emerald-900 bg-white/80 p-2.5 rounded-xl border border-emerald-200">
                  L'API DeepSeek utilisée ici étant un modèle texte (sans vision photo directe), dictez ou listez simplement ce que vous voyez dans votre frigo ci-dessous : l'IA trie et estime tout en 1 clic.
                </p>
              )}
              <textarea
                ref={aiPantryRef}
                rows={2}
                value={aiPantryText}
                onChange={(e) => setAiPantryText(e.target.value)}
                placeholder="Ex: 6 oeufs bio, 2 courgettes, 1 pot de pesto, lait d'avoine entamé, pavés de truite..."
                className="w-full p-3 rounded-xl bg-white border border-emerald-200 text-xs focus:outline-none"
              />
              {aiPantryError && (
                <p className="text-[11px] text-rose-700 font-semibold">{aiPantryError}</p>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleParsePantryAi()}
                  disabled={aiPantryLoading || !aiPantryText.trim()}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold disabled:opacity-40 flex items-center gap-1.5"
                >
                  {aiPantryLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Structurer et ajouter au frigo</span>
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {pantry.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-2 hover:border-slate-300 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 line-clamp-2">
                    {item.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeletePantryItem(item.id)}
                    aria-label="Supprimer l'aliment"
                    className="text-slate-300 hover:text-rose-600 shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Qté : {item.quantity}</span>
                  {item.yukaScore !== undefined && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                        item.yukaScore >= 75
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {item.yukaScore}/100
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const nextStatus: PantryItem["status"] =
                      item.status === "disponible"
                        ? "bientot_fini"
                        : item.status === "bientot_fini"
                          ? "a_racheter"
                          : "disponible";
                    onUpdatePantryStatus(item.id, nextStatus);
                  }}
                  className={`w-full text-left text-[10px] font-bold px-2.5 py-1 rounded-xl ${
                    item.status === "disponible"
                      ? "bg-teal-50 text-teal-800"
                      : item.status === "bientot_fini"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-rose-50 text-rose-800"
                  }`}
                >
                  {item.status === "disponible"
                    ? "En stock ✓"
                    : item.status === "bientot_fini"
                      ? "Bientôt fini !"
                      : "À racheter"}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right: AI Recipes */}
        <div className="lg:col-span-5 bg-white border border-slate-200/70 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <ChefHat className="h-4 w-4" />
              Idées Recettes (DeepSeek)
            </span>
            {activeRecipe && (
              <span className="text-xs text-slate-400 font-mono">
                {activeRecipe.timeMinutes} min
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={craving}
              onChange={(e) => setCraving(e.target.value)}
              placeholder="Envie du moment ? (optionnel, ex: chaud, rapide)"
              className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
            />
            <button
              type="button"
              onClick={() => void handleGenerateRecipes()}
              disabled={recipesLoading}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 shrink-0"
            >
              {recipesLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              )}
              <span>Générer</span>
            </button>
          </div>

          {recipesError && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
              {recipesError}
            </p>
          )}

          {recipes.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {recipes.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRecipeIdx(i)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold shrink-0 border ${
                    i === selectedRecipeIdx
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                >
                  Recette {i + 1}
                </button>
              ))}
            </div>
          )}

          {activeRecipe && (
            <div className="space-y-3">
              <div>
                <h4 className="text-base font-bold text-slate-900">{activeRecipe.title}</h4>
                <p className="text-xs text-teal-700 font-semibold mt-1">
                  {activeRecipe.brainBenefit}
                </p>
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Ingrédients :
                </span>
                {activeRecipe.ingredients.map((ing, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs py-1.5 px-3 rounded-xl bg-slate-50 border border-slate-200/60"
                  >
                    <span className="text-slate-700">{ing.name}</span>
                    <span
                      className={`text-[10px] font-bold ${
                        ing.inStock ? "text-emerald-700" : "text-amber-700"
                      }`}
                    >
                      {ing.inStock ? "En stock ✓" : "À acheter"}
                    </span>
                  </div>
                ))}
              </div>

              {activeRecipe.instructions.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Préparation :
                  </span>
                  <ol className="text-xs text-slate-600 space-y-1 list-decimal list-inside">
                    {activeRecipe.instructions.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                <span>Coût estimé portion :</span>
                <span className="text-slate-900 font-bold font-mono">
                  ~{activeRecipe.costEstimatedEur.toFixed(2)} €
                </span>
              </div>

              {activeRecipe.ingredients.some((i) => !i.inStock) && (
                <button
                  type="button"
                  onClick={() => handleAddMissingToShopping(activeRecipe)}
                  className="w-full py-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-xs border border-emerald-200 transition-colors"
                >
                  + Ajouter les ingrédients manquants aux courses
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Shopping List CRUD */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-500" />
              <span>Liste de courses & Budget prévisionnel</span>
            </h4>
            <p className="text-xs text-slate-500">
              {shoppingList.length} article(s) · {checkedCount} coché(s)
            </p>
          </div>

          <div className="flex items-center gap-3">
            {checkedCount > 0 && (
              <button
                type="button"
                onClick={onClearCheckedShopping}
                className="text-xs font-bold text-slate-600 hover:text-rose-700 underline"
              >
                Vider les cochés
              </button>
            )}
            <div className="text-right">
              <span className="text-xs text-slate-400">Total : </span>
              <span className="text-base font-extrabold text-slate-900 font-mono">
                {totalCost.toFixed(2)} €
              </span>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleAddShopping}
          className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs"
        >
          <input
            type="text"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="Ajouter un article (ex: Citrons bio)..."
            className="sm:col-span-2 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
            required
          />
          <input
            type="text"
            value={shopCategory}
            onChange={(e) => setShopCategory(e.target.value)}
            placeholder="Rayon"
            className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200"
          />
          <input
            type="number"
            step="0.1"
            min="0"
            value={shopPrice}
            onChange={(e) => setShopPrice(e.target.value)}
            placeholder="Prix €"
            className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 font-mono"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold flex items-center justify-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Ajouter</span>
          </button>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 text-xs">
          {shoppingList.map((item) => (
            <div
              key={item.id}
              className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 transition-all ${
                item.checked
                  ? "bg-slate-50 border-slate-200/60 opacity-60"
                  : "bg-white border-slate-200/80 hover:border-slate-300 shadow-sm"
              }`}
            >
              <button
                type="button"
                onClick={() => onToggleShoppingItem(item.id)}
                className="flex items-center gap-3 text-left flex-1 min-w-0"
              >
                <div
                  className={`h-4 w-4 rounded-md flex items-center justify-center shrink-0 border ${
                    item.checked
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {item.checked && <Check className="h-3 w-3 stroke-[3]" />}
                </div>
                <div className="min-w-0">
                  <span
                    className={`font-bold text-slate-800 block truncate ${
                      item.checked ? "line-through" : ""
                    }`}
                  >
                    {item.name}
                  </span>
                  <span className="text-[10px] text-slate-400 block truncate">
                    {item.category}
                  </span>
                </div>
              </button>

              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-slate-600 font-semibold">
                  {item.priceEst.toFixed(2)} €
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteShoppingItem(item.id)}
                  aria-label="Supprimer de la liste"
                  className="text-slate-300 hover:text-rose-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
