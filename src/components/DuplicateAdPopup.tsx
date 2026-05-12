import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ad } from "./HistoryDrawer";
import {
  BrandRef,
  CampaignFormat,
  Language,
  Pacing,
  ProjectBrief,
  Provider,
} from "@/types";
import { BriefPanelBase } from "./BriefPanelBase";
import { useToneOfVoice } from "@/hooks/useToneOfVoice";
import { useRouter } from "next/navigation";
import { BrandDossier, MarketRow } from "@/lib/alaric-client";
import { useAdBriefNotChanged } from "@/hooks/ad-brief-not-changed";
import { GlassyModal } from "./ui/GlassyModal";

/** Payload posted to `/api/ads/:adId/duplicate` to create a new ad copied from an existing one, optionally overriding its brief. */
export type CreateAd = {
  /** Display name for the new ad. Defaults to `"Copy of <source ad name>"` in the popup. */
  name: string;
  /** Brief persisted on the new ad — built from the popup's form state, which is seeded from the source ad's brief and edited by the user before submit. */
  brief: ProjectBrief;
};

/** Props for {@link DuplicateAdPopup}: the source ad to duplicate plus a close callback that optionally receives the freshly created ad. */
export type DuplicateAdPopupProps = {
  /** The ad being duplicated. Its brief seeds the form fields and its name is shown in the modal header. */
  ad: Ad;
  /** Invoked when the modal is dismissed. Called with no args on cancel/backdrop/Escape, or with the newly created ad after a successful duplicate. */
  onClose: (ad?: Ad) => void;
};

