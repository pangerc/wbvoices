import React, { useState } from "react";
import {
  Listbox,
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/16/solid";
import { CheckIcon } from "@heroicons/react/20/solid";
import { Language, getFlagCode } from "@/utils/language";
import { Provider } from "@/types";

type LanguagePanelProps = {
  selectedProvider: Provider;
  setSelectedProvider: (provider: Provider) => void;
  selectedLanguage: Language;
  setSelectedLanguage: (language: Language) => void;
  availableLanguages: { code: Language; name: string }[];
};

export function LanguagePanel({
  selectedProvider,
  setSelectedProvider,
  selectedLanguage,
  setSelectedLanguage,
  availableLanguages,
}: LanguagePanelProps) {
  const [languageQuery, setLanguageQuery] = useState("");

  // Filter languages based on search query
  const filteredLanguages =
    languageQuery === ""
      ? availableLanguages
      : availableLanguages.filter((lang) => {
          return lang.name.toLowerCase().includes(languageQuery.toLowerCase());
        });

  return (
    <div className="p-8 h-full">
      <h2 className="text-2xl font-bold mb-6">Language Selection</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm/6 font-medium text-gray-900 mb-2">
            Provider
          </label>
          <Listbox value={selectedProvider} onChange={setSelectedProvider}>
            <div className="relative">
              <Listbox.Button className="grid w-full cursor-default grid-cols-1 rounded-md bg-white py-1.5 pr-2 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-sky-500 sm:text-sm/6">
                <span className="col-start-1 row-start-1 flex items-center gap-3 pr-6">
                  <span className="block truncate capitalize">
                    {selectedProvider}
                  </span>
                </span>
                <ChevronUpDownIcon
                  aria-hidden="true"
                  className="col-start-1 row-start-1 size-5 self-center justify-self-end text-gray-500 sm:size-4"
                />
              </Listbox.Button>

              <Listbox.Options className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 text-base ring-1 shadow-lg ring-black/5 focus:outline-hidden">
                {["elevenlabs", "lovo"].map((provider) => (
                  <Listbox.Option
                    key={provider}
                    value={provider}
                    className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-sky-500 data-focus:text-white data-focus:outline-hidden"
                  >
                    {({ selected, active }) => (
                      <>
                        <span
                          className={`block truncate capitalize ${
                            selected ? "font-semibold" : "font-normal"
                          }`}
                        >
                          {provider}
                        </span>

                        {selected && (
                          <span
                            className={`absolute inset-y-0 right-0 flex items-center pr-4 ${
                              active ? "text-white" : "text-sky-500"
                            }`}
                          >
                            <CheckIcon aria-hidden="true" className="size-5" />
                          </span>
                        )}
                      </>
                    )}
                  </Listbox.Option>
                ))}
              </Listbox.Options>
            </div>
          </Listbox>
        </div>
        <div>
          <label className="block text-sm/6 font-medium text-gray-900 mb-2">
            Language
          </label>
          <Combobox
            value={
              availableLanguages.find(
                (lang) => lang.code === selectedLanguage
              ) || null
            }
            onChange={(lang) => {
              if (lang) {
                setSelectedLanguage(lang.code);
                setLanguageQuery("");
              }
            }}
          >
            <div className="relative">
              <ComboboxInput
                className="grid w-full cursor-default grid-cols-1 rounded-md bg-white py-1.5 pr-10 pl-3 text-left text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-sky-500 sm:text-sm/6"
                onChange={(event) => setLanguageQuery(event.target.value)}
                onBlur={() => setLanguageQuery("")}
                displayValue={(lang: (typeof availableLanguages)[0] | null) => {
                  if (!lang) return "";
                  return lang.name;
                }}
              />
              <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                <ChevronUpDownIcon
                  className="size-5 text-gray-400"
                  aria-hidden="true"
                />
              </ComboboxButton>

              {filteredLanguages.length > 0 && (
                <ComboboxOptions className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md bg-white py-1 text-base ring-1 shadow-lg ring-black/5 focus:outline-hidden">
                  {filteredLanguages.map((lang) => (
                    <ComboboxOption
                      key={lang.code}
                      value={lang}
                      className="group relative cursor-default py-2 pr-9 pl-3 text-gray-900 select-none data-focus:bg-sky-500 data-focus:text-white data-focus:outline-hidden"
                    >
                      {({ selected, active }) => (
                        <>
                          <div className="flex items-center">
                            <span
                              className={`fi fi-${getFlagCode(lang.code)} fis`}
                            />
                            <span
                              className={`ml-3 block truncate ${
                                selected ? "font-semibold" : "font-normal"
                              }`}
                            >
                              {lang.name}
                            </span>
                          </div>

                          {selected && (
                            <span
                              className={`absolute inset-y-0 right-0 flex items-center pr-4 ${
                                active ? "text-white" : "text-sky-500"
                              }`}
                            >
                              <CheckIcon
                                className="size-5"
                                aria-hidden="true"
                              />
                            </span>
                          )}
                        </>
                      )}
                    </ComboboxOption>
                  ))}
                </ComboboxOptions>
              )}
            </div>
          </Combobox>
        </div>
      </div>
    </div>
  );
}
