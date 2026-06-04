import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/16/solid";
import { twMerge } from "tailwind-merge";

/** Props for {@link GlassyListbox}, a frosted-glass select built on Headless UI's `Listbox`. */
export interface GlassyListboxProps<T> {
  /** Optional block label rendered above the trigger. */
  label?: string;
  /** Currently selected value. */
  value: T;
  /** Called with the newly selected value. */
  onChange: (value: T) => void;
  /** Options to render in the dropdown. */
  options: {
    /** Underlying value carried by the option; surfaced via `onChange`. */
    value: T;
    /** Human-readable text shown in the trigger and the dropdown row. */
    label: string;
    /** Optional `flag-icons` country code (e.g. `"us"`) rendered as a leading flag. */
    flag?: string;
  }[];
  /** Disables all interaction. */
  disabled?: boolean;
  /** Shows a spinner and disables interaction while options load. */
  loading?: boolean;
}

/**
 * Frosted-glass select built on Headless UI's `Listbox`. Active and selected
 * styling are driven by Headless UI render-props (`focus`, `selected`), and the
 * dropdown renders through Headless UI's portal via the `anchor` prop so it
 * escapes ancestor `overflow`/stacking contexts.
 */
export function GlassyListbox<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled = false,
  loading = false,
}: GlassyListboxProps<T>) {
  return (
    <div>
      {label && <label className="block mb-2 text-white">{label}</label>}
      <Listbox value={value} onChange={onChange} disabled={disabled || loading}>
        <div className="relative">
          <ListboxButton className="relative w-full cursor-default grid grid-cols-1 bg-white/10 backdrop-blur-sm py-3 pr-3 pl-4 text-left text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-wb-blue/50 focus:ring-offset-0 focus:border-wb-blue/50 border border-white/10 transition-all duration-200 sm:text-sm/6">
            <span className="col-start-1 row-start-1 flex items-center gap-3 pr-6">
              {options.find((opt) => opt.value === value)?.flag && (
                <span
                  className={`fi fi-${
                    options.find((opt) => opt.value === value)?.flag
                  } fis opacity-60`}
                ></span>
              )}
              <span className="block truncate capitalize">
                {loading
                  ? "Loading..."
                  : options.find((opt) => opt.value === value)?.label || value}
              </span>
            </span>
            {loading ? (
              <svg
                className="col-start-1 row-start-1 size-5 self-center justify-self-end animate-spin text-gray-400"
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
                aria-hidden="true"
                className="col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-400/60 sm:size-4"
              />
            )}
          </ListboxButton>

          {/* Dropdown options */}
          <ListboxOptions
            anchor="bottom start"
            transition
            className="z-50 w-(--button-width) [--anchor-gap:0.25rem] rounded-xl py-2 text-base shadow-lg focus:outline-hidden bg-gray-900/50 backdrop-blur-xl border border-white/20 transition duration-100 ease-out data-closed:opacity-0"
          >
            <div className="max-h-56 overflow-auto">
              {options.map((option) => (
                <ListboxOption
                  key={option.value as string}
                  value={option.value}
                  className={({ focus }) =>
                    twMerge(
                      "flex items-center gap-3 cursor-default py-2 px-4 mx-1 my-0.5 rounded-lg select-none text-gray-300",
                      focus && "bg-wb-blue/30 text-white",
                    )
                  }
                >
                  {({ selected }) => (
                    <>
                      {option.flag && (
                        <span
                          className={`fi fi-${option.flag} fis opacity-60`}
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
                    </>
                  )}
                </ListboxOption>
              ))}
            </div>
          </ListboxOptions>
        </div>
      </Listbox>
    </div>
  );
}
