"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { SpotifyPreview } from "@/components/SpotifyPreview";

interface PreviewData {
  brandName: string;
  slogan: string;
  cta: string;
  destinationUrl: string;
  logoUrl?: string;
  visualUrl?: string;
  mixedAudioUrl?: string;
}

interface PreviewPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default function PreviewPage({ params }: PreviewPageProps) {
  const resolvedParams = React.use(params);
  const { projectId } = resolvedParams;
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);

  // Load preview data via V3 API
  useEffect(() => {
    if (!projectId) return;

    const loadPreview = async () => {
      try {
        const response = await fetch(`/api/ads/${projectId}/preview`);
        if (response.ok) {
          const data = await response.json();
          setPreviewData(data);
        }
      } catch (error) {
        console.error("Failed to load preview:", error);
      } finally {
        setLoading(false);
      }
    };

    loadPreview();
  }, [projectId]);

  // Refresh preview when page becomes visible (e.g., switching back from another tab)
  useEffect(() => {
    if (!projectId) return;

    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        console.log("🔄 Preview page visible, refreshing preview data...");
        try {
          const response = await fetch(`/api/ads/${projectId}/preview`);
          if (response.ok) {
            const data = await response.json();
            setPreviewData(data);
          }
        } catch (error) {
          console.error("Failed to refresh preview:", error);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [projectId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading preview...</div>
      </div>
    );
  }

  if (!previewData) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <h1 className="text-2xl mb-2">Preview not found</h1>
          <p className="text-gray-400">
            The preview you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8">
      {/* WiseBlue Studio Logo */}
      <div className="absolute top-8 left-8">
        <Image
          src="/aca.svg"
          alt="Aleph Creative Audio"
          width={114}
          height={31}
          className="h-10 -mb-3 w-auto "
        />
      </div>

      {/* Main Preview */}
      <div className="flex-1 flex items-center justify-center">
        <SpotifyPreview
          brand={previewData.brandName}
          slogan={previewData.slogan}
          cta={previewData.cta}
          logo={previewData.logoUrl}
          adImage={previewData.visualUrl}
          audioSrc={previewData.mixedAudioUrl}
        />
      </div>
    </div>
  );
}
