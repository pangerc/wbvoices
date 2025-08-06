import React from "react";

export interface LiquidGlassWrapperProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  wrapperStyle?: React.CSSProperties;
  glassIntensity?: "subtle" | "medium" | "strong";
}

export function LiquidGlassWrapper({
  children,
  className = "",
  style = {},
  wrapperStyle = {},
  glassIntensity = "medium",
}: LiquidGlassWrapperProps) {
  const intensityClasses = {
    subtle:
      "bg-[#161822]/70 backdrop-blur-sm border border-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]",
    medium:
      "bg-[#161822]/80 backdrop-blur-md border border-white/15 shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),0_0_0_0.5px_rgba(255,255,255,0.05)]",
    strong:
      "bg-[#161822]/90 backdrop-blur-lg border border-white/20 shadow-[inset_0_2px_4px_rgba(255,255,255,0.12),0_0_0_1px_rgba(255,255,255,0.08)]",
  };

  const glowClasses = {
    subtle:
      "after:absolute after:inset-0 after:rounded-[inherit] after:bg-gradient-to-b after:from-white/5 after:to-transparent after:pointer-events-none",
    medium:
      "after:absolute after:inset-0 after:rounded-[inherit] after:bg-gradient-to-b after:from-white/8 after:via-white/3 after:to-transparent after:pointer-events-none",
    strong:
      "after:absolute after:inset-0 after:rounded-[inherit] after:bg-gradient-to-b after:from-white/12 after:via-white/4 after:to-transparent after:pointer-events-none",
  };

  const highlightClasses = {
    subtle:
      "before:absolute before:inset-x-4 before:top-0 before:h-[0.5px] before:bg-white/15 before:rounded-full before:blur-[0.2px] before:pointer-events-none",
    medium:
      "before:absolute before:inset-x-4 before:top-0 before:h-[1px] before:bg-white/20 before:rounded-full before:blur-[0.3px] before:pointer-events-none",
    strong:
      "before:absolute before:inset-x-3 before:top-0 before:h-[1px] before:bg-white/25 before:rounded-full before:blur-[0.4px] before:pointer-events-none",
  };

  const combinedWrapperStyle: React.CSSProperties = {
    borderRadius: "12px",
    position: "relative",
    overflow: "hidden",
    ...wrapperStyle,
  };

  const combinedContentStyle: React.CSSProperties = {
    position: "relative",
    zIndex: 1,
    ...style,
  };

  return (
    <div
      style={combinedWrapperStyle}
      className={`relative ${intensityClasses[glassIntensity]} ${glowClasses[glassIntensity]} ${highlightClasses[glassIntensity]}`}
    >
      <div style={combinedContentStyle} className={className}>
        {children}
      </div>
    </div>
  );
}
