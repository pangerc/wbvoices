/**
 * DossierSummary — small badge that surfaces alaric's BrandDossier load
 * state under the brand picker. v3 Stage R lesson: don't show a manual
 * "Enrich" button (empty success theater); show the *result* implicitly.
 */

import type { BrandDossier } from "@/lib/alaric-client";

export interface DossierSummaryProps {
  dossier: BrandDossier | null;
  isLoading: boolean;
  enrichmentSummary?: { slotCount: number; lastEnrichedAt?: number };
}

function formatRelative(timestamp?: number): string | null {
  if (!timestamp) return null;
  const diffMs = Date.now() - timestamp;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function DossierSummary({
  dossier,
  isLoading,
  enrichmentSummary,
}: DossierSummaryProps) {
  if (isLoading) {
    return (
      <div className="text-xs text-gray-400 italic">
        Loading brand dossier…
      </div>
    );
  }

  if (!dossier) return null;

  const slotCount =
    enrichmentSummary?.slotCount ?? dossier.meta.reportTypesPresent.length;
  const lastEnriched = formatRelative(
    enrichmentSummary?.lastEnrichedAt ?? dossier.meta.lastEnrichedAt
  );

  if (dossier.meta.state === "empty") {
    return (
      <div className="text-xs text-gray-500">
        No alaric intelligence yet for this brand
      </div>
    );
  }

  return (
    <div className="text-xs text-gray-400">
      Dossier loaded — {slotCount} slot{slotCount === 1 ? "" : "s"}
      {lastEnriched ? ` · last enriched ${lastEnriched}` : ""}
      {dossier.meta.state === "thin" ? " · thin" : ""}
    </div>
  );
}
