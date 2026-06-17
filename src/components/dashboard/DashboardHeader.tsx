import { AdMetadataQuery } from "@/database/ads";
import { useAuth } from "@/hooks/auth";
import { useLanguageOptions } from "@/hooks/languages";
import { useMarkets } from "@/hooks/market";
import {
  BrandRef,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_VALUES,
  ProjectStatus,
} from "@/types";
import { getFlagCode, getLanguageName, Language } from "@/utils/language";
import { AdjustmentsHorizontalIcon } from "@heroicons/react/24/outline";
import { ReactNode, useMemo, useState } from "react";
import {
  Button,
  ComboboxItem,
  GlassyCombobox,
  GlassyModal,
  IconButton,
  SearchInput,
  Tag,
} from "../ui";

type DashboardHeaderProps = {
  search: AdMetadataQuery;
  onSearchChanged: (partial: Partial<AdMetadataQuery>) => void;
};

export function DashboardHeader({
  search,
  onSearchChanged,
}: DashboardHeaderProps) {
  const { markets } = useMarkets();
  const [filtersModalVisible, showFiltersModal] = useState(false);

  const smallFiltersButton =
    search.client || search.language || search.market || search.status;

  const tags: ReactNode[] = [];

  if (search.client) {
    tags.push(
      <Tag
        label={search.client}
        key={`client-${search.client}`}
        onRemove={() => onSearchChanged({ client: undefined })}
      />,
    );
  }

  if (search.market && search.market !== "") {
    const market = markets.find((m) => m.code === search.market);

    if (market) {
      tags.push(
        <Tag
          label={market!.name}
          key={`market-${search.market}`}
          onRemove={() => onSearchChanged({ market: undefined })}
        />,
      );
    }
  }

  if (search.language) {
    tags.push(
      <Tag
        label={getLanguageName(search.language)}
        key={`language-${search.language}`}
        onRemove={() => onSearchChanged({ language: undefined })}
      />,
    );
  }

  if (search.status) {
    tags.push(
      <Tag
        label={PROJECT_STATUS_LABELS[search.status]}
        key={`status-${search.status}`}
        onRemove={() => onSearchChanged({ status: undefined })}
      />,
    );
  }

  return (
    <>
      <div className="flex justify-between items-center overflow-y-auto py-16">
        <DashboardHeaderTitle />

        <div className="flex justify-between items-center gap-10">
          {tags}
          {smallFiltersButton ? (
            <IconButton
              aria-label="Filters"
              variant="ghost"
              icon={AdjustmentsHorizontalIcon}
              onClick={() => showFiltersModal(true)}
            />
          ) : (
            <Button
              variant="ghost"
              icon={AdjustmentsHorizontalIcon}
              onClick={() => showFiltersModal(true)}
            >
              Filters
            </Button>
          )}
          <SearchInput
            value={search.name ?? ""}
            placeholder="Search project"
            onChange={(e) =>
              onSearchChanged({
                name: e.currentTarget.value,
              })
            }
          />
        </div>
      </div>
      {filtersModalVisible && (
        <FiltersModal
          filters={search}
          onFiltersChanged={(change) => {
            onSearchChanged(change);
            showFiltersModal(false);
          }}
          onCancel={() => showFiltersModal(false)}
        />
      )}
    </>
  );
}

function DashboardHeaderTitle() {
  const { isAdmin } = useAuth();

  const title = isAdmin ? "All Projects" : "My Projects";
  const subtitle = isAdmin
    ? "View and manage all ad campaigns."
    : "View and manage your ad campaigns.";

  return (
    <div className="flex flex-col pl-4">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <h2 className="">{subtitle}</h2>
    </div>
  );
}

type FiltersModalProps = {
  onCancel: () => void;

  filters: Exclude<AdMetadataQuery, "name">;
  onFiltersChanged: (
    partial: Partial<Exclude<AdMetadataQuery, "name">>,
  ) => void;
};

function FiltersModal({
  filters,
  onFiltersChanged,
  onCancel,
}: FiltersModalProps) {
  const [brand, setBrand] = useState<BrandRef | null>(null);
  const [language, setLanguage] = useState(filters.language);
  const [market, setMarket] = useState(filters.market);
  const [status, setStatus] = useState(filters.status);

  const onSubmit = () => {
    onFiltersChanged({
      market,
      language,
      client: brand?.name,
      status,
    });
  };

  return (
    <GlassyModal isOpen onClose={onCancel} title="Filter dashboard projects">
      <div className="flex flex-col gap-6">
        {/*
        FIXME: Add Brand filtering back
        <div className="flex flex-col gap-2">
          <div className="text-white">Client</div>
          <BrandPickerSubeditor brand={brand} onBrandChanged={setBrand} />
        </div> */}
        <div className="flex flex-col gap-2">
          <div className="text-white">Market</div>
          <MarketPicker value={market} onChange={setMarket} />
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-white">Language</div>
          <LanguagePicker value={language} onChange={setLanguage} />
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-white">Status</div>
          <StatusPicker value={status} onChange={setStatus} />
        </div>
        <div className="flex justify-between">
          <Button variant="destructive" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>Submit</Button>
        </div>
      </div>
    </GlassyModal>
  );
}

type MarketPickerProps = {
  value?: string;
  onChange: (value?: string) => void;
};

function MarketPicker({ value = "", onChange }: MarketPickerProps) {
  const [eagerQuery, setEagerQuery] = useState<string>("");

  const { markets, isLoading } = useMarkets({ eagerQuery });

  const options: ComboboxItem<string>[] = markets.map((m) => ({
    value: m.code,
    label: m.name,
    flag: m.language?.code ? getFlagCode(m.language.code) : undefined,
  }));

  const comboboxItemValue = options.find((m) => m.value === value);

  return (
    <GlassyCombobox<string>
      value={comboboxItemValue}
      onChange={(v) => onChange(v?.value)}
      options={options}
      onQueryChange={setEagerQuery}
      loading={isLoading}
    />
  );
}

type LanguagePickerProps = {
  value?: Language;
  onChange: (value?: Language) => void;
};

function LanguagePicker({ value, onChange }: LanguagePickerProps) {
  const [languageQuery, setLanguageQuery] = useState("");
  const { languages } = useLanguageOptions();

  const languageOptions: ComboboxItem<Language>[] = useMemo(
    () =>
      languages.map((lang) => ({
        value: lang.code,
        label: lang.name,
        flag: getFlagCode(lang.code),
      })),
    [languages],
  );

  const filteredLanguages = useMemo(() => {
    if (languageQuery === "") return languageOptions;
    return languageOptions.filter(
      (lang) =>
        lang &&
        lang.label &&
        lang.label.toLowerCase().includes(languageQuery.toLowerCase()),
    );
  }, [languageQuery, languageOptions]);

  return (
    <GlassyCombobox<Language>
      value={languageOptions.find((l) => l.value === value) || null}
      onChange={(item) => onChange(item?.value)}
      options={filteredLanguages}
      onQueryChange={setLanguageQuery}
    />
  );
}

type StatusPickerProps = {
  value?: ProjectStatus;
  onChange: (value?: ProjectStatus) => void;
};

function StatusPicker({ value, onChange }: StatusPickerProps) {
  const options: ComboboxItem<ProjectStatus>[] = PROJECT_STATUS_VALUES.map(
    (s) => ({ value: s, label: PROJECT_STATUS_LABELS[s] }),
  );

  return (
    <GlassyCombobox<ProjectStatus>
      value={options.find((o) => o.value === value) || null}
      onChange={(item) => onChange(item?.value)}
      options={options}
    />
  );
}
