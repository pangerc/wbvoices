import React from "react";

export interface GlassTabBarProps {
  children: React.ReactNode;
  className?: string;
}

export function GlassTabBar({ children, className = "" }: GlassTabBarProps) {
  return (
    <div
      className={`
        relative inline-flex items-center
        bg-black/40 backdrop-blur-xl 
        border border-white/20
        rounded-full
        shadow-[
          inset_0_1px_0_rgba(255,255,255,0.15),
          inset_0_-1px_0_rgba(0,0,0,0.2),
          0_0_32px_rgba(0,0,0,0.4),
          0_8px_32px_rgba(0,0,0,0.2)
        ]
        ${className}
      `}
      style={{
        backdropFilter: "blur(24px) saturate(1.8) brightness(1.1)",
      }}
    >
      {/* Premium inner highlight */}
      <div
        className="absolute inset-x-4 top-0 h-px rounded-full"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 20%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0.4) 80%, transparent 100%)",
          filter: "blur(0.5px)",
        }}
      />

      {/* Content container */}
      <div className="relative flex items-center px-2 py-1">{children}</div>

      {/* Subtle ambient glow */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(255,255,255,0.02) 0%, transparent 70%)",
          filter: "blur(12px)",
          transform: "scale(1.1)",
        }}
      />
    </div>
  );
}
