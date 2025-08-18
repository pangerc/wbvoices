"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { SpotifyPreview } from "@/components/SpotifyPreview";
import { useProjectHistoryStore } from "@/store/projectHistoryStore";
import { Project } from "@/types";

interface PreviewPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default function PreviewPage({ params }: PreviewPageProps) {
  const resolvedParams = React.use(params);
  const { projectId } = resolvedParams;
  const { loadProjectFromRedis } = useProjectHistoryStore();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  // Load project data
  useEffect(() => {
    if (!projectId) return;

    const loadProject = async () => {
      try {
        const loadedProject = await loadProjectFromRedis(projectId);
        setProject(loadedProject);
      } catch (error) {
        console.error("Failed to load project for preview:", error);
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [projectId, loadProjectFromRedis]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading preview...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <h1 className="text-2xl mb-2">Project not found</h1>
          <p className="text-gray-400">The preview you&apos;re looking for doesn&apos;t exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8">
      {/* WiseBlue Studio Logo */}
      <div className="absolute top-8 left-8">
        <Image
          src="/wbs-logo.svg"
          alt="WiseBlue Studio"
          width={180}
          height={37}
          className="h-8 w-auto"
        />
      </div>

      {/* Main Preview */}
      <div className="flex-1 flex items-center justify-center">
        <SpotifyPreview
          brand={project.preview?.brandName}
          slogan={project.preview?.slogan}
          cta={project.preview?.cta}
          logo={project.preview?.logoUrl}
          adImage={project.preview?.visualUrl}
          audioSrc={
            project.preview?.mixedAudioUrl || // Use permanent mixed audio if available
            project.generatedTracks?.musicUrl // Fallback to music-only track
          }
        />
      </div>
    </div>
  );
}