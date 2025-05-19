import React from "react";

export interface Option<T> {
  value: T;
  label: string;
  description?: string;
  badge?: string;
}

export interface GlassyOptionPickerProps<T> {
  label?: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function GlassyOptionPicker<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: GlassyOptionPickerProps<T>) {
  return (
    <div className="space-y-4">
      {label && <label className="block mb-2">{label}</label>}

      <div className="relative rounded-xl p-3 border border-white/20 border-solid">
        <div className="absolute -inset-0.5 rounded-xl blur-[2px] bg-white/5 -z-10"></div>

        <div className="space-y-4">
          {options.map((option) => (
            <div
              key={option.value as string}
              className={`relative flex cursor-pointer px-5 py-4 rounded-lg transition-colors duration-200 ${
                value === option.value
                  ? "bg-white text-[#161822]"
                  : "bg-[#161822]/90 hover:bg-[#1e202e]/90 text-gray-300 border border-white/20"
              }`}
              onClick={() => onChange(option.value)}
            >
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center w-full">
                  <div className="text-sm w-full">
                    <p
                      className={`font-medium w-full flex justify-between ${
                        value === option.value ? "text-black" : ""
                      }`}
                    >
                      {option.label}
                      {option.badge && (
                        <span
                          className={`ml-2 inline-flex items-center rounded-xl px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                            value === option.value
                              ? "bg-sky-100 text-sky-800 ring-sky-600/20"
                              : "bg-sky-500/20 text-sky-300 ring-sky-700/20"
                          }`}
                        >
                          {option.badge}
                        </span>
                      )}
                    </p>
                    {option.description && (
                      <div
                        className={` inline ${
                          value === option.value
                            ? "text-gray-700"
                            : "text-gray-400"
                        }`}
                      >
                        {option.description}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
