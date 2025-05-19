import React, { useState, useMemo } from "react";
import {
  CampaignFormat,
  Voice,
  Provider,
  AIModel,
  SoundFxPrompt,
} from "@/types";
import { generateCreativeCopy } from "@/utils/ai-api";
import { parseCreativeXML } from "@/utils/xml-parser";
import { parseCreativeJSON } from "@/utils/json-parser";
import { Language, getFlagCode, formatAccentName } from "@/utils/language";
import {
  GlassyTextarea,
  GlassyListbox,
  GlassyOptionPicker,
  GlassySlider,
  GlassyCombobox,
  ResetButton,
  GenerateButton,
} from "./ui";

export type BriefPanelProps = {
  clientDescription: string;
  setClientDescription: (value: string) => void;
  creativeBrief: string;
  setCreativeBrief: (value: string) => void;
  campaignFormat: CampaignFormat;
  setCampaignFormat: (value: CampaignFormat) => void;
  selectedLanguage: string;
  setSelectedLanguage: (language: Language) => void;
  selectedProvider: Provider;
  setSelectedProvider: (provider: Provider) => void;
  availableLanguages: { code: Language; name: string }[];
  getFilteredVoices: (ignoreAccentFilter?: boolean) => Voice[];
  adDuration: number;
  setAdDuration: (duration: number) => void;
  selectedAccent: string | null;
  setSelectedAccent: (accent: string | null) => void;
  onGenerateCreative: (
    segments: Array<{ voiceId: string; text: string }>,
    musicPrompt: string,
    soundFxPrompt?: string | string[] | SoundFxPrompt[]
  ) => void;
  isLanguageLoading?: boolean;
  isAccentLoading?: boolean;
};

const campaignFormatOptions = [
  {
    value: "ad_read" as CampaignFormat,
    label: "Single Voice Ad Read",
    description: "One voice narrating the entire advertisement",
  },
  {
    value: "dialog" as CampaignFormat,
    label: "Dialogue",
    description:
      "Two voices having a conversation about the product or service",
  },
];

const aiModelOptions = [
  {
    value: "gpt4",
    label: "GPT-4.1",
    description: "Largest GPT model for creative tasks and agentic planning",
    badge: "Recommended",
  },
  {
    value: "deepseek",
    label: "DeepSeek R1",
    description: "Frontier thinking model from the east",
  },
];

export function BriefPanel({
  clientDescription,
  setClientDescription,
  creativeBrief,
  setCreativeBrief,
  campaignFormat,
  setCampaignFormat,
  selectedLanguage,
  setSelectedLanguage,
  selectedProvider,
  setSelectedProvider,
  availableLanguages,
  getFilteredVoices,
  adDuration,
  setAdDuration,
  selectedAccent,
  setSelectedAccent,
  onGenerateCreative,
  isLanguageLoading = false,
  isAccentLoading = false,
}: BriefPanelProps) {
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [languageQuery, setLanguageQuery] = useState("");
  const [selectedAiModel, setSelectedAiModel] = useState("gpt4");
  const [internalLanguageLoading, setInternalLanguageLoading] = useState(false);
  const [internalAccentLoading, setInternalAccentLoading] = useState(false);

  // Since we might not have the props from parent yet, we'll use internal state
  // to track loading that's triggered by provider changes
  const handleProviderChange = (provider: Provider) => {
    setInternalLanguageLoading(true);
    setSelectedProvider(provider);
    // Simulate loading completion after a delay (this can be removed when the parent passes actual loading states)
    setTimeout(() => setInternalLanguageLoading(false), 800);
  };

  // When language changes, we need to update accent loading state
  const handleLanguageChange = (
    lang: { code: Language; name: string } | null
  ) => {
    if (lang) {
      setInternalAccentLoading(true);
      setSelectedLanguage(lang.code);
      setLanguageQuery("");
      // Simulate loading completion after a delay (can be removed when parent passes actual loading states)
      setTimeout(() => setInternalAccentLoading(false), 800);
    }
  };

  // Determine if we're loading based on props or internal state
  const languageLoading = isLanguageLoading || internalLanguageLoading;
  const accentLoading = isAccentLoading || internalAccentLoading;

  // Get available accents for the current language
  const availableAccents = useMemo(() => {
    // Get voices that match the language but without filtering by accent
    const voices = getFilteredVoices(true);
    console.log(`[${selectedLanguage}] Available voices total:`, voices.length);

    if (voices.length === 0) {
      return ["None"];
    }

    // Extract only accents that actually exist in the provider's voices
    const voiceAccents = new Set<string>();
    voices.forEach((voice) => {
      if (voice.accent) {
        const formattedAccent = formatAccentName(voice.accent);
        if (formattedAccent.toLowerCase() !== "none") {
          voiceAccents.add(formattedAccent);
        }
      }
    });

    console.log(`Actually available accents for ${selectedLanguage}:`, [
      ...voiceAccents,
    ]);

    // Return sorted accents with "None" first
    return ["None", ...[...voiceAccents].sort()];
  }, [selectedLanguage, getFilteredVoices]);

  // Filter languages based on search query
  const filteredLanguages =
    languageQuery === ""
      ? availableLanguages
      : availableLanguages.filter((lang) => {
          return lang.name.toLowerCase().includes(languageQuery.toLowerCase());
        });

  const handleGenerateCreative = async () => {
    if (!clientDescription.trim() || !creativeBrief.trim()) {
      setError("Please fill in both the client description and creative brief");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Get filtered voices using the provided function
      const filteredVoices = getFilteredVoices();
      console.log(
        `Filtered voices for ${selectedLanguage}:`,
        filteredVoices.map((v) => `${v.name} (${v.id})`)
      );

      const jsonResponse = await generateCreativeCopy(
        selectedAiModel as AIModel,
        selectedLanguage,
        clientDescription,
        creativeBrief,
        campaignFormat,
        filteredVoices,
        adDuration
      );

      console.log("JSON response received:", jsonResponse);

      // Try parsing as JSON first
      try {
        const { voiceSegments, musicPrompt, soundFxPrompts } =
          parseCreativeJSON(jsonResponse);

        console.log("Parsed voice segments:", voiceSegments);
        console.log("Parsed music prompt:", musicPrompt);
        console.log("Parsed sound fx prompts:", soundFxPrompts);

        if (voiceSegments.length === 0) {
          console.error("No voice segments were parsed from the response");
          setError(
            "Failed to generate creative: No voice segments found in the response"
          );
          setIsGenerating(false);
          return;
        }

        // Map voice segments to the expected format
        const segments = voiceSegments.map((segment) => ({
          voiceId: segment.voice?.id || "",
          text: segment.text,
        }));

        // Pass complete sound FX prompts with timing info
        // Call onGenerateCreative with the segments, music prompt, and all sound fx prompts
        onGenerateCreative(segments, musicPrompt || "", soundFxPrompts);
      } catch (jsonError) {
        console.error("Error parsing JSON creative:", jsonError);

        // Fallback to XML parsing
        console.log("Attempting to parse as XML instead");
        try {
          const parsedXml = parseCreativeXML(jsonResponse);
          const xmlSegments = parsedXml.segments;
          const xmlMusicPrompt = parsedXml.musicPrompt;

          if (xmlSegments.length === 0) {
            console.error(
              "No voice segments were parsed from the XML response"
            );
            setError(
              "Failed to generate creative: No voice segments found in the response"
            );
            setIsGenerating(false);
            return;
          }

          // Call onGenerateCreative with the segments and music prompt
          // XML format doesn't support sound effects, so pass empty array
          onGenerateCreative(xmlSegments, xmlMusicPrompt, []);
        } catch (xmlError) {
          console.error("Error parsing XML fallback:", xmlError);
          throw new Error("Failed to parse creative response in any format");
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred while generating creative"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // Add a reset handler for the BriefPanel
  const handleReset = () => {
    setClientDescription("");
    setCreativeBrief("");
    setError(null);
  };

  return (
    <div className="py-8  text-white">
      <div className="flex items-start justify-between gap-2 my-8">
        <div>
          <h1 className="text-4xl font-black mb-2">Let&apos;s Start Cooking</h1>
          <h2 className=" font-medium mb-12  ">
            Describe your client, audience, and message.This helps us craft the
            perfect voice for your campaign.
          </h2>
        </div>
        {/* Button group */}
        <div className="flex items-center gap-2">
          <ResetButton onClick={handleReset} />
          <GenerateButton
            onClick={handleGenerateCreative}
            disabled={!clientDescription.trim() || !creativeBrief.trim()}
            isGenerating={isGenerating}
            text="Generate"
            generatingText="Generating..."
          />
        </div>
      </div>
      {/* MAIN FORM GRID */}
      <div className="gap-8 md:grid md:grid-cols-3 ">
        <div className="space-y-4">
          {/* Client Description - Moved to the top */}
          <GlassyTextarea
            label="Client Description"
            value={clientDescription}
            onChange={(e) => setClientDescription(e.target.value)}
            placeholder="Describe the client, their business, and target audience..."
            className="relative bg-[#161822]/90 block w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm sm:leading-6 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
            minRows={5}
            style={{ resize: "none" }}
          />

          {/* Creative Brief - Moved to the top */}
          <GlassyTextarea
            label="Creative Brief"
            value={creativeBrief}
            onChange={(e) => setCreativeBrief(e.target.value)}
            placeholder="What is the key message? What's the desired tone and style?"
            className="relative bg-[#161822]/90 block w-full border-0 p-4 text-white rounded-xl placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm sm:leading-6 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
            minRows={5}
            style={{ resize: "none" }}
          />
        </div>

        <div className="col-span-2 space-y-12">
          <div className="md:grid md:grid-cols-2 gap-4">
            <div id="provider-selector">
              <GlassyListbox
                label="Provider"
                value={selectedProvider}
                onChange={handleProviderChange}
                options={[
                  { value: "elevenlabs", label: "Elevenlabs" },
                  { value: "lovo", label: "Lovo" },
                ]}
                loading={internalLanguageLoading}
              />
            </div>
            <div className="space-y-4">
              <div id="language-selector">
                <GlassyCombobox
                  label="Language"
                  value={
                    availableLanguages.find(
                      (lang) => lang.code === selectedLanguage
                    )
                      ? {
                          value: selectedLanguage,
                          label:
                            availableLanguages.find(
                              (lang) => lang.code === selectedLanguage
                            )?.name || "",
                          flag: getFlagCode(selectedLanguage),
                        }
                      : null
                  }
                  onChange={(selected) => {
                    if (selected) {
                      handleLanguageChange({
                        code: selected.value as Language,
                        name: selected.label,
                      });
                    }
                  }}
                  onQueryChange={setLanguageQuery}
                  query={languageQuery}
                  options={filteredLanguages.map((lang) => ({
                    value: lang.code,
                    label: lang.name,
                    flag: getFlagCode(lang.code),
                  }))}
                  loading={languageLoading}
                  disabled={languageLoading}
                />
              </div>

              {/* Accent option */}
              <div className="accent-option">
                <GlassyListbox
                  label="Accent"
                  value={selectedAccent || "None"}
                  onChange={(accent) => {
                    setSelectedAccent(accent === "None" ? null : accent);
                  }}
                  options={availableAccents.map((accent) => ({
                    value: accent,
                    label: accent,
                  }))}
                  loading={accentLoading}
                  disabled={accentLoading}
                />
              </div>
            </div>
          </div>

          <div className="md:grid md:grid-cols-2 gap-4">
            {/* Column 2: Campaign Format picker */}
            <div className="space-y-4">
              <GlassyOptionPicker
                label="Campaign Format"
                value={campaignFormat}
                onChange={setCampaignFormat}
                options={campaignFormatOptions}
              />
            </div>

            {/* Column 3:  */}
            <div className="space-y-4">
              <GlassyOptionPicker
                label="AI Model"
                value={selectedAiModel}
                onChange={setSelectedAiModel}
                options={aiModelOptions}
              />
            </div>
          </div>
          {/* Duration slider */}
          <GlassySlider
            label="Duration"
            value={adDuration}
            onChange={setAdDuration}
            min={15}
            max={90}
            step={5}
            formatLabel={(val) => `${val} seconds`}
            tickMarks={[
              { value: 15, label: "15s" },
              { value: 30, label: "30s" },
              { value: 60, label: "60s" },
              { value: 90, label: "90s" },
            ]}
          />
        </div>

        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
      </div>
    </div>
  );
}
