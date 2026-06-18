import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/16/solid";
import { twMerge } from "tailwind-merge";

/** A single selectable row in a {@link GlassyCombobox}. */
export interface ComboboxItem<T> {
  /** Underlying value carried by the option; surfaced via `onChange`. */
  value: T;
  /** Human-readable text shown in the trigger and the dropdown row. */
  label: string;
  /** Optional `flag-icons` country code (e.g. `"us"`) rendered as a leading flag. */
  flag?: string;
}

/** Props for {@link GlassyCombobox}, a frosted-glass typeahead built on Headless UI's `Combobox`. */
export interface GlassyComboboxProps<T> {
  /** Optional block label rendered above the trigger. */
  label?: string;
  /** Currently selected item, or `null`/`undefined` when nothing is selected. */
  value?: ComboboxItem<T> | null;
  /** Called with the newly selected item, or `null` when the selection is cleared. */
  onChange: (value: ComboboxItem<T> | null) => void;
  /** Options to render in the dropdown. */
  options: ComboboxItem<T>[];
  /** Called as the user types; use it to drive async/filtered `options`. Reset to `""` automatically when the dropdown closes. */
  onQueryChange?: (query: string) => void;
  /** Disables all interaction. */
  disabled?: boolean;
  /** Shows a spinner and disables interaction while options load. */
  loading?: boolean;
  /** Placeholder shown in the input when nothing is selected/typed. */
  placeholder?: string;
}

/**
 * Frosted-glass typeahead built on Headless UI's `Combobox`. Focus, active, and
 * selected styling are driven entirely by CSS (`focus-within:`) and Headless UI
 * data attributes (`data-focus`, `data-selected`) rather than imperative DOM
 * mutation, and the query is reset on close via the `onClose` hook.
 */
export function GlassyCombobox<T>({
  label,
  value,
  onChange,
  options,
  onQueryChange,
  disabled = false,
  loading = false,
  placeholder,
}: GlassyComboboxProps<T>) {
  return (
    <div>
      {label && <label className="block mb-2 text-white">{label}</label>}
      <Combobox
        value={value}
        onChange={onChange}
        onClose={() => onQueryChange?.("")}
        disabled={disabled || loading}
      >
        <div className="relative">
          <div className="relative bg-white/10 backdrop-blur-sm rounded-xl border border-white/10 transition-all duration-200 focus-within:border-wb-blue/70 focus-within:ring-1 focus-within:ring-wb-blue/50">
            <ComboboxInput
              className="w-full cursor-default bg-transparent py-3 pr-10 pl-4 text-left text-white rounded-xl border-0 focus:outline-none placeholder:text-gray-400 sm:text-sm/6"
              placeholder={placeholder}
              onChange={(e) => onQueryChange?.(e.target.value)}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              displayValue={(item: ComboboxItem<T> | null) =>
                item ? item.label : ""
              }
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
            <ComboboxOptions
              anchor="bottom start"
              transition
              className="z-50 w-(--input-width) [--anchor-gap:0.25rem] rounded-xl py-2 text-base shadow-lg focus:outline-hidden bg-gray-900/50 backdrop-blur-xl border border-white/20 transition duration-100 ease-out data-closed:opacity-0"
            >
              <div className="max-h-56 overflow-auto">
                {options.map((option) => (
                  <ComboboxOption
                    key={String(option.value)}
                    value={option}
                    className={({ focus }) =>
                      twMerge(
                        "relative flex items-center cursor-default py-2 px-4 mx-1 my-0.5 rounded-lg select-none text-gray-300",
                        focus && "bg-wb-blue/30 text-white",
                      )
                    }
                  >
                    {({ selected }) => (
                      <>
                        {option.flag && (
                          <span
                            className={`fi fi-${option.flag} fis mr-3 opacity-60`}
                          ></span>
                        )}
                        <span
                          className={twMerge(
                            "block truncate font-normal",
                            selected && "font-medium text-white",
                          )}
                        >
                          {option.label}
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-wb-blue">
                            <CheckIcon className="size-4" aria-hidden="true" />
                          </span>
                        )}
                      </>
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
