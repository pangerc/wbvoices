import React, { useState, useRef, useEffect } from "react";
import { Voice, Provider } from "@/types";

interface TestVoiceButtonProps {
  voice: Voice | null;
  text: string;
  style?: string;
  useCase?: string;
  voiceInstructions?: string;
  provider: Provider;
  disabled?: boolean;
}

/**
 * Truncate text to max chars, preferring sentence boundaries
 */
function truncateForPreview(text: string, maxChars = 90): string {
  if (text.length <= maxChars) return text;

  const truncated = text.substring(0, maxChars);

  // Try to find sentence end within limit
  const sentenceEnds = [
    truncated.lastIndexOf("."),
    truncated.lastIndexOf("!"),
    truncated.lastIndexOf("?"),
  ];
  const sentenceEnd = Math.max(...sentenceEnds);

  // If we found a sentence end in the first 50% of the text, use it
  if (sentenceEnd > maxChars * 0.5) {
    return text.substring(0, sentenceEnd + 1);
  }

  // Otherwise just truncate with ellipsis
  return truncated.trim() + "...";
}

/**
 * Get API endpoint for provider
 */
function getVoiceApiEndpoint(provider: Provider): string {
  const endpoints: Record<string, string> = {
    elevenlabs: "/api/voice/elevenlabs-v2",
    openai: "/api/voice/openai-v2",
    lovo: "/api/voice/lovo-v2",
    qwen: "/api/voice/qwen-v2",
    bytedance: "/api/voice/bytedance-v2",
  };
  return endpoints[provider] || endpoints.elevenlabs;
}

export function TestVoiceButton({
  voice,
  text,
  style,
  useCase,
  voiceInstructions,
  provider,
  disabled = false,
}: TestVoiceButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsPlaying(false);
  };

  const handleTestVoice = async () => {
    if (!voice || !text.trim()) return;

    // If already playing, stop
    if (isPlaying) {
      stopAudio();
      return;
    }

    setIsLoading(true);
    setError(null);

    // Abort any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      // Truncate text for preview
      const previewText = truncateForPreview(text, 90);

      console.log(
        `🎙️ Testing voice: ${voice.name} with ${previewText.length} chars`
      );

      // Build request body
      const requestBody: {
        text: string;
        voiceId: string;
        style?: string;
        useCase?: string;
        voiceInstructions?: string;
      } = {
        text: previewText,
        voiceId: voice.id,
      };

      if (style) requestBody.style = style;
      if (useCase) requestBody.useCase = useCase;
      if (voiceInstructions) requestBody.voiceInstructions = voiceInstructions;

      // Call voice API
      const endpoint = getVoiceApiEndpoint(provider);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Voice generation failed: ${response.statusText}`
        );
      }

      const data = await response.json();

      if (!data.audio_url) {
        throw new Error("No audio URL in response");
      }

      // Play audio
      const audio = new Audio(data.audio_url);
      audioRef.current = audio;

      audio.addEventListener("loadeddata", () => {
        setIsLoading(false);
        setIsPlaying(true);
      });

      audio.addEventListener("ended", () => {
        setIsPlaying(false);
      });

      audio.addEventListener("error", (e) => {
        console.error("Audio playback error:", e);
        setError("Failed to play audio");
        setIsPlaying(false);
        setIsLoading(false);
      });

      await audio.play();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Voice test aborted");
        return;
      }

      console.error("Voice test error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to generate preview"
      );
      setIsLoading(false);
      setIsPlaying(false);
    }
  };

  const isDisabled = disabled || !voice || !text.trim() || isLoading;

  const getTooltip = () => {
    if (!voice) return "Select a voice first";
    if (!text.trim()) return "Enter some text first";
    if (isLoading) return `Generating preview (${truncateForPreview(text, 90).length} chars)...`;
    if (isPlaying) return "Stop preview";
    return `Test voice with current script (${truncateForPreview(text, 90).length} chars)`;
  };

  return (
    <div className="inline-flex items-center gap-1">
      <button
        onClick={handleTestVoice}
        disabled={isDisabled}
        className={`p-2 rounded-lg transition-all ${
          isPlaying
            ? "bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30"
            : "bg-wb-blue/20 border border-wb-blue/30 text-wb-blue hover:bg-wb-blue/30"
        } disabled:opacity-30 disabled:cursor-not-allowed`}
        title={getTooltip()}
      >
        {isLoading ? (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        ) : isPlaying ? (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>
        ) : (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        )}
      </button>

      {/* Compact error message */}
      {error && (
        <span className="text-xs text-red-400 ml-1" title={error}>
          ⚠️
        </span>
      )}
    </div>
  );
}
