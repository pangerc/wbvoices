"use client";

import React, { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { generateProjectId } from "@/utils/projectId";

export default function HomePage() {
  const router = useRouter();
  const hasRedirected = useRef(false);

  useEffect(() => {
    const initializeApp = () => {
      // Prevent multiple simultaneous redirects
      if (hasRedirected.current) {
        return;
      }

      try {
        // For pilot/demo: Always create a fresh new project for better UX
        // Users can discover existing projects via the "Recent Projects" dropdown
        const newProjectId = generateProjectId();
        console.log('🔄 Creating fresh project for demo session:', newProjectId);
        hasRedirected.current = true;
        router.replace(`/project/${newProjectId}`);
        
      } catch (error) {
        console.error('❌ Failed to initialize app:', error);
        // Create a new project as fallback
        if (!hasRedirected.current) {
          const newProjectId = generateProjectId();
          hasRedirected.current = true;
          router.replace(`/project/${newProjectId}`);
        }
      }
    };

    initializeApp();
  }, [router]);

  // Show loading state while creating new project
  return (
    <div className="flex flex-col h-screen bg-black text-white">
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full mx-auto mb-4"></div>
          <p className="text-lg">Setting up your creative workspace...</p>
        </div>
      </div>
    </div>
  );
}