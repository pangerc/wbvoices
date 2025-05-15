import React from "react";
import { Listbox } from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/16/solid";

export interface GlassyListboxProps<T> {
  label?: string;
  value: T;
  onChange: (value: T) => void;
  options: {
    value: T;
    label: string;
    flag?: string; // Optional flag code for languages
  }[];
  disabled?: boolean;
  loading?: boolean;
}

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
      {label && <label className="block  mb-2">{label}</label>}
      <Listbox value={value} onChange={onChange} disabled={disabled || loading}>
        <div className="relative">
          {/* Button with glassy effect */}
          <div className="relative">
            {/* Border div with gradient background */}
            <div className="absolute -inset-[0.5px] rounded-xl bg-gradient-to-b from-white/40 via-white/15 to-white/5 pointer-events-none"></div>
            {/* Subtle top reflection / highlight */}
            <div className="absolute inset-x-4 top-0 h-[1px] bg-white/20 rounded-full blur-[0.2px] pointer-events-none"></div>
            {/* Subtle outer glow */}
            <div className="absolute -inset-[0.5px] rounded-xl opacity-50 blur-[1px] bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none"></div>

            <Listbox.Button className="relative w-full cursor-default grid grid-cols-1 bg-[#161822]/90 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] py-2 pr-3 pl-3 text-left text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-white/30 focus:ring-offset-0 sm:text-sm/6">
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
                    : options.find((opt) => opt.value === value)?.label ||
                      value}
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
            </Listbox.Button>
          </div>

          {/* Dropdown options with glassy effect */}
          <Listbox.Options className="absolute z-10 mt-1 w-full overflow-auto rounded-xl py-1 text-base shadow-lg focus:outline-hidden">
            <div className="relative">
              {/* Border div with gradient background */}
              <div className="absolute -inset-[0.5px] rounded-xl bg-gradient-to-b from-white/40 via-white/15 to-white/5 pointer-events-none"></div>
              {/* Subtle top reflection / highlight */}
              <div className="absolute inset-x-4 top-0 h-[1px] bg-white/20 rounded-full blur-[0.2px] pointer-events-none"></div>
              {/* Subtle outer glow */}
              <div className="absolute -inset-[0.5px] rounded-xl opacity-50 blur-[1px] bg-gradient-to-b from-sky-500/5 to-transparent pointer-events-none"></div>

              <div className="relative bg-[#161822]/90 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] py-1 rounded-xl max-h-56 overflow-auto">
                {options.map((option) => (
                  <Listbox.Option
                    key={option.value as string}
                    value={option.value}
                    className={({ active }) =>
                      `cursor-default py-2 px-3 mx-1 my-0.5 rounded-lg select-none ${
                        active ? "bg-sky-600/30 text-white" : "text-gray-300"
                      }`
                    }
                  >
                    {({ selected }) => (
                      <div className="flex items-center gap-3">
                        {option.flag && (
                          <span
                            className={`fi fi-${option.flag} fis opacity-60`}
                          ></span>
                        )}
                        <span
                          className={`block truncate ${
                            selected ? "font-medium text-white" : "font-normal"
                          }`}
                        >
                          {option.label}
                        </span>
                      </div>
                    )}
                  </Listbox.Option>
                ))}
              </div>
            </div>
          </Listbox.Options>
        </div>
      </Listbox>
    </div>
  );
}
