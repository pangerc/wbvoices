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
      {label && <label className="block mb-2 text-white">{label}</label>}
      <Combobox
        value={value}
        onChange={onChange}
        disabled={disabled || loading}
      >
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
                onQueryChange && onQueryChange("");
              }}
              onChange={(e) => onQueryChange && onQueryChange(e.target.value)}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              displayValue={(item: ComboboxItem<T> | null) =>
                item ? item.label : ""
              }
              disabled={loading || disabled}
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
          {!loading && options.length > 0 && (
            <ComboboxOptions className="absolute z-10 mt-1 w-full overflow-auto rounded-xl py-2 text-base shadow-lg focus:outline-hidden bg-white/10 backdrop-blur-sm border border-white/10">
              <div className="max-h-56 overflow-auto">
                {options.map((option) => (
                  <ComboboxOption
                    key={String(option.value)}
                    value={option}
                    className={({ active }) =>
                      `cursor-default py-2 px-4 mx-1 my-0.5 rounded-lg select-none ${
                        active ? "bg-wb-blue/30 text-white" : "text-gray-300"
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
                            selected ? "font-medium text-white" : "font-normal"
                          }`}
                        >
                          {option.label}
                        </span>
                        {selected && (
                          <span
                            className={`absolute inset-y-0 right-0 flex items-center pr-4 text-wb-blue`}
                          >
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
        </div>
      </Combobox>
    </div>
  );
}
