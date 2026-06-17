import type { CreativeTemplate } from "@/hooks/useCreativeTemplates";
import { BrandDossier, MarketRow } from "@/lib/alaric-client";
import {
  BrandRef,
  CampaignFormat,
  Language,
  Pacing,
  ProjectStatus,
  Provider,
} from "@/types";
import { BrandTopic } from "./brief-topics/BrandTopic";
import { CreativeTopic } from "./brief-topics/CreativeTopic";
import { LanguageTopic } from "./brief-topics/LanguageTopic";
import { OpportunityTopic } from "./brief-topics/OpportunityTopic";
import { ToneOption } from "./ui";
import { CreativeTemplateGallery } from "./ui/CreativeTemplateGallery";

export type BriefPanelBaseProps = {
  brand: BrandRef | null;

  onBrandChanged: (next: BrandRef | null) => void;

  region: string | null;
  onRegionChanged: (next: string | null) => void;
  onMarketChanged: (alpha2: string | null, market: MarketRow | null) => void;

  dossier: BrandDossier | null;
  isLoadingDossier: boolean;

  enrichmentSummary: { slotCount: number; lastEnrichedAt?: number } | undefined;

  legacyBrandVoice: string | undefined | null;

  isGenerating: boolean;

  creativeBrief: string;
  onCreativeBriefChanged: (next: string) => void;

  creativeAngle: string;
  onCreativeAngleChanged: (next: string) => void;

  tone: string | null;
  onToneChanged: (next: string | null) => void;

  voiceInstructions: string;
  onVoiceInstructionsChanged: (next: string) => void;

  toneOptions: ToneOption[];
  toneInstructions: Record<string, string>;

  campaignFormat: CampaignFormat;
  onCampaignFormatChanged: (next: CampaignFormat) => void;

  pacing: Pacing | null;
  onPacingChanged: (next: Pacing | null) => void;

  cta: string | null;
  onCTAChanged: (next: string | null) => void;

  adDuration: number;
  onAdDurationChanged: (next: number) => void;

  provider: Provider;
  onProviderChanged: (next: Provider) => void;

  voiceCounts: Record<Provider, number>;
  dialogReady: boolean;

  referenceUrlsText: string;
  onReferenceUrlsTextChanged: (next: string) => void;

  forbiddenWords: string;
  onForbiddenWordsChanged: (next: string) => void;

  providedScript: string;
  onProvidedScriptChanged: (next: string) => void;

  showAngleNudge: boolean;

  language: Language;
  onLanguageChanged: (next: Language) => void;

  accent: string;
  onAccentChanged: (next: string) => void;

  onLanguageOptionsResolved: (resolved: {
    voiceCounts: Record<Provider, number>;
    dialogReady: boolean;
  }) => void;

  error: string | null;

  // Creative template gallery — owner of state lives upstream so the
  // duplicate-ad flow can opt out by simply not threading these in.
  selectedTemplateId?: string | null;
  onTemplateChanged?: (id: string | null) => void;
  creativeTemplates?: CreativeTemplate[];
  creativeTemplatesLoading?: boolean;

  // AAC-20 opportunity metadata. Opt-in like the gallery: the section only
  // renders when the caller wires the handlers (the duplicate-ad popup leaves
  // them out, so its brief form stays focused on the creative inputs).
  projectStatus?: ProjectStatus;
  onProjectStatusChanged?: (next: ProjectStatus) => void;
  opportunityUrl?: string;
  onOpportunityUrlChanged?: (next: string) => void;
  opportunityAmountText?: string;
  onOpportunityAmountTextChanged?: (next: string) => void;
};

