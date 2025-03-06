import React, { useState } from "react";
import { createMix } from "@/utils/audio-mixer";

type Track = {
  url: string;
  label: string;
  type: "voice" | "music";
};

type MixerPanelProps = {
  tracks: Track[];
  onRemoveTrack?: (index: number) => void;
  resetForm: () => void;
};

export function MixerPanel({
  tracks,
  onRemoveTrack,
  resetForm,
}: MixerPanelProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const voiceTracks = tracks.filter((track) => track.type === "voice");
  const musicTracks = tracks.filter((track) => track.type === "music");

  // Handle local reset
  const handleReset = () => {
    // Clean up preview URL if it exists
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    resetForm();
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const voiceUrls = voiceTracks.map((t) => t.url);
      const musicUrl = musicTracks.length > 0 ? musicTracks[0].url : null;

      const { blob } = await createMix(voiceUrls, musicUrl);

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mixed-audio.wav";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export mix:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePreview = async () => {
    try {
      setIsExporting(true);
      // Clean up previous preview URL
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      const voiceUrls = voiceTracks.map((t) => t.url);
      const musicUrl = musicTracks.length > 0 ? musicTracks[0].url : null;

      const { blob } = await createMix(voiceUrls, musicUrl);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (error) {
      console.error("Failed to create preview:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleRemovePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  // Clean up preview URL when component unmounts
  React.useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div className="p-8 h-full text-black">
      <h1 className="text-6xl font-black mb-4 uppercase text-center">STUDIO</h1>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-medium text-center w-full mb-6 uppercase ml-12 ">
          Mixing Session
        </h2>
        <button
          onClick={handleReset}
          className="-md bg-white px-2.5 py-1.5 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
          Reset
        </button>
      </div>

      {voiceTracks.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Voice Tracks</h3>
          <div className="space-y-4">
            {voiceTracks.map((track, index) => (
              <div key={index} className="p-4 bg-white ">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm text-gray-600">{track.label}</p>
                  {onRemoveTrack && (
                    <button
                      onClick={() => onRemoveTrack(tracks.indexOf(track))}
                      className="text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <audio controls src={track.url} className="w-full">
                  Your browser does not support the audio element.
                </audio>
              </div>
            ))}
          </div>
        </div>
      )}

      {musicTracks.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Music Track</h3>
          <div className="space-y-4">
            {musicTracks.map((track, index) => (
              <div key={index} className="p-4 bg-white ">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm text-gray-600">{track.label}</p>
                  {onRemoveTrack && (
                    <button
                      onClick={() => onRemoveTrack(tracks.indexOf(track))}
                      className="text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <audio controls src={track.url} className="w-full">
                  Your browser does not support the audio element.
                </audio>
              </div>
            ))}
          </div>
        </div>
      )}

      {tracks.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Final Mix</h3>
          <div className="p-4 bg-white ">
            {previewUrl ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm text-gray-600">Mixed Audio Preview</p>
                  <button
                    onClick={handleRemovePreview}
                    className="text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                <audio controls src={previewUrl} className="w-full mb-4">
                  Your browser does not support the audio element.
                </audio>
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="w-full px-4 py-2 bg-black text-white  hover:bg-sky-500 disabled:opacity-50"
                >
                  {isExporting ? "Downloading..." : "Download Mix"}
                </button>
              </div>
            ) : (
              <button
                onClick={handlePreview}
                disabled={isExporting}
                className="w-full px-4 py-2 bg-black text-lg font-semibold text-white  hover:bg-sky-500 disabled:opacity-50"
              >
                {isExporting ? "Processing..." : "Preview Mix"}
              </button>
            )}
          </div>
        </div>
      )}

      {tracks.length === 0 && (
        <p className="text-center text-gray-500 mt-12">
          No tracks available. Generate some voice or music tracks to get
          started.
        </p>
      )}
    </div>
  );
}
