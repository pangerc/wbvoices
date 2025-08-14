"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProjectHistoryStore } from "@/store/projectHistoryStore";
import { generateProjectId } from "@/utils/projectId";

export default function HomePage() {
  const router = useRouter();
  const { loadProjects, recentProjects } = useProjectHistoryStore();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Load user's projects
        await loadProjects();
        
        // Filter out any old UUID projects and only use valid short IDs
        const validProjects = recentProjects.filter(project => {
          // Accept short IDs only (no UUIDs)
          const shortIdRegex = /^[a-z]+-[a-z]+-\d{3}$/;
          return shortIdRegex.test(project.id);
        });
        
        // If user has valid recent projects, redirect to the most recent one
        if (validProjects.length > 0) {
          const mostRecentProject = validProjects[0];
          console.log('🔄 Redirecting to most recent project:', mostRecentProject.headline);
          router.replace(`/project/${mostRecentProject.id}`);
          return;
        }
        
        // No valid projects, create a new one with short ID
        const newProjectId = generateProjectId();
        console.log('🔄 Creating new project with ID:', newProjectId);
        router.replace(`/project/${newProjectId}`);
        
      } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        // Create a new project as fallback
        const newProjectId = generateProjectId();
        router.replace(`/project/${newProjectId}`);
      }
    };

    initializeApp();
  }, [router, loadProjects, recentProjects]);

  // Show loading state while determining where to redirect
  return (
    <div className="flex flex-col h-screen bg-black text-white">
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full mx-auto mb-4"></div>
          <p className="text-lg">Loading your workspace...</p>
        </div>
      </div>
    </div>
  );
}