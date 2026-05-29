"use client";

import { AdMetadataQuery } from "@/database/ads";
import { useAds } from "@/hooks/ads";
import { useDedupedValue } from "@/hooks/deduped-value";
import { Query } from "@/hooks/query";
import { generateProjectId } from "@/utils/projectId";
import { ArrowPathIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, ConfirmDialog } from "../ui";
import { Loading } from "../ui/Loading";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardProjects } from "./DashboardProjects";

const DEFAULT_AD_PAGE = 2;

export function Dashboard() {
  const [deleteId, setDeleteId] = useState<string>();
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

  const { ads, isLoading, isFirstLoad, reachedEnd, remove } = useAds({
    searchParams,
    skip,
  });

  const onNextPage = () => {
    setSkip((s) => s + DEFAULT_AD_PAGE);
  };

  const onClearFilters = () => {
    setSearchParams({});
  };

  const onDeleteStart = (id: string) => {
    setDeleteId(id);
  };

  const handleDelete = async (deleteId: string) => {
    remove(deleteId);
    setDeleteId(undefined);
  };

  const onDuplicate = () => {};

  const isFiltering =
    searchParams.name ||
    searchParams.client ||
    searchParams.market ||
    searchParams.language;

  const isDashboardEmpty = !isFiltering && ads.length === 0 && isFirstLoad;

  const isFilterEmpty = isFiltering && ads.length == 0;

  if (isFirstLoad) {
    return <DashboardLoading showText />;
  }

  if (isDashboardEmpty) {
    // If we are not filtering and we have zero ads, we need to show the welcome screen
    return <DashboardNoAds />;
  }

  const deleteTitle = ads.find((a) => a.id === deleteId)?.meta?.name || "";

  return (
    <>
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
              onDelete={onDeleteStart}
              onDuplicate={onDuplicate}
            />
            {isLoading && <DashboardLoading />}
          </>
        )}
      </div>
      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete project"
        message={
          <>
            Delete{" "}
            <span className="font-semibold text-white">
              &ldquo;{deleteTitle}&rdquo;
            </span>{" "}
            project? This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        isConfirming={!!!deleteId && isLoading}
        onConfirm={() => {
          handleDelete(deleteId!);
        }}
        onCancel={() => setDeleteId(undefined)}
      />
    </>
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
