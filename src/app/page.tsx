"use client";

import React, { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const hasRedirected = useRef(false);

  useEffect(() => {
    const initializeApp = async () => {
      // Prevent multiple simultaneous redirects
      if (hasRedirected.current) {
        return;
      }

      try {
        // Get or create session ID (use default-session for development)
        const sessionId = typeof window !== 'undefined'
          ? localStorage.getItem('universal-session') || (() => {
              const newSession = 'default-session';
              localStorage.setItem('universal-session', newSession);
              return newSession;
            })()
          : 'default-session';

        // Create new ad via API
        const res = await fetch('/api/ads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Untitled Ad',
            sessionId,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          console.log('✨ Created new ad:', data.adId);
          hasRedirected.current = true;
          router.replace(`/ad/${data.adId}`);
        } else {
          console.error('❌ Failed to create ad');
        }
      } catch (error) {
        console.error('❌ Failed to initialize app:', error);
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