import React, { useState } from "react";
import {
  ShoppingBag,
  Sparkles,
  Search,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Coins,
  Camera,
  Check,
} from "lucide-react";
import { PantryItem, RecipeItem } from "@/types";

interface CoursesModuleProps {
  pantry: PantryItem[];
  recipes: RecipeItem[];
  onAddPantryItem: (item: Partial<PantryItem>) => void;
}

export const CoursesModule: React.FC<CoursesModuleProps> = ({
  pantry,
  recipes,
  onAddPantryItem,
}) => {
  const [searchBarcode, setSearchBarcode] = useState("");
  const [scannedResult, setScannedResult] = useState<{
    name: string;
    brand: string;
    score: number;
    verdict: string;
    additives: string;
    verdictColor: string;
  } | null>(null);

  // Grocery list items to buy
  const [shoppingList, setShoppingList] = useState([
    { id: "s-1", name: "Jeunes pousses d'épinards Bio", category: "Frais & Légumes", priceEst: 2.20, checked: false },
    { id: "s-2", name: "Graines de courge Bio (vrac)", category: "Épicerie", priceEst: 3.50, checked: false },
    { id: "s-3", name: "Chocolat noir 85% sans lécithine", category: "Épicerie plaisir", priceEst: 2.80, checked: true },
    { id: "s-4", name: "Lait d'avoine sans sucres ajoutés", category: "Boissons végétales", priceEst: 1.95, checked: false },
  ]);

  const handleSimulateYukaScan = () => {
    if (!searchBarcode.trim()) return;

    setScannedResult({
      name: searchBarcode.length > 3 ? searchBarcode : "Granola Avoine & Amandes sans sucre",
      brand: "Bio Équitable",
      score: 88,
      verdict: "Excellent",
      additives: "0 additif à risque • Non ultra-transformé (NOVA 3)",
      verdictColor: "text-emerald-800 bg-emerald-100 border-emerald-300",
    });
  };

  const toggleShoppingItem = (id: string) => {
    setShoppingList((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const totalCost = shoppingList.reduce((acc, curr) => acc + curr.priceEst, 0);

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
            Inventaire intelligent • Recettes adaptées au cerveau • Chiffrage automatique des courses
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
            Abonnement Yuka actif
          </span>
        </div>
      </div>

      {/* Yuka Scanner Bar */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-3">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-600" />
          <span>Scanner ou Vérifier un produit (Base Yuka / Open Food Facts)</span>
        </h4>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              value={searchBarcode}
              onChange={(e) => setSearchBarcode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSimulateYukaScan()}
              placeholder="Scanner code-barre ou taper un produit (ex: Pâte à tartiner, Yaourt grec, Huile de colza)..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 shadow-inner"
            />
          </div>
          <button
            onClick={handleSimulateYukaScan}
            className="px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-sm"
          >
            Analyser
          </button>
        </div>

        {scannedResult && (
          <div className="mt-3 p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex items-start justify-between gap-4 animate-in fade-in duration-200">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">{scannedResult.name}</span>
                <span className="text-[10px] text-slate-500">({scannedResult.brand})</span>
              </div>
              <p className="text-xs text-slate-700 mt-1">{scannedResult.additives}</p>
            </div>

            <div className="text-right shrink-0">
              <span className={`text-xs px-3 py-1 rounded-full font-bold border ${scannedResult.verdictColor}`}>
                {scannedResult.score}/100 • {scannedResult.verdict}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Grid: Fridge Inventory & Recipe Idea */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Fridge & Pantry */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Dans mon frigo & placards ({pantry.length} aliments tracés)
            </h4>
            <button className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold hover:text-emerald-800">
              <Camera className="h-3.5 w-3.5" />
              <span>Photo du frigo</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {pantry.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-1 hover:border-slate-300 transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 truncate">
                    {item.name}
                  </span>
                  {item.yukaScore && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                        item.yukaScore >= 80
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : "bg-amber-100 text-amber-800 border border-amber-200"
                      }`}
                    >
                      Yuka {item.yukaScore}/100
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>Qté : {item.quantity}</span>
                  <span className="text-teal-700 font-bold">En stock ✓</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Recipe Suggestion */}
        <div className="lg:col-span-5 bg-white border border-slate-200/70 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="h-4 w-4" />
              Recette Cerveau du Jour
            </span>
            <span className="text-xs text-slate-400 font-mono">{recipes[0].timeMinutes} min</span>
          </div>

          <div>
            <h4 className="text-base font-bold text-slate-900">{recipes[0].title}</h4>
            <p className="text-xs text-teal-700 font-semibold mt-1">
              {recipes[0].brainBenefit}
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Ingrédients nécessaires :
            </span>
            {recipes[0].ingredients.map((ing, i) => (
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

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
            <span>Coût estimé portion :</span>
            <span className="text-slate-900 font-bold font-mono">
              ~{recipes[0].costEstimatedEur.toFixed(2)} €
            </span>
          </div>
        </div>
      </div>

      {/* Shopping List & Budget Calculator */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200/70 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-500" />
              <span>Liste de courses intelligente & Budget prévisionnel</span>
            </h4>
            <p className="text-xs text-slate-500">
              Générée automatiquement d'après vos menus et les manques du frigo.
            </p>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400">Total prévisionnel : </span>
            <span className="text-base font-extrabold text-slate-900 font-mono">
              {totalCost.toFixed(2)} €
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 text-xs">
          {shoppingList.map((item) => (
            <div
              key={item.id}
              onClick={() => toggleShoppingItem(item.id)}
              className={`p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all select-none ${
                item.checked
                  ? "bg-slate-50 border-slate-200/60 opacity-60 line-through"
                  : "bg-white border-slate-200/80 hover:border-slate-300 shadow-sm"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`h-4 w-4 rounded-md flex items-center justify-center shrink-0 border ${
                    item.checked
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {item.checked && <Check className="h-3 w-3 stroke-[3]" />}
                </div>
                <div>
                  <span className="font-bold text-slate-800">{item.name}</span>
                  <span className="text-[10px] text-slate-400 block no-underline">
                    Rayon : {item.category}
                  </span>
                </div>
              </div>
              <span className="font-mono text-slate-600 font-semibold shrink-0 no-underline">
                {item.priceEst.toFixed(2)} €
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
