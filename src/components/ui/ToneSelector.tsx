import React from "react";
import { Listbox } from "@headlessui/react";
import { ChevronUpDownIcon, CheckIcon } from "@heroicons/react/16/solid";

export type ToneOption = {
  value: string;
  title: string;
  description: string;
};

export interface ToneSelectorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: ToneOption[];
  emptyOption?: ToneOption; // Rendered first; selecting it passes `null` to onChange
  disabled?: boolean;
}

export function ToneSelector({
  value,
  onChange,
  options,
  emptyOption,
  disabled = false,
}: ToneSelectorProps) {
  // Internal sentinel for the "empty" option so Listbox can track it as a selectable value
  const EMPTY = "__empty__";
  const listValue = value ?? EMPTY;
  const handleChange = (v: string) => onChange(v === EMPTY ? null : v);

  const display =
    options.find((o) => o.value === value) ||
    emptyOption ||
    options[0];

  const allOptions: Array<{ key: string; option: ToneOption }> = [
    ...(emptyOption ? [{ key: EMPTY, option: emptyOption }] : []),
    ...options.map((o) => ({ key: o.value, option: o })),
  ];

  return (
    <Listbox value={listValue} onChange={handleChange} disabled={disabled}>
      <div className="relative">
        <Listbox.Button className="relative w-full cursor-pointer bg-white/10 hover:bg-white/15 backdrop-blur-sm py-3 pr-10 pl-4 text-left text-white text-sm rounded-xl focus:outline-none focus:ring-1 focus:ring-wb-blue/50 border border-white/10 transition-colors">
          {display.title}
          <ChevronUpDownIcon
            aria-hidden="true"
            className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-gray-400/60"
          />
        </Listbox.Button>

        <Listbox.Options className="absolute z-50 mt-1 w-full overflow-auto rounded-xl py-2 shadow-lg focus:outline-hidden bg-gray-900/80 backdrop-blur-xl border border-white/20 max-h-96">
          {allOptions.map(({ key, option }) => (
            <Listbox.Option
              key={key}
              value={key}
              className={({ active, selected }) =>
                `cursor-pointer py-2.5 px-4 mx-1 my-0.5 rounded-lg select-none ${
                  selected
                    ? "bg-wb-blue/30 text-white"
                    : active
                      ? "bg-white/10 text-white"
                      : "text-gray-200"
                }`
              }
            >
              {({ selected }) => (
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{option.title}</div>
                    {option.description && (
                      <div className="mt-0.5 text-xs text-gray-400 leading-snug">
                        {option.description}
                      </div>
                    )}
                  </div>
                  {selected && (
                    <CheckIcon
                      aria-hidden="true"
                      className="size-4 flex-shrink-0 text-white mt-0.5"
                    />
                  )}
                </div>
              )}
            </Listbox.Option>
          ))}
        </Listbox.Options>
      </div>
    </Listbox>
  );
}
