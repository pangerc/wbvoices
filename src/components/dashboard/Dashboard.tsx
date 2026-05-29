"use client";

import { adMetadataMatchQuery } from "@/common/search";
import { AdMetadataQuery } from "@/database/ads";
import { FuzzyResult, QueryResult } from "@/database/base";
import { useDedupedValue } from "@/hooks/deduped-value";
import { Query, useQuery } from "@/hooks/query";
import { AdMetadata } from "@/types/versions";
import { generateProjectId } from "@/utils/projectId";
import { ArrowPathIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "../ui";
import { Loading } from "../ui/Loading";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardProjects } from "./DashboardProjects";

const DEFAULT_AD_PAGE = 8;

export function Dashboard() {
  const [searchParams, setSearchParams] = useState<AdMetadataQuery>({});
  const [skip, setSkip] = useState(0);

  const query = useDedupedValue<Query>(
    300,
    useMemo(
      () => ({
        searchParams,
        pagination: { skip, take: DEFAULT_AD_PAGE },
      }),
      [searchParams, skip],
    ),
  );

  const {
    data: ads,
    isLoading,
    isFirstLoad,
    reachedEnd,
  } = useQuery<QueryResult<AdMetadata>>({
    url: "/api/ads",
    query: query,
    eager: (data) =>
      data
        .reduce((acc, item) => {
          if (!item.meta) {
            return acc;
          }

          const match = adMetadataMatchQuery(item.meta, searchParams);

          if (match) {
            let fuzzy: FuzzyResult | undefined;

            if (typeof match !== "boolean") {
              fuzzy = match;
            }

            if (match) {
              item.fuzzy = fuzzy;
            }

            acc.push(item);
          }

          return acc;
        }, [] as QueryResult<AdMetadata>[])
        .sort((a, b) => (b.fuzzy?.score || 0) - (a.fuzzy?.score || 0)),
    deps: [query],
    initial: [],
  });

  const onNextPage = () => {
    setSkip((s) => s + DEFAULT_AD_PAGE);
  };

  const onClearFilters = () => {
    setSearchParams({});
  };

  const isFiltering =
    searchParams.name ||
    searchParams.client ||
    searchParams.market ||
    searchParams.language;

  const isDashboardEmpty = !isFiltering && ads.length === 0 && !isLoading;

  const isFilterEmpty = isFiltering && ads.length == 0;

  if (isFirstLoad) {
    return <DashboardLoading showText />;
  }

  if (isDashboardEmpty) {
    // If we are not filtering and we have zero ads, we need to show the welcome screen
    return <DashboardNoAds />;
  }

  return (
    <div className="container pb-4 mx-auto z-10">
      <DashboardHeader
        search={searchParams}
        onSearchChanged={(change) => {
          setSearchParams((sp) => ({ ...sp, ...change }));
          setSkip(0);
        }}
      />
      {ads.length === 0 && isLoading ? (
        <DashboardLoading />
      ) : isFilterEmpty ? (
        <DashboardFilterNoAds onClearFilters={onClearFilters} />
      ) : (
        <>
          <DashboardProjects
            ads={ads}
            isLoading={isLoading}
            onNextPage={onNextPage}
            reachedEnd={reachedEnd}
          />
          {isLoading && <DashboardLoading />}
        </>
      )}
    </div>
  );
}

type DashboardLoadingProps = { showText?: boolean };

export function DashboardLoading({ showText = false }: DashboardLoadingProps) {
  return (
    <div className="flex py-16 justify-center items-center gap-2">
      <Loading />
      {showText && <div>Loading your projects</div>}
    </div>
  );
}

export function DashboardNoAds() {
  const router = useRouter();

  const onNewAd = () => {
    const adId = generateProjectId();
    console.log(`🚀 Generated client-side adId: ${adId} (not persisted yet)`);

    router.replace(`/ad/${adId}`);
  };

  return (
    <div className="flex flex-1 gap-16 py-16 justify-center items-center flex-col">
      <div>You do not have any projects. Create an ad now.</div>
      <Button variant="ghost" icon={PlusIcon} onClick={() => onNewAd()}>
        New Project
      </Button>
    </div>
  );
}

type DashboardFilterNoAdsProps = {
  onClearFilters: () => void;
};

export function DashboardFilterNoAds({
  onClearFilters,
}: DashboardFilterNoAdsProps) {
  return (
    <div className="flex flex-1 gap-16 py-16 justify-center items-center flex-col">
      <div>The filters returned no projects.</div>
      <Button
        variant="ghost"
        icon={ArrowPathIcon}
        onClick={() => onClearFilters()}
      >
        Clear filters
      </Button>
    </div>
  );
}
