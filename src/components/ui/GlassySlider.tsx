import React from "react";

export interface TickMark {
  value: number;
  label: string;
}

export interface GlassySliderProps {
  label?: string;
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
      <label className="block text-base mb-3">
        {label ? (
          <>
            {label}&nbsp;
            <span className="text-xs text-gray-500">{formatLabel(value)}</span>
          </>
        ) : (
          <span className=" text-xs text-gray-500">{formatLabel(value)}</span>
        )}
      </label>

      <div className="relative h-6 flex items-center">
        {/* Simple track with subtle border */}
        <div className="absolute inset-x-0 h-1.5 bg-gray-600/80 rounded-full border border-white/10"></div>

        {/* Actual range input (invisible but handles interaction) */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />

        {/* Simple white thumb */}
        <div
          className="absolute w-4 h-4 bg-white rounded-full z-0 shadow-sm pointer-events-none"
          style={{ left: `${percentage}%`, transform: "translateX(-50%)" }}
        ></div>
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
