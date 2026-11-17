"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, FileText, Loader2 } from "lucide-react";

function normalizeUrl(raw: string | null): string {
    if (!raw) return "";
    if (raw.startsWith("http://")) return `https://${raw.slice("http://".length)}`;
    return raw;
}

function InvoiceViewer() {
    const searchParams = useSearchParams();
    const url = normalizeUrl(searchParams.get("url"));

    const [checking, setChecking] = useState(true);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!url) {
            setChecking(false);
            setError("Aucun lien de facture fourni.");
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                const response = await fetch(
                    `/api/gmail/invoice/download?check=1&url=${encodeURIComponent(url)}`,
                    { cache: "no-store", credentials: "same-origin" }
                );
                const data = (await response.json()) as { ok?: boolean; error?: string };
                if (cancelled) return;
                if (data.ok) {
                    setReady(true);
                } else {
                    setError(data.error ?? "La facture n'a pas pu être chargée.");
                }
            } catch {
                if (!cancelled) setError("Impossible de vérifier le lien de la facture.");
            } finally {
                if (!cancelled) setChecking(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [url]);

    if (checking) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                    <span>Chargement de la facture…</span>
                </div>
            </div>
        );
    }

    if (!ready) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
                <div className="max-w-lg w-full bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                    <div className="flex items-center gap-2 text-slate-900">
                        <FileText className="h-5 w-5 text-indigo-600" />
                        <h1 className="text-base font-extrabold">Facture indisponible en aperçu</h1>
                    </div>
                    <p className="text-xs text-slate-600">
                        {error ?? "Le fournisseur n'a pas renvoyé de fichier PDF exploitable."}
                    </p>
                    <p className="text-[11px] text-slate-500">
                        Le lien fourni peut exiger une connexion à votre espace client EEC. Ouvrez-le directement
                        sur le site du fournisseur pour récupérer la facture.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {url && (
                            <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Ouvrir sur le site du fournisseur
                            </a>
                        )}
                        <a
                            href="/"
                            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                        >
                            Retour à l'assistant
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-slate-900 flex flex-col">
            <div className="flex items-center justify-between gap-3 px-4 py-2 bg-slate-900 text-slate-200 text-xs">
                <span className="flex items-center gap-1.5 font-bold">
                    <FileText className="h-3.5 w-3.5 text-indigo-400" />
                    Aperçu de la facture
                </span>
                <div className="flex items-center gap-2">
                    <a
                        href={`/api/gmail/invoice/download?dl=1&url=${encodeURIComponent(url)}`}
                        className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 font-bold"
                    >
                        Télécharger le PDF
                    </a>
                    <a href="/" className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold">
                        Fermer
                    </a>
                </div>
            </div>
            <iframe
                title="Facture PDF"
                src={`/api/gmail/invoice/download?url=${encodeURIComponent(url)}`}
                className="flex-1 w-full bg-white"
            />
        </div>
    );
}

export default function InvoicePage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                </div>
            }
        >
            <InvoiceViewer />
        </Suspense>
    );
}
