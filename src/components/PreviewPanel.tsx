"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { GlassyInput, GenerateButton } from "./ui";
import { FileUpload, useFileUpload } from "./ui/FileUpload";
import { SpotifyPreview } from "./SpotifyPreview";
import { useProjectHistoryStore } from "@/store/projectHistoryStore";
import { useMixerStore } from "@/store/mixerStore";
import { Project } from "@/types";

interface PreviewPanelProps {
  projectId?: string;
}

interface PreviewData {
  brandName: string;
  slogan: string;
  destinationUrl: string;
  cta: string;
}

export function PreviewPanel({ projectId }: PreviewPanelProps) {
  const {
    uploadedFiles,
    isUploading,
    errors,
    handleUploadComplete,
    handleUploadError,
  } = useFileUpload();
  const { loadProjectFromRedis, updateProject } = useProjectHistoryStore();
  const { previewUrl, isUploadingMix } = useMixerStore();

  const [previewData, setPreviewData] = useState<PreviewData>({
    brandName: "",
    slogan: "",
    destinationUrl: "",
    cta: "Learn More",
  });

  const [project, setProject] = useState<Project | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debug logging
  React.useEffect(() => {
    console.log("🎵 Preview audio sources:", {
      isUploadingMix,
      previewUrl,
      redisPreviewUrl: project?.preview?.mixedAudioUrl,
      musicUrl: project?.generatedTracks?.musicUrl,
      finalAudioSrc:
        previewUrl ||
        project?.preview?.mixedAudioUrl ||
        project?.generatedTracks?.musicUrl,
    });
  }, [
    isUploadingMix,
    previewUrl,
    project?.preview?.mixedAudioUrl,
    project?.generatedTracks?.musicUrl,
  ]);

  // Custom upload handlers that auto-save to project
  const handleLogoUpload = async (result: { url: string; filename: string }) => {
    handleUploadComplete("logo")(result);

    // Auto-save logo URL to project
    if (projectId) {
      // Load fresh project from Redis to avoid race conditions
      const currentProject = await loadProjectFromRedis(projectId);
      if (!currentProject) return;

      const updatedPreview = {
        ...currentProject.preview, // Use fresh data, not stale local state
        brandName: previewData.brandName,
        slogan: previewData.slogan,
        destinationUrl: previewData.destinationUrl,
        cta: previewData.cta,
        logoUrl: result.url,
        visualUrl: currentProject.preview?.visualUrl || uploadedFiles.visual?.url,
      };

      await updateProject(projectId, {
        preview: updatedPreview,
        lastModified: Date.now(),
      });

      // Update local state with fresh merged data
      setProject({
        ...currentProject,
        preview: updatedPreview,
        lastModified: Date.now(),
      });
    }
  };

  const handleVisualUpload = async (result: { url: string; filename: string }) => {
    handleUploadComplete("visual")(result);

    // Auto-save visual URL to project
    if (projectId) {
      // Load fresh project from Redis to avoid race conditions
      const currentProject = await loadProjectFromRedis(projectId);
      if (!currentProject) return;

      const updatedPreview = {
        ...currentProject.preview, // Use fresh data, not stale local state
        brandName: previewData.brandName,
        slogan: previewData.slogan,
        destinationUrl: previewData.destinationUrl,
        cta: previewData.cta,
        logoUrl: currentProject.preview?.logoUrl || uploadedFiles.logo?.url,
        visualUrl: result.url,
      };

      await updateProject(projectId, {
        preview: updatedPreview,
        lastModified: Date.now(),
      });

      // Update local state with fresh merged data
      setProject({
        ...currentProject,
        preview: updatedPreview,
        lastModified: Date.now(),
      });
    }
  };

  // Load project data on mount
  useEffect(() => {
    if (!projectId) return;

    const loadProject = async () => {
      try {
        const loadedProject = await loadProjectFromRedis(projectId);
        if (loadedProject) {
          setProject(loadedProject);

          // Initialize preview data from project (preview data takes precedence, fallback to brief data)
          const briefCTA =
            loadedProject.brief?.selectedCTA?.replace(/-/g, " ") || "";
          // Extract brand name from client description (first few words, up to punctuation)
          const briefBrandName =
            loadedProject.brief?.clientDescription
              ?.split(
                /[.,]|(\s+is\s+)|(\s+offers\s+)|(\s+provides\s+)|(\s+sells\s+)/
              )[0] // Split on punctuation or common separators
              ?.trim() || "";

          // Helper function to capitalize text (for both CTA and brand names)
          const capitalizeText = (text: string) => {
            return text
              .split(" ")
              .map(
                (word) =>
                  word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
              )
              .join(" ");
          };

          const finalCTA =
            loadedProject.preview?.cta &&
            loadedProject.preview.cta !== "Learn More"
              ? loadedProject.preview.cta
              : briefCTA || "Learn More";

          setPreviewData({
            brandName:
              loadedProject.preview?.brandName ||
              (briefBrandName ? capitalizeText(briefBrandName) : ""),
            slogan: loadedProject.preview?.slogan || "",
            destinationUrl: loadedProject.preview?.destinationUrl || "",
            cta: capitalizeText(finalCTA),
          });
        }
      } catch (error) {
        console.error("Failed to load project:", error);
      }
    };

    loadProject();
  }, [projectId, loadProjectFromRedis]);

  // Debounced update function
  const debouncedUpdateProject = useCallback(
    async (updatedPreviewData: PreviewData) => {
      if (!projectId) return;

      // Load fresh project from Redis to avoid race conditions
      const currentProject = await loadProjectFromRedis(projectId);
      if (!currentProject) return;

      const updatedPreview = {
        ...currentProject.preview, // Use fresh data, not stale local state
        ...updatedPreviewData,
        logoUrl: uploadedFiles.logo?.url || currentProject.preview?.logoUrl,
        visualUrl: uploadedFiles.visual?.url || currentProject.preview?.visualUrl,
      };

      await updateProject(projectId, {
        preview: updatedPreview,
        lastModified: Date.now(),
      });

      // Update local state with fresh merged data
      setProject({
        ...currentProject,
        preview: updatedPreview,
        lastModified: Date.now(),
      });
    },
    [
      projectId,
      uploadedFiles.logo?.url,
      uploadedFiles.visual?.url,
      loadProjectFromRedis,
      updateProject,
    ]
  );

  const handleInputChange = (field: keyof PreviewData, value: string) => {
    const newPreviewData = { ...previewData, [field]: value };
    setPreviewData(newPreviewData);

    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout for debounced update (500ms delay)
    debounceTimeoutRef.current = setTimeout(() => {
      debouncedUpdateProject(newPreviewData);
    }, 500);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const logoUrl = uploadedFiles.logo?.url || project?.preview?.logoUrl;
  const visualUrl = uploadedFiles.visual?.url || project?.preview?.visualUrl;

  const generatePreviewUrl = () => {
    if (!projectId) return "";
    return `${window.location.origin}/preview/${projectId}`;
  };

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-400">
          <p className="text-lg mb-2">No Project Selected</p>
          <p className="text-sm">
            Create or select a project to configure preview
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 text-white">
      {/* Header with Copy Preview URL button */}
      <div className="flex justify-between items-start mt-8 mb-16">
        <div>
          <h1 className="text-4xl font-black mb-2">Share Your Preview</h1>
          <p>
            Configure your ad preview for client presentation. Upload visuals
            and customize the preview experience.
          </p>
        </div>
        <GenerateButton
          onClick={() => window.open(generatePreviewUrl(), "_blank")}
          disabled={!projectId || !previewData.brandName || isUploadingMix}
          isGenerating={isUploadingMix}
          text="Open Preview"
          generatingText="Generating Preview"
        />
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Left: Form Fields */}
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-white mb-6">
              Preview Settings
            </h3>

            <div className="space-y-6">
              <GlassyInput
                label="Brand Name"
                type="text"
                value={previewData.brandName}
                onChange={(e) => handleInputChange("brandName", e.target.value)}
                placeholder="e.g., Powerade"
              />

              <GlassyInput
                label="Campaign Slogan"
                type="text"
                value={previewData.slogan}
                onChange={(e) => handleInputChange("slogan", e.target.value)}
                placeholder="e.g., Powerade, Pausar es Power"
              />

              <GlassyInput
                label="Destination URL"
                type="url"
                value={previewData.destinationUrl}
                onChange={(e) =>
                  handleInputChange("destinationUrl", e.target.value)
                }
                placeholder="https://www.powerade.com"
              />

              <GlassyInput
                label="Call to Action"
                type="text"
                value={previewData.cta}
                onChange={(e) => handleInputChange("cta", e.target.value)}
                placeholder="e.g., Learn More, Shop Now"
              />
            </div>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-white mb-6">
              Visual Assets
            </h3>

            <div className="space-y-6">
              {/* Logo Upload */}
              <div>
                <label className="block mb-2 text-white">Brand Logo</label>
                <FileUpload
                  fileType="preview-logo"
                  projectId={projectId}
                  onUploadComplete={handleLogoUpload}
                  onUploadError={handleUploadError("logo")}
                  disabled={isUploading.logo}
                  className="w-full px-4 py-3 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  <div className="w-full text-center">
                    {isUploading.logo
                      ? "Uploading..."
                      : logoUrl
                      ? "Change Logo"
                      : "Upload Logo"}
                  </div>
                </FileUpload>
                {errors.logo && (
                  <p className="text-red-400 text-sm mt-1">{errors.logo}</p>
                )}
                {logoUrl && (
                  <div className="mt-2">
                    <Image
                      src={logoUrl}
                      alt="Logo preview"
                      width={64}
                      height={64}
                      className="w-16 h-16 object-cover rounded border border-white/10"
                    />
                  </div>
                )}
              </div>

              {/* Visual Upload */}
              <div>
                <label className=" mb-2 text-white flex justify-between">
                  Campaign Visual{" "}
                  <span className="text-xs text-gray-400">640x640</span>
                </label>
                <FileUpload
                  fileType="preview-visual"
                  projectId={projectId}
                  onUploadComplete={handleVisualUpload}
                  onUploadError={handleUploadError("visual")}
                  disabled={isUploading.visual}
                  className="w-full px-4 py-3 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  <div className="w-full text-center">
                    {isUploading.visual
                      ? "Uploading..."
                      : visualUrl
                      ? "Change Visual"
                      : "Upload Visual"}
                  </div>
                </FileUpload>
                {errors.visual && (
                  <p className="text-red-400 text-sm mt-1">{errors.visual}</p>
                )}
                {visualUrl && (
                  <div className="mt-2 pb-12">
                    <Image
                      src={visualUrl}
                      alt="Visual preview"
                      width={640}
                      height={640}
                      className="w-64 h-auto object-cover rounded border border-white/10"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Live Preview */}
        <div className="flex flex-col">
          <h3 className="text-xl font-semibold text-white mb-6">
            Live Preview
          </h3>
          <div className="p-6 min-h-[680px]">
            <SpotifyPreview
              brand={previewData.brandName}
              slogan={previewData.slogan}
              cta={previewData.cta}
              logo={logoUrl}
              adImage={visualUrl}
              audioSrc={
                previewUrl || // Use current preview URL from store
                project?.preview?.mixedAudioUrl || // Or permanent URL from Redis
                project?.generatedTracks?.musicUrl // Fallback to music-only
              }
              isGenerating={isUploadingMix}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