/** Modal that lets the user duplicate an existing ad, editing its brief and title before creation. Submitting triggers either a plain duplicate or a duplicate-and-generate depending on whether the brief changed. */
export const DuplicateAdPopup = ({ ad, onClose }: DuplicateAdPopupProps) => {
  const router = useRouter();

  // Track which sf account id we last fetched the dossier for. Avoids
  // refetching when state churns from other field edits.
  const lastFetchedSfIdRef = useRef<string | null>(null);

  const [name, setName] = useState<string>(`Copy of ${ad.meta.name}`);

  const { toneOptions, toneInstructions } = useToneOfVoice();

  const [brand, setBrand] = useState<BrandRef | null>(() => {
    if (ad.meta.brief?.brand) return ad.meta.brief.brand;
    if (ad.meta.brief?.salesforceAccountId) {
      return {
        name: "",
        salesforceAccountId: ad.meta.brief.salesforceAccountId,
        salesforceAccountSnapshot: null,
      };
    }
    return null;
  });

  const [selectedRegion, setSelectedRegion] = useState<string | null>(
    ad.meta.brief?.selectedRegion || null,
  );

  const [selectedLanguage, setSelectedLanguage] = useState<Language>(
    ad.meta.brief?.selectedLanguage || "en",
  );

  const handleMarketChanged = useCallback(
    (alpha2: string | null, market: MarketRow | null) => {
      setSelectedRegion(alpha2);
      // Default language from market.language.code IFF the user hasn't
      // already chosen a language (don't clobber). The "default" check is
      // the current `selectedLanguage` matching its initial "en" default.
      if (market && selectedLanguage === "en" && market.language.code) {
        setSelectedLanguage(market.language.code as Language);
      }
    },
    [selectedLanguage],
  );

  const [dossier, setDossier] = useState<BrandDossier | null>(null);
  const [isLoadingDossier, setIsLoadingDossier] = useState(false);
  const [enrichmentSummary, setEnrichmentSummary] = useState<
    { slotCount: number; lastEnrichedAt?: number } | undefined
  >(undefined);

  const [creativeBrief, setCreativeBrief] = useState(
    ad.meta.brief?.creativeBrief || "",
  );

  const [creativeAngle, setCreativeAngle] = useState(
    ad.meta.brief?.creativeAngle || "",
  );

  const [selectedTone, setSelectedTone] = useState<string | null>(
    ad.meta.brief?.selectedTone || null,
  );

  const [voiceInstructions, setVoiceInstructions] = useState<string>(
    ad.meta.brief?.voiceInstructions || "",
  );

  const [campaignFormat, setCampaignFormat] = useState<CampaignFormat>(
    ad.meta.brief?.campaignFormat || "ad_read",
  );

  const [selectedPacing, setSelectedPacing] = useState<Pacing | null>(
    ad.meta.brief?.selectedPacing ?? "fast",
  );

  const [selectedCTA, setSelectedCTA] = useState<string | null>(
    ad.meta.brief?.selectedCTA || null,
  );

  const [adDuration, setAdDuration] = useState(ad.meta.brief?.adDuration || 30);

  const [selectedProvider, setSelectedProvider] = useState<Provider>(
    ad.meta.brief?.selectedProvider || "any",
  );

  const [voiceCounts, setVoiceCounts] = useState<Record<Provider, number>>({
    elevenlabs: 0,
    lovo: 0,
    openai: 0,
    qwen: 0,
    bytedance: 0,
    lahajati: 0,
    any: 0,
  });

  const [referenceUrlsText, setReferenceUrlsText] = useState(
    (ad.meta.brief?.referenceUrls || []).join("\n"),
  );
  const [forbiddenWords, setForbiddenWords] = useState(
    ad.meta.brief?.forbiddenWords || "",
  );
  const [providedScript, setProvidedScript] = useState(
    ad.meta.brief?.providedScript || "",
  );

  const [selectedAccent, setSelectedAccent] = useState<string>(
    ad.meta.brief?.selectedAccent || "neutral",
  );

  const [error, setError] = useState<string | null>(null);

  const [isDuplicating, setDuplicating] = useState(false);

  // Legacy `brandVoice` text from pre-v4 briefs — surfaced read-only.
  const legacyBrandVoice = ad.meta.brief?.brandVoice ?? null;

  const parsedReferenceUrls = useMemo(
    () =>
      referenceUrlsText
        .split(/\n+/)
        .map((u) => u.trim())
        .filter((u) => u.length > 0),
    [referenceUrlsText],
  );

  const showAngleNudge =
    !creativeAngle.trim() &&
    !!(
      brand?.salesforceAccountId ||
      brand?.name ||
      parsedReferenceUrls.length > 0
    );

  const brief = useMemo(
    () => ({
      // clientDescription is required on the type but v4 has no UI for
      // it — derive from brand name so legacy readers don't blow up.
      // The LLM also reads creativeBrief which carries the actual content.
      clientDescription: brand?.name || "",
      creativeBrief,
      campaignFormat,
      adDuration,
      selectedCTA: selectedCTA || null,
      selectedPacing: selectedPacing || null,
      selectedTone: selectedTone || null,
      voiceInstructions: voiceInstructions.trim() || null,
      selectedLanguage,
      selectedRegion: selectedRegion || null,
      selectedAccent,
      selectedProvider,
      ...(parsedReferenceUrls.length
        ? { referenceUrls: parsedReferenceUrls }
        : {}),
      ...(forbiddenWords.trim()
        ? { forbiddenWords: forbiddenWords.trim() }
        : {}),
      ...(providedScript.trim()
        ? { providedScript: providedScript.trim() }
        : {}),
      ...(creativeAngle.trim() ? { creativeAngle: creativeAngle.trim() } : {}),
      ...(brand?.salesforceAccountId
        ? { salesforceAccountId: brand.salesforceAccountId }
        : {}),
      ...(brand ? { brand } : {}),
      // Preserve legacy brandVoice on round-trip so display stays stable.
      ...(legacyBrandVoice ? { brandVoice: legacyBrandVoice } : {}),
    }),
    [
      brand,
      creativeBrief,
      campaignFormat,
      adDuration,
      selectedCTA,
      selectedPacing,
      selectedTone,
      voiceInstructions,
      selectedLanguage,
      selectedRegion,
      selectedAccent,
      selectedProvider,
      parsedReferenceUrls,
      forbiddenWords,
      providedScript,
      creativeAngle,
    ],
  );

  const isNotChanged = useAdBriefNotChanged(ad.meta.brief, brief);

  const onDuplicate = async (ad: Ad, triggerGeneration: boolean) => {
    try {
      setDuplicating(true);

      const newAd: CreateAd = {
        name,
        brief,
      };

      const res = await fetch(`/api/ads/${ad.adId}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAd),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error);
      } else {
        onClose(json);

        if (triggerGeneration) {
          console.log("trigger generation");
          router.push(`/ad/${json.adId}?auto_generate=1`);
        } else {
          router.push(`/ad/${json.adId}`);
        }
      }
    } catch (err) {
      const error =
        err instanceof Error
          ? err
          : typeof err === "string"
            ? new Error(err)
            : new Error("Unknown error", { cause: err });

      console.error(err);
      setError(error.message);
    } finally {
      setDuplicating(false);
    }
  };

  useEffect(() => {
    const sfId = brand?.salesforceAccountId ?? null;

    if (!sfId) {
      setDossier(null);
      setEnrichmentSummary(undefined);
      lastFetchedSfIdRef.current = null;
      return;
    }

    if (lastFetchedSfIdRef.current === sfId) return;
    lastFetchedSfIdRef.current = sfId;

    const controller = new AbortController();
    setIsLoadingDossier(true);
    fetch("/api/brand-context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "sf-account",
        accountId: sfId,
        ...(selectedRegion ? { marketAlpha2: selectedRegion } : {}),
      }),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) {
          setDossier(null);
          setEnrichmentSummary(undefined);
          return;
        }
        setDossier(data.dossier ?? null);
        setEnrichmentSummary(data.enrichmentSummary);
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== "AbortError") {
          console.warn("[BriefPanelV4] dossier fetch failed:", err);
          setDossier(null);
          setEnrichmentSummary(undefined);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingDossier(false);
      });
    return () => controller.abort();
  }, [brand?.salesforceAccountId, selectedRegion]);

  const [dialogReady, setDialogReady] = useState(true);
  const handleLanguageOptionsResolved = useCallback(
    (resolved: {
      voiceCounts: Record<Provider, number>;
      dialogReady: boolean;
    }) => {
      setVoiceCounts(resolved.voiceCounts);
      setDialogReady(resolved.dialogReady);
    },
    [],
  );

  const handleClose = () => {
    if (!isDuplicating) onClose();
  };

  return (
    <GlassyModal
      isOpen
      onClose={handleClose}
      title="Duplicate Ad"
      description={`Create a copy of "${ad.meta.name}".`}
      maxWidth="5xl"
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Title
          </label>
          <input
            value={name}
            disabled={isDuplicating}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onDuplicate(ad, !isNotChanged);
            }}
            className="w-full bg-white/10 text-white font-medium text-sm rounded p-3 outline-none ring-1 ring-blue-500/50 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <BriefPanelBase
          brand={brand}
          onBrandChanged={setBrand}
          region={selectedRegion}
          onRegionChanged={setSelectedRegion}
          onMarketChanged={handleMarketChanged}
          dossier={dossier}
          isLoadingDossier={isLoadingDossier}
          enrichmentSummary={enrichmentSummary}
          legacyBrandVoice={legacyBrandVoice}
          isGenerating={false}
          creativeBrief={creativeBrief}
          onCreativeBriefChanged={setCreativeBrief}
          creativeAngle={creativeAngle}
          onCreativeAngleChanged={setCreativeAngle}
          tone={selectedTone}
          onToneChanged={setSelectedTone}
          toneOptions={toneOptions}
          toneInstructions={toneInstructions}
          voiceInstructions={voiceInstructions}
          onVoiceInstructionsChanged={setVoiceInstructions}
          campaignFormat={campaignFormat}
          onCampaignFormatChanged={setCampaignFormat}
          pacing={selectedPacing}
          onPacingChanged={setSelectedPacing}
          cta={selectedCTA}
          onCTAChanged={setSelectedCTA}
          adDuration={adDuration}
          onAdDurationChanged={setAdDuration}
          provider={selectedProvider}
          onProviderChanged={setSelectedProvider}
          voiceCounts={voiceCounts}
          dialogReady={dialogReady}
          referenceUrlsText={referenceUrlsText}
          onReferenceUrlsTextChanged={setReferenceUrlsText}
          forbiddenWords={forbiddenWords}
          onForbiddenWordsChanged={setForbiddenWords}
          providedScript={providedScript}
          onProvidedScriptChanged={setProvidedScript}
          showAngleNudge={showAngleNudge}
          language={selectedLanguage}
          onLanguageChanged={setSelectedLanguage}
          accent={selectedAccent}
          onAccentChanged={setSelectedAccent}
          onLanguageOptionsResolved={handleLanguageOptionsResolved}
          error={error}
        />
        <div className="flex justify-between">
          <button
            disabled={isDuplicating}
            onClick={() => onClose()}
            className="px-6 py-3 bg-wb-blue hover:bg-wb-blue/80 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={isDuplicating}
            onClick={() => onDuplicate(ad, !isNotChanged)}
            className="px-6 py-3 bg-wb-blue hover:bg-wb-blue/80 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
          >
            {isDuplicating
              ? "Duplicating..."
              : isNotChanged
                ? "Duplicate"
                : "Duplicate & Generate"}
          </button>
        </div>
      </div>
    </GlassyModal>
  );
};
