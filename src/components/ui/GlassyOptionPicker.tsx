import React from "react";

export interface Option<T> {
  value: T;
  label: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
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
      {label && <label className="block mb-2 text-white">{label}</label>}

      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 space-y-2">
        {options.map((option) => (
          <div
            key={option.value as string}
            className={`relative flex px-4 py-3 rounded-lg transition-colors duration-200 ${
              option.disabled
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer"
            } ${
              value === option.value
                ? "bg-wb-blue/30 text-white ring-1 ring-wb-blue/50"
                : option.disabled
                ? "bg-transparent text-gray-500"
                : "bg-transparent hover:bg-white/10 text-gray-300"
            }`}
            onClick={() => !option.disabled && onChange(option.value)}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center w-full">
                <div className="text-sm w-full">
                  <p
                    className={`font-medium w-full flex justify-between ${
                      value === option.value ? "text-white" : ""
                    }`}
                  >
                    {option.label}
                    {option.badge && (
                      <span
                        className={`ml-2 inline-flex items-center rounded-xl px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                          value === option.value
                            ? "bg-wb-blue/20 text-wb-blue ring-wb-blue/30"
                            : "bg-gray-500/20 text-gray-300 ring-gray-700/20"
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
                          ? "text-gray-300"
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
  );
}
