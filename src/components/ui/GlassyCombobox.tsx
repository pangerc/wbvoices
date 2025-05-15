import React from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import { ChevronUpDownIcon, CheckIcon } from "@heroicons/react/16/solid";

export interface ComboboxItem<T> {
  value: T;
  label: string;
  flag?: string;
}

export interface GlassyComboboxProps<T> {
  label?: string;
  value: ComboboxItem<T> | null;
  onChange: (value: ComboboxItem<T> | null) => void;
  options: ComboboxItem<T>[];
  onQueryChange?: (query: string) => void;
  query?: string;
  disabled?: boolean;
  loading?: boolean;
}

export function GlassyCombobox<T>({
  label,
  value,
  onChange,
  options,
  onQueryChange,
  disabled = false,
  loading = false,
}: GlassyComboboxProps<T>) {
  return (
    <div>
      {label && <label className="block  mb-2">{label}</label>}
      <Combobox
        value={value}
        onChange={onChange}
        disabled={disabled || loading}
      >
        <div className="relative">
          {/* Button with glassy effect */}
          <div className="relative">
            {/* Border div with gradient background */}
            <div className="absolute -inset-[0.5px] rounded-xl bg-gradient-to-b from-white/40 via-white/15 to-white/5 pointer-events-none"></div>
            {/* Subtle top reflection / highlight */}
            <div className="absolute inset-x-4 top-0 h-[1px] bg-white/20 rounded-full blur-[0.2px] pointer-events-none"></div>
            {/* Subtle outer glow */}
            <div className="absolute -inset-[0.5px] rounded-xl opacity-50 blur-[1px] bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none"></div>

            <div className="relative flex items-center">
              <ComboboxInput
                className="w-full cursor-default bg-[#161822]/90 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] py-2 pr-10 pl-3 text-left text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm/6"
                onChange={(e) => onQueryChange && onQueryChange(e.target.value)}
                onBlur={() => onQueryChange && onQueryChange("")}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                displayValue={(item: ComboboxItem<T> | null) =>
                  item ? item.label : ""
                }
                disabled={loading || disabled}
              />
              <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
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
          </div>

          {/* Dropdown options with glassy effect */}
          {!loading && options.length > 0 && (
            <ComboboxOptions className="absolute z-10 mt-1 w-full overflow-auto rounded-xl py-1 text-base shadow-lg focus:outline-hidden">
              <div className="relative">
                {/* Border div with gradient background */}
                <div className="absolute -inset-[0.5px] rounded-xl bg-gradient-to-b from-white/40 via-white/15 to-white/5 pointer-events-none"></div>
                {/* Subtle top reflection / highlight */}
                <div className="absolute inset-x-4 top-0 h-[1px] bg-white/20 rounded-full blur-[0.2px] pointer-events-none"></div>
                {/* Subtle outer glow */}
                <div className="absolute -inset-[0.5px] rounded-xl opacity-50 blur-[1px] bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none"></div>

                <div className="relative bg-[#161822]/90 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] py-1 rounded-xl max-h-56 overflow-auto">
                  {options.map((option) => (
                    <ComboboxOption
                      key={String(option.value)}
                      value={option}
                      className={({ active }) =>
                        `cursor-default py-2 px-3 mx-1 my-0.5 rounded-lg select-none ${
                          active ? "bg-sky-600/30 text-white" : "text-gray-300"
                        }`
                      }
                    >
                      {({ selected }) => (
                        <div className="flex items-center">
                          {option.flag && (
                            <span
                              className={`fi fi-${option.flag} fis mr-3 opacity-60`}
                            ></span>
                          )}
                          <span
                            className={`block truncate ${
                              selected
                                ? "font-medium text-white"
                                : "font-normal"
                            }`}
                          >
                            {option.label}
                          </span>
                          {selected && (
                            <span
                              className={`absolute inset-y-0 right-0 flex items-center pr-4 text-sky-300/70`}
                            >
                              <CheckIcon
                                className="size-4"
                                aria-hidden="true"
                              />
                            </span>
                          )}
                        </div>
                      )}
                    </ComboboxOption>
                  ))}
                </div>
              </div>
            </ComboboxOptions>
          )}
        </div>
      </Combobox>
    </div>
  );
}
