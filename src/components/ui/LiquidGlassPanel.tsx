import React from "react";

export interface LiquidGlassPanelProps {
  children: React.ReactNode;
  className?: string;
  intensity?: "subtle" | "medium" | "strong" | "premium";
  animated?: boolean;
  floating?: boolean;
}

export function LiquidGlassPanel({
  children,
  className = "",
  intensity = "medium",
  animated = false,
  floating = false,
}: LiquidGlassPanelProps) {
  const panelId = React.useId();

  const intensityConfig = {
    subtle: {
      blur: 4,
      turbulence: "0.01 0.015",
      displacement: 1.5,
      brightness: 1.1,
      saturation: 1.2,
    },
    medium: {
      blur: 8,
      turbulence: "0.015 0.02",
      displacement: 2.5,
      brightness: 1.15,
      saturation: 1.3,
    },
    strong: {
      blur: 12,
      turbulence: "0.02 0.025",
      displacement: 4,
      brightness: 1.2,
      saturation: 1.4,
    },
    premium: {
      blur: 16,
      turbulence: "0.025 0.03",
      displacement: 6,
      brightness: 1.3,
      saturation: 1.5,
    },
  };

  const config = intensityConfig[intensity];

  return (
    <>
      {/* Advanced SVG Filters */}
      <svg className="absolute inset-0 w-0 h-0 pointer-events-none">
        <defs>
          {/* Main liquid glass filter */}
          <filter
            id={`liquid-panel-${panelId}`}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            {/* Turbulence for organic distortion */}
            <feTurbulence
              baseFrequency={config.turbulence}
              numOctaves="4"
              seed={animated ? "2" : "8"}
              type="fractalNoise"
              result="turbulence"
            >
              {animated && (
                <animateTransform
                  attributeName="baseFrequency"
                  values={`${config.turbulence};0.02 0.03;${config.turbulence}`}
                  dur="8s"
                  repeatCount="indefinite"
                />
              )}
            </feTurbulence>

            {/* Displacement for glass refraction */}
            <feDisplacementMap
              in="SourceGraphic"
              in2="turbulence"
              scale={config.displacement}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />

            {/* Multi-layered blur for depth */}
            <feGaussianBlur
              in="displaced"
              stdDeviation={config.blur * 0.1}
              result="blur1"
            />
            <feGaussianBlur
              in="blur1"
              stdDeviation={config.blur * 0.05}
              result="blur2"
            />

            {/* Color enhancement */}
            <feColorMatrix
              in="blur2"
              type="matrix"
              values={`${config.brightness} 0 0 0 0.1
                      0 ${config.brightness} 0 0 0.1
                      0 0 ${config.brightness} 0 0.1
                      0 0 0 1 0`}
              result="enhanced"
            />

            {/* Saturation boost */}
            <feColorMatrix
              in="enhanced"
              type="saturate"
              values={config.saturation.toString()}
              result="saturated"
            />

            {/* Edge enhancement for crystalline effect */}
            <feConvolveMatrix
              in="saturated"
              kernelMatrix="0 -1 0 -1 5 -1 0 -1 0"
              result="sharpened"
            />

            {/* Final composite */}
            <feComposite in="sharpened" in2="SourceGraphic" operator="over" />
          </filter>

          {/* Chromatic aberration for premium effect */}
          <filter id={`chromatic-panel-${panelId}`}>
            <feOffset in="SourceGraphic" dx="0.8" dy="0" result="red" />
            <feOffset in="SourceGraphic" dx="-0.8" dy="0" result="blue" />
            <feOffset in="SourceGraphic" dx="0" dy="0.4" result="green" />
            <feBlend
              in="red"
              in2="SourceGraphic"
              mode="screen"
              result="redBlend"
            />
            <feBlend
              in="blue"
              in2="redBlend"
              mode="screen"
              result="blueBlend"
            />
            <feBlend in="green" in2="blueBlend" mode="screen" />
          </filter>

          {/* Liquid surface reflection */}
          <filter id={`reflection-${panelId}`}>
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation="0.5"
              result="blur"
            />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="1.5 0 0 0 0.2
                      0 1.5 0 0 0.2  
                      0 0 1.5 0 0.2
                      0 0 0 0.8 0"
            />
          </filter>
        </defs>
      </svg>

      <div
        className={`
          relative overflow-hidden transition-all duration-700 ease-out
          ${floating ? "transform hover:scale-[1.02] hover:-translate-y-1" : ""}
          ${animated ? "animate-pulse" : ""}
          ${className}
        `}
        style={{
          filter:
            intensity === "premium"
              ? `url(#liquid-panel-${panelId}) url(#chromatic-panel-${panelId}) url(#reflection-${panelId})`
              : `url(#liquid-panel-${panelId})`,
        }}
      >
        {/* Base glass background */}
        <div
          className="absolute inset-0"
          style={{
            background:
              intensity === "premium"
                ? "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%, rgba(255,255,255,0.15) 100%)"
                : "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.1) 100%)",
            backdropFilter: `blur(${config.blur}px) saturate(${config.saturation}) brightness(${config.brightness})`,
            boxShadow:
              intensity === "premium"
                ? "inset 0 2px 4px rgba(255,255,255,0.25), inset 0 -2px 4px rgba(255,255,255,0.1), 0 8px 32px rgba(0,0,0,0.3)"
                : "inset 0 1px 2px rgba(255,255,255,0.2), inset 0 -1px 2px rgba(255,255,255,0.1), 0 4px 16px rgba(0,0,0,0.2)",
          }}
        />

        {/* Liquid surface highlights */}
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 20%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0.6) 80%, transparent 100%)",
            filter: "blur(0.5px)",
          }}
        />

        {/* Bottom edge highlight */}
        <div
          className="absolute inset-x-0 bottom-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
            filter: "blur(0.3px)",
          }}
        />

        {/* Side reflections */}
        <div
          className="absolute inset-y-0 left-0 w-px"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.4) 30%, rgba(255,255,255,0.2) 70%, transparent 100%)",
            filter: "blur(0.2px)",
          }}
        />

        <div
          className="absolute inset-y-0 right-0 w-px"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.4) 30%, rgba(255,255,255,0.2) 70%, transparent 100%)",
            filter: "blur(0.2px)",
          }}
        />

        {/* Animated liquid flow effect */}
        {animated && (
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background:
                "radial-gradient(ellipse at 20% 50%, rgba(255,255,255,0.1) 0%, transparent 50%), radial-gradient(ellipse at 80% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)",
              animation: "liquid-flow 6s ease-in-out infinite",
            }}
          />
        )}

        {/* Content */}
        <div className="relative z-10">{children}</div>
      </div>

      {/* Animation styles */}
      <style jsx>{`
        @keyframes liquid-flow {
          0%,
          100% {
            transform: translateX(0) scale(1);
            opacity: 0.3;
          }
          25% {
            transform: translateX(10px) scale(1.1);
            opacity: 0.5;
          }
          50% {
            transform: translateX(0) scale(1.05);
            opacity: 0.4;
          }
          75% {
            transform: translateX(-10px) scale(0.95);
            opacity: 0.6;
          }
        }
      `}</style>
    </>
  );
}
