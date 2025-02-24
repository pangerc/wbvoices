import React from "react";
import { CampaignFormat, Voice } from "@/types";
import { generateCreativeCopy } from "@/utils/openai-api";
import { parseCreativeXML } from "@/utils/xml-parser";

type BriefPanelProps = {
  clientDescription: string;
  setClientDescription: (value: string) => void;
  creativeBrief: string;
  setCreativeBrief: (value: string) => void;
  campaignFormat: CampaignFormat;
  setCampaignFormat: (value: CampaignFormat) => void;
  selectedLanguage: string;
  availableVoices: Voice[];
  onGenerateCreative: (
    segments: Array<{ voiceId: string; text: string }>,
    musicPrompt: string
  ) => void;
};

const campaignFormats = [
  {
    code: "ad_read" as CampaignFormat,
    name: "Single Voice Ad Read",
    description: "One voice narrating the entire advertisement",
  },
  {
    code: "dialog" as CampaignFormat,
    name: "Dialog",
    description:
      "Two voices having a conversation about the product or service",
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
  availableVoices,
  onGenerateCreative,
}: BriefPanelProps) {
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleGenerateCreative = async () => {
    if (!clientDescription.trim() || !creativeBrief.trim()) {
      setError("Please fill in both the client description and creative brief");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const xmlResponse = await generateCreativeCopy(
        selectedLanguage,
        clientDescription,
        creativeBrief,
        campaignFormat,
        availableVoices
      );

      const { segments, musicPrompt } = parseCreativeXML(xmlResponse);
      onGenerateCreative(segments, musicPrompt);
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

  return (
    <div className="p-8 h-full">
      <h2 className="text-2xl font-bold mb-6">Campaign Brief</h2>
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Client Description
          </label>
          <textarea
            value={clientDescription}
            onChange={(e) => setClientDescription(e.target.value)}
            className="bg-white block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-500 sm:text-sm sm:leading-6"
            rows={3}
            placeholder="Describe the client, their business, and target audience..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Creative Brief
          </label>
          <textarea
            value={creativeBrief}
            onChange={(e) => setCreativeBrief(e.target.value)}
            className="bg-white block w-full rounded-md border-0 p-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-500 sm:text-sm sm:leading-6"
            rows={3}
            placeholder="What is the key message? What's the desired tone and style?"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900 mb-4">
            Campaign Format
          </label>
          <div className="space-y-2">
            {campaignFormats.map((format) => (
              <div
                key={format.code}
                className="relative flex items-start py-3 px-4 border rounded-lg cursor-pointer hover:bg-gray-50"
                onClick={() => setCampaignFormat(format.code)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      checked={campaignFormat === format.code}
                      onChange={() => setCampaignFormat(format.code)}
                      className="h-4 w-4 border-gray-300 text-sky-600 focus:ring-sky-600"
                    />
                    <label className="ml-3 block text-sm font-medium leading-6 text-gray-900">
                      {format.name}
                    </label>
                  </div>
                  <div className="ml-7 text-sm leading-6 text-gray-500">
                    {format.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleGenerateCreative}
          disabled={
            isGenerating || !clientDescription.trim() || !creativeBrief.trim()
          }
          className="w-full rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50"
        >
          {isGenerating ? "Generating Creative..." : "Generate Creative"}
        </button>

        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      </div>
    </div>
  );
}
