import React, { useState, useEffect } from "react";

type MusicPanelProps = {
  onGenerate: (prompt: string) => Promise<void>;
  isGenerating: boolean;
  statusMessage?: string;
  initialPrompt?: string;
};

export function MusicPanel({
  onGenerate,
  isGenerating,
  statusMessage,
  initialPrompt = "",
}: MusicPanelProps) {
  const [prompt, setPrompt] = useState(initialPrompt);

  // Update prompt when initialPrompt changes
  useEffect(() => {
    setPrompt(initialPrompt);
  }, [initialPrompt]);

  const handleGenerate = () => {
    onGenerate(prompt);
  };

  return (
    <div className="p-8 h-full">
      <h2 className="text-2xl font-bold mb-6">Music Generation</h2>
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            Music Description
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full p-2 border rounded"
            rows={3}
            placeholder="Describe the music you want to generate... (e.g. 'A calm and peaceful piano melody with soft strings in the background')"
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="instrumental"
            checked={true}
            disabled={true}
            className="size-4 rounded border-gray-300 text-sky-500 focus:ring-sky-500"
          />
          <label
            htmlFor="instrumental"
            className="ml-2 block text-sm text-gray-900"
          >
            Instrumental Only
          </label>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="w-full bg-sky-500 text-white py-2 px-4 rounded hover:bg-black disabled:opacity-50"
        >
          {isGenerating ? "Generating..." : "Generate Music"}
        </button>

        {statusMessage && (
          <p className="text-center text-sm text-gray-600">{statusMessage}</p>
        )}
      </div>
    </div>
  );
}
