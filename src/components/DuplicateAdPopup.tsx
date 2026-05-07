import { useMemo, useState } from "react";
import { Ad } from "./HistoryDrawer";
import {
  CampaignFormat,
  Language,
  Pacing,
  ProjectBrief,
  Provider,
} from "@/types";
import { BriefPanelBase } from "./BriefPanelBase";
import { useToneOfVoice } from "@/hooks/useToneOfVoice";
import { useRouter } from "next/navigation";

export type CreateAd = {
  name: string;
  brief?: ProjectBrief;
};

export type DuplicateAdPopupProps = {
  ad: Ad;

  onClose: (ad?: Ad) => void;
};

export const DuplicateAdPopup = ({ ad, onClose }: DuplicateAdPopupProps) => {
  const router = useRouter();

  const [name, setName] = useState<string>(`Copy of ${ad.meta.name}`);

  // Form state - initialized from initialBrief if provided
  const [clientDescription, setClientDescription] = useState(
    ad.meta.brief.clientDescription || "",
  );
  const [creativeBrief, setCreativeBrief] = useState(
    ad.meta.brief.creativeBrief || "",
  );
  const [campaignFormat, setCampaignFormat] = useState<CampaignFormat>(
    ad.meta.brief.campaignFormat || "ad_read",
  );
  const [adDuration, setAdDuration] = useState(ad.meta.brief.adDuration || 30);
  const [selectedCTA, setSelectedCTA] = useState<string | null>(
    ad.meta.brief.selectedCTA || null,
  );
  const [selectedPacing, setSelectedPacing] = useState<Pacing | null>(
    ad.meta.brief.selectedPacing || null,
  );
  const [selectedTone, setSelectedTone] = useState<string | null>(
    ad.meta.brief.selectedTone || null,
  );
  const [voiceInstructions, setVoiceInstructions] = useState<string>(
    ad.meta.brief.voiceInstructions || "",
  );

  // Voice selection state (local - replaces voiceManager)
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(
    ad.meta.brief.selectedLanguage || "en",
  );
  const [selectedRegion, setSelectedRegion] = useState<string | null>(
    ad.meta.brief.selectedRegion || null,
  );
  const [selectedAccent, setSelectedAccent] = useState<string>(
    ad.meta.brief.selectedAccent || "neutral",
  );
  const [selectedProvider, setSelectedProvider] = useState<Provider>(
    ad.meta.brief.selectedProvider || "any",
  );

  // const { dbToneOptions, dbToneInstructions } = useToneOfVoice();

  const [error, setError] = useState<string | null>(null);

  const [isDuplicating, setDuplicating] = useState(false);

  const onDuplicate = async (ad: Ad, triggerGeneration: boolean) => {
    try {
      setDuplicating(true);

      const newAd: CreateAd = {
        name,
        brief: {
          clientDescription,
          creativeBrief,
          campaignFormat,
          selectedLanguage,
          selectedProvider,
          selectedRegion,
          adDuration,
          selectedAccent,
          selectedCTA,
          selectedPacing,
        },
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

  const isNotChanged = useMemo(() => {
    if (ad.meta.brief.clientDescription !== clientDescription) {
      return false;
    }

    if (ad.meta.brief.creativeBrief !== creativeBrief) {
      return false;
    }

    if (ad.meta.brief.campaignFormat !== campaignFormat) {
      return false;
    }

    if (ad.meta.brief.adDuration !== adDuration) {
      return false;
    }

    if (ad.meta.brief.selectedCTA !== selectedCTA) {
      return false;
    }

    if (ad.meta.brief.selectedPacing !== selectedPacing) {
      return false;
    }

    if (ad.meta.brief.selectedTone !== selectedTone) {
      return false;
    }

    if (
      ad.meta.brief.voiceInstructions !== voiceInstructions &&
      ad.meta.brief.voiceInstructions !== null &&
      voiceInstructions !== "" &&
      ad.meta.brief.voiceInstructions !== "" &&
      voiceInstructions !== null
    ) {
      return false;
    }

    if (ad.meta.brief.selectedLanguage !== selectedLanguage) {
      return false;
    }

    if (
      ad.meta.brief.selectedRegion !== selectedRegion &&
      ad.meta.brief.selectedRegion !== null &&
      selectedRegion !== "all" &&
      ad.meta.brief.selectedRegion !== "all" &&
      selectedRegion !== null
    ) {
      return false;
    }

    if (ad.meta.brief.selectedAccent !== selectedAccent) {
      return false;
    }

    if (ad.meta.brief.selectedProvider !== selectedProvider) {
      return false;
    }

    return true;
  }, [
    ad,
    clientDescription,
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
  ]);

  const onClickBackdrop = () => {
    if (!isDuplicating) onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/10 backdrop-blur-sm z-50 transition-opacity duration-300"
        onClick={() => onClickBackdrop()}
      />

      <div className="fixed container overflow-y-auto z-60 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="bg-zinc-900/50 rounded-md p-5 flex flex-col gap-4">
          <div>
            Duplicate ad <strong>"{ad.meta.name}"</strong>?{" "}
            {isNotChanged ? "is-not" : "it-is"}
          </div>
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
                if (e.key === "Escape") onClose();
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-white/10 text-white font-medium text-sm rounded p-3 outline-none ring-1 ring-blue-500/50 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <div>
            {/* <BriefPanelBase
              disabled={isDuplicating}
              clientDescription={clientDescription}
              onClientDescriptionChanged={setClientDescription}
              creativeBrief={creativeBrief}
              onCreativeBriefChanged={setCreativeBrief}
              language={selectedLanguage}
              onLanguageChanged={setSelectedLanguage}
              campaignFormat={campaignFormat}
              onCampaignFormatChanged={setCampaignFormat}
              region={selectedRegion}
              onRegionChanged={setSelectedRegion}
              provider={selectedProvider}
              onProviderChanged={setSelectedProvider}
              accent={selectedAccent}
              onAccentChanged={setSelectedAccent}
              cta={selectedCTA}
              onCTAChanged={setSelectedCTA}
              pacing={selectedPacing}
              onPacingChanged={setSelectedPacing}
              toneOfVoice={selectedTone}
              onToneOfVoiceChanged={setSelectedTone}
              toneOfVoiceOptions={dbToneOptions}
              toneOfVoiceList={dbToneInstructions}
              voiceInstructions={voiceInstructions}
              onVoiceInstructionsChanged={setVoiceInstructions}
              adDuration={adDuration}
              onAdDurationChanged={setAdDuration}
              error={error}
            /> */}
          </div>
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
      </div>
    </>
  );
};
