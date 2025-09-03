import React, { ReactNode } from "react";

export interface TickMark {
  value: number;
  label: string;
}

export interface GlassySliderProps {
  label?: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  tickMarks?: TickMark[];
  formatLabel?: (value: number) => string;
}

export function GlassySlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  tickMarks = [],
  formatLabel = (val) => `${val}`,
}: GlassySliderProps) {
  // Calculate percentage for thumb position
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="mt-6">
      {label !== null && (
        <label className="block text-base mb-3">
          {label ? (
            label
          ) : (
            <span className=" text-xs text-gray-500">{formatLabel(value)}</span>
          )}
        </label>
      )}

      <div className="relative h-6 flex items-center px-2 bg-white/10 backdrop-blur-sm rounded-full">
        {/* Simple track */}
        <div className="absolute inset-x-2 h-1.5 bg-gray-600/60 rounded-full"></div>

        {/* Progress track */}
        <div
          className="absolute left-2 h-1.5 bg-wb-blue/60 rounded-full"
          style={{ width: `${percentage}%` }}
        ></div>

        {/* Slider thumb */}
        <div
          className="absolute w-4 h-4 bg-white rounded-full shadow-lg border border-white/20 pointer-events-none"
          style={{ left: `${percentage}%`, transform: "translateX(-50%)" }}
        ></div>

        {/* Actual range input (invisible but handles interaction) */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      {/* Tick marks */}
      {tickMarks.length > 0 && (
        <div className="relative w-full mt-6 h-6">
          {tickMarks.map((tick) => (
            <div
              key={tick.value}
              className="absolute text-xs text-gray-400 opacity-80"
              style={{
                left:
                  tick.value === min
                    ? "0%"
                    : tick.value === max
                    ? "100%"
                    : `${((tick.value - min) / (max - min)) * 100}%`,
                transform:
                  tick.value === min
                    ? "none"
                    : tick.value === max
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
              }}
            >
              {tick.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
