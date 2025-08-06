import React from "react";

export interface GlassTabProps {
  children: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}

export function GlassTab({
  children,
  isActive = false,
  onClick,
  className = "",
}: GlassTabProps) {
  return (
    <button
      onClick={onClick}
      className={`
        relative inline-flex items-center justify-center
        px-4 py-3 mx-1 rounded-full
        text-sm font-medium
        transition-all duration-300 ease-out
        focus:outline-none
        ${
          isActive
            ? "text-wb-blue"
            : "text-white/80 hover:text-white hover:bg-white/10"
        }
        ${className}
      `}
    >
      {/* Active state glassy bubble */}
      {isActive && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "rgba(47, 125, 250, 0.15)", // wb-blue with transparency
            backdropFilter: "blur(8px) saturate(1.5)",
            boxShadow:
              "inset 0 1px 1px rgba(47, 125, 250, 0.3), inset 0 -1px 1px rgba(47, 125, 250, 0.1), 0 0 20px rgba(47, 125, 250, 0.1)",
            border: "1px solid rgba(47, 125, 250, 0.2)",
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10 flex items-center gap-2">{children}</div>

      {/* Hover glow for inactive tabs */}
      {!isActive && (
        <div
          className="absolute inset-0 rounded-full opacity-0 hover:opacity-100 transition-opacity duration-300"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255,255,255,0.08) 0%, transparent 70%)",
          }}
        />
      )}
    </button>
  );
}
