"use client";

import { PronunciationEditor } from "@/components/PronunciationEditor";

export default function PronunciationRulesPage() {
  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* Pronunciation Editor Component */}
        <PronunciationEditor
          renderSaveButton={(props) => (
            <>
              {/* Header */}
              <div className="mb-8 flex items-start justify-between gap-2">
                <div>
                  <h1 className="text-3xl font-bold mb-2">
                    Global Pronunciation Rules
                  </h1>
                  <p className="text-gray-400 mb-2">
                    Configure how brand names and special terms are pronounced
                    across all projects and voice providers. These pronunciation
                    rules apply to all projects and are automatically used by
                    both ElevenLabs and OpenAI voice providers. Perfect for
                    brand names like &quot;YSL&quot; or &quot;L&apos;Oréal&quot;
                    that need consistent pronunciation across languages.
                  </p>
                </div>
                {/* Save Button */}
                <div className="flex items-center gap-2">
                  {props.hasChanges && (
                    <span className="text-sm text-yellow-400">
                      Unsaved changes
                    </span>
                  )}
                  <button
                    onClick={props.onClick}
                    disabled={props.disabled}
                    className="bg-white/10 backdrop-blur-sm font-medium rounded-full px-5 py-3 text-white border border-white/20 hover:bg-wb-blue/30 hover:border-wb-blue/50 focus:outline-none focus:ring-1 focus:ring-wb-blue/50 disabled:bg-gray-700/50 disabled:border-gray-600/30 disabled:text-gray-400 transition-all duration-200 whitespace-nowrap"
                  >
                    {props.isSaving ? "Saving..." : "Save Rules"}
                  </button>
                </div>
              </div>
            </>
          )}
        />
      </div>
    </div>
  );
}
