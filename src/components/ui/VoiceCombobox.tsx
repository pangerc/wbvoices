import React, { useState, useMemo } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import { ChevronUpDownIcon, CheckIcon } from "@heroicons/react/16/solid";
import { Voice } from "@/types";
import { getFlagCode } from "@/utils/language";

export interface VoiceComboboxProps {
  label?: string;
  value: Voice | null;
  onChange: (voice: Voice | null) => void;
  voices: Voice[];
  disabled?: boolean;
  loading?: boolean;
}

export function VoiceCombobox({
  label,
  value,
  onChange,
  voices,
  disabled = false,
  loading = false,
}: VoiceComboboxProps) {
  const [query, setQuery] = useState("");

  // Filter voices by name search
  const filteredVoices = useMemo(() => {
    if (query === "") return voices;
    return voices.filter((voice) =>
      voice.name.toLowerCase().includes(query.toLowerCase())
    );
  }, [query, voices]);

  return (
    <div>
      {label && <label className="block mb-2 text-white">{label}</label>}
      <Combobox value={value} onChange={onChange} disabled={disabled || loading}>
        <div className="relative">
          <div className="relative bg-white/10 backdrop-blur-sm rounded-xl border border-white/10">
            <ComboboxInput
              className="w-full cursor-default bg-transparent py-3 pr-10 pl-4 text-left text-white rounded-xl focus:outline-none focus:border-wb-blue/70 border-0 transition-all duration-200 sm:text-sm/6"
              style={{ boxShadow: "none" }}
              onFocus={(e) => {
                e.target.parentElement!.style.boxShadow =
                  "0 0 0 1px rgba(47, 125, 250, 0.5)";
                e.target.parentElement!.style.borderColor =
                  "rgba(47, 125, 250, 0.7)";
              }}
              onBlur={(e) => {
                e.target.parentElement!.style.boxShadow = "none";
                e.target.parentElement!.style.borderColor =
                  "rgba(255, 255, 255, 0.1)";
                setQuery("");
              }}
              onChange={(e) => setQuery(e.target.value)}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              displayValue={(voice: Voice | null) => voice?.name || ""}
              disabled={loading || disabled}
              placeholder={loading ? "Loading voices..." : "Search voices..."}
            />
            <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-3">
              {loading ? (
                <svg
                  className="animate-spin h-5 w-5 text-gray-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              ) : (
                <ChevronUpDownIcon
                  className="size-5 text-gray-400/60"
                  aria-hidden="true"
                />
              )}
            </ComboboxButton>
          </div>

          {/* Dropdown options */}
          {!loading && filteredVoices.length > 0 && (
            <ComboboxOptions className="absolute z-50 mt-1 w-full overflow-auto rounded-xl py-2 text-base shadow-lg focus:outline-hidden bg-gray-900 border border-white/20">
              <div className="max-h-80 overflow-auto">
                {filteredVoices.map((voice) => (
                  <ComboboxOption
                    key={voice.id}
                    value={voice}
                    className={({ active }) =>
                      `cursor-default py-2.5 px-4 mx-1 my-0.5 rounded-lg select-none ${
                        active ? "bg-wb-blue/30 text-white" : "text-gray-300"
                      }`
                    }
                  >
                    {({ selected }) => (
                      <div className="flex items-start gap-3">
                        {/* Flag */}
                        {voice.language && (
                          <span
                            className={`fi fi-${getFlagCode(
                              voice.language
                            )} fis opacity-60 mt-0.5 flex-shrink-0`}
                          ></span>
                        )}

                        {/* 2-row content */}
                        <div className="flex-1 min-w-0">
                          {/* Row 1: Voice name */}
                          <div
                            className={`block truncate text-sm ${
                              selected ? "font-semibold text-white" : "font-medium"
                            }`}
                          >
                            {voice.name}
                          </div>

                          {/* Row 2: Pills */}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {voice.gender && (
                              <span className="px-1.5 py-0.5 text-xs bg-white/10 rounded text-gray-400">
                                {voice.gender.charAt(0).toUpperCase() +
                                  voice.gender.slice(1)}
                              </span>
                            )}
                            {voice.age && (
                              <span className="px-1.5 py-0.5 text-xs bg-white/10 rounded text-gray-400">
                                {voice.age.replace("_", " ")}
                              </span>
                            )}
                            {voice.accent && (
                              <span className="px-1.5 py-0.5 text-xs bg-white/10 rounded text-gray-400">
                                {voice.accent}
                              </span>
                            )}
                            {voice.description && (
                              <span className="px-1.5 py-0.5 text-xs bg-white/10 rounded text-gray-400 max-w-[200px] truncate">
                                {voice.description}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Checkmark */}
                        {selected && (
                          <span className="flex items-center text-wb-blue flex-shrink-0">
                            <CheckIcon className="size-4" aria-hidden="true" />
                          </span>
                        )}
                      </div>
                    )}
                  </ComboboxOption>
                ))}
              </div>
            </ComboboxOptions>
          )}

          {/* No results message */}
          {!loading && query && filteredVoices.length === 0 && (
            <ComboboxOptions
              static
              className="absolute z-50 mt-1 w-full rounded-xl py-2 text-base shadow-lg bg-gray-900 border border-white/20"
            >
              <div className="px-4 py-2 text-sm text-gray-400">
                No voices found matching &quot;{query}&quot;
              </div>
            </ComboboxOptions>
          )}
        </div>
      </Combobox>
    </div>
  );
}
