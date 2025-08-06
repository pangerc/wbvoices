import React from "react";

export interface LiquidGlassNavProps {
  children: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  className?: string;
}

export function LiquidGlassNav({
  children,
  isActive = false,
  onClick,
  className = "",
}: LiquidGlassNavProps) {
  return (
    <button
      onClick={onClick}
      className={`
        group relative px-5 py-1.5 rounded-full border outline-none cursor-pointer 
        transition-all duration-500 ease-out inline-block flex-shrink-0
        ${
          isActive
            ? "bg-white text-black border-white/80"
            : "text-white border-white/40 hover:border-white/70 hover:bg-white/10"
        }
        ${className}
      `}
      style={{
        backdropFilter: isActive
          ? "blur(8px) saturate(1.2)"
          : "blur(4px) saturate(1.1)",
        background: isActive
          ? "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 50%, rgba(255,255,255,0.95) 100%)"
          : "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 100%)",
        boxShadow: isActive
          ? "0 0 25px rgba(255,255,255,0.4), inset 0 1px 3px rgba(255,255,255,0.6), inset 0 -1px 2px rgba(0,0,0,0.1)"
          : "0 0 15px rgba(255,255,255,0.1), inset 0 1px 2px rgba(255,255,255,0.2)",
      }}
    >
      {/* Premium crystalline highlights */}
      {isActive && (
        <>
          <div
            className="absolute inset-x-2 top-0 h-px rounded-full pointer-events-none"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.9) 20%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.9) 80%, transparent 100%)",
              filter: "blur(0.3px)",
            }}
          />
          <div
            className="absolute inset-x-3 bottom-0 h-px rounded-full pointer-events-none"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 30%, rgba(255,255,255,0.3) 70%, transparent 100%)",
              filter: "blur(0.2px)",
            }}
          />
        </>
      )}

      {/* Liquid glow effect for inactive states */}
      {!isActive && (
        <div
          className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 60%, transparent 100%)",
            animation: "liquid-pulse 3s ease-in-out infinite",
          }}
        />
      )}

      <div className="relative z-10 flex items-center gap-2">{children}</div>

      {/* Animation styles */}
      <style jsx>{`
        @keyframes liquid-pulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0;
          }
          50% {
            transform: scale(1.05);
            opacity: 0.15;
          }
        }

        .group:hover {
          transform: translateY(-1px);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>
    </button>
  );
}
