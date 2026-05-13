/**
 * BrandTopic — Brand & Market identity in v4. Brand picker is exposed
 * (the spot's primary anchor); market is exposed alongside (grounds SF
 * search filtering and language defaults). A read-only `<details>` block
 * surfaces legacy `brandVoice` text from pre-v4 briefs without offering
 * to edit it — alaric's BrandDossier is now the canonical brand-voice
 * source.
 */

import type { BrandDossier, MarketRow } from "@/lib/alaric-client";
import type { BrandRef } from "@/types";
import { BrandPickerSubeditor } from "./subeditors/BrandPickerSubeditor";
import { DossierSummary } from "./subeditors/DossierSummary";
import { MarketPicker } from "./subeditors/MarketPicker";

export interface BrandTopicProps {
  brand: BrandRef | null;
  onBrandChanged: (brand: BrandRef | null) => void;

  marketAlpha2: string | null;
  onMarketChanged: (alpha2: string | null, market: MarketRow | null) => void;

  dossier: BrandDossier | null;
  isLoadingDossier: boolean;
  enrichmentSummary?: { slotCount: number; lastEnrichedAt?: number };

  legacyBrandVoice?: string | null;

  disabled?: boolean;
}

export function BrandTopic({
  brand,
  onBrandChanged,
  marketAlpha2,
  onMarketChanged,
  dossier,
  isLoadingDossier,
  enrichmentSummary,
  legacyBrandVoice,
  disabled,
}: BrandTopicProps) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">
          Brand & Market
        </h2>
        <p className="text-xs text-gray-500">
          Who the spot is for, where it runs.
        </p>
      </div>

      {legacyBrandVoice && legacyBrandVoice.trim().length > 0 && (
        <details className="text-xs text-gray-400 px-3 py-2 bg-white/5 rounded-lg border border-white/10">
          <summary className="cursor-pointer">
            Legacy brand voice (no longer used)
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-gray-500">
            {legacyBrandVoice}
          </p>
          <p className="mt-2 text-gray-600">
            Brand voice is now derived automatically from alaric&apos;s brand
            dossier. This text is preserved on the brief for legacy ads but no
            longer flows into generation.
          </p>
        </details>
      )}

      <div className="grid grid-cols-3 gap-6 items-start">
        <div>
          <MarketPicker
            value={marketAlpha2}
            onChange={onMarketChanged}
            disabled={disabled}
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Brand{" "}
            <span className="text-gray-500 font-normal">
              (Salesforce search or freetext for greenfield)
            </span>
          </label>
          <BrandPickerSubeditor
            brand={brand}
            onBrandChanged={onBrandChanged}
            marketAlpha2={marketAlpha2}
            disabled={disabled}
          />
          <div className="mt-2">
            <DossierSummary
              dossier={dossier}
              isLoading={isLoadingDossier}
              enrichmentSummary={enrichmentSummary}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