export const BriefPanelBase = ({
  brand,
  onBrandChanged,
  region,
  onRegionChanged,
  onMarketChanged,
  dossier,
  isLoadingDossier,
  enrichmentSummary,
  legacyBrandVoice,
  isGenerating,
  creativeBrief,
  onCreativeBriefChanged,
  creativeAngle,
  onCreativeAngleChanged,
  tone,
  onToneChanged,
  voiceInstructions,
  onVoiceInstructionsChanged,
  toneOptions,
  toneInstructions,
  campaignFormat,
  onCampaignFormatChanged,
  pacing,
  onPacingChanged,
  cta,
  onCTAChanged,
  adDuration,
  onAdDurationChanged,
  provider,
  onProviderChanged,
  voiceCounts,
  dialogReady,
  referenceUrlsText,
  onReferenceUrlsTextChanged,
  forbiddenWords,
  onForbiddenWordsChanged,
  providedScript,
  onProvidedScriptChanged,
  showAngleNudge,
  language,
  onLanguageChanged,
  accent,
  onAccentChanged,
  onLanguageOptionsResolved,
  error,
  selectedTemplateId,
  onTemplateChanged,
  creativeTemplates,
  creativeTemplatesLoading,
  projectStatus,
  onProjectStatusChanged,
  opportunityUrl,
  onOpportunityUrlChanged,
  opportunityAmountText,
  onOpportunityAmountTextChanged,
}: BriefPanelBaseProps) => {
  // Render the gallery only when the caller wired both halves. Keeps the
  // duplicate-ad reuse path opt-in.
  const showGallery =
    onTemplateChanged !== undefined && creativeTemplates !== undefined;

  // Opportunity metadata section — opt-in (see prop docs).
  const showOpportunity =
    onProjectStatusChanged !== undefined &&
    onOpportunityUrlChanged !== undefined &&
    onOpportunityAmountTextChanged !== undefined;
  return (
    <div className="space-y-12">
      {showOpportunity && (
        <OpportunityTopic
          status={projectStatus ?? "exploration"}
          onStatusChanged={onProjectStatusChanged}
          opportunityUrl={opportunityUrl ?? ""}
          onOpportunityUrlChanged={onOpportunityUrlChanged}
          opportunityAmountText={opportunityAmountText ?? ""}
          onOpportunityAmountTextChanged={onOpportunityAmountTextChanged}
          disabled={isGenerating}
        />
      )}

      <BrandTopic
        brand={brand}
        onBrandChanged={onBrandChanged}
        marketAlpha2={region}
        onMarketChanged={onMarketChanged}
        dossier={dossier}
        isLoadingDossier={isLoadingDossier}
        enrichmentSummary={enrichmentSummary}
        legacyBrandVoice={legacyBrandVoice}
        disabled={isGenerating}
      />

      {showGallery && (
        <CreativeTemplateGallery
          value={selectedTemplateId ?? null}
          onChange={onTemplateChanged}
          templates={creativeTemplates}
          loading={creativeTemplatesLoading}
          disabled={isGenerating}
        />
      )}

      <CreativeTopic
        creativeBrief={creativeBrief}
        onCreativeBriefChanged={onCreativeBriefChanged}
        creativeAngle={creativeAngle}
        onCreativeAngleChanged={onCreativeAngleChanged}
        selectedTone={tone}
        onSelectedToneChanged={onToneChanged}
        voiceInstructions={voiceInstructions}
        onVoiceInstructionsChanged={onVoiceInstructionsChanged}
        toneOptions={toneOptions}
        toneInstructions={toneInstructions}
        campaignFormat={campaignFormat}
        onCampaignFormatChanged={onCampaignFormatChanged}
        selectedPacing={pacing}
        onSelectedPacingChanged={onPacingChanged}
        selectedCTA={cta}
        onSelectedCTAChanged={onCTAChanged}
        adDuration={adDuration}
        onAdDurationChanged={onAdDurationChanged}
        selectedProvider={provider}
        onSelectedProviderChanged={onProviderChanged}
        voiceCounts={voiceCounts}
        dialogReady={dialogReady}
        referenceUrlsText={referenceUrlsText}
        onReferenceUrlsChanged={onReferenceUrlsTextChanged}
        forbiddenWords={forbiddenWords}
        onForbiddenWordsChanged={onForbiddenWordsChanged}
        providedScript={providedScript}
        onProvidedScriptChanged={onProvidedScriptChanged}
        showAngleNudge={showAngleNudge}
        disabled={isGenerating}
      />

      <LanguageTopic
        selectedLanguage={language}
        onSelectedLanguageChanged={onLanguageChanged}
        campaignFormat={campaignFormat}
        selectedRegion={region}
        onSelectedRegionChanged={onRegionChanged}
        selectedAccent={accent}
        onSelectedAccentChanged={onAccentChanged}
        selectedProvider={provider}
        onSelectedProviderChanged={onProviderChanged}
        onLanguageOptionsResolved={onLanguageOptionsResolved}
        disabled={isGenerating}
      />

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
};
