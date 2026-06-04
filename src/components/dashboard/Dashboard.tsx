"use client";

import { AdMetadataQuery } from "@/database/ads";
import { useAds } from "@/hooks/ads";
import { generateProjectId } from "@/utils/projectId";
import { ArrowPathIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DuplicateAdPopup } from "../DuplicateAdPopup";
import { Button, ConfirmDialog } from "../ui";
import { Loading } from "../ui/Loading";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardProjects } from "./DashboardProjects";

const DEFAULT_PROJECT_PER_PAGE = 8;

export function Dashboard() {
  const [pendingDeleteId, setPendingDeleteId] = useState<string>();
  const [pendingDuplicateId, setPendingDuplicateId] = useState<string>();

  const [searchParams, setSearchParams] = useState<AdMetadataQuery>({});

  const { ads, isLoading, isFirstLoad, reachedEnd, remove, next } = useAds({
    searchParams,
  });

  const onClearFilters = () => {
    setSearchParams({});
  };

  const onDeleteStart = (id: string) => {
    setPendingDeleteId(id);
  };

  const handleDelete = async (deleteId: string) => {
    remove(deleteId);
    setPendingDeleteId(undefined);
  };

  const onDuplicate = (id: string) => {
    setPendingDuplicateId(id);
  };

  const isFiltering =
    searchParams.name ||
    searchParams.client ||
    searchParams.market ||
    searchParams.language;

  const isFilterEmpty = isFiltering && ads.length == 0;

  if (isFirstLoad) {
    return <DashboardLoading showText />;
  }

  const isDashboardEmpty = !isFiltering && ads.length === 0;

  if (isDashboardEmpty) {
    // If we are not filtering and we have zero ads, we need to show the welcome screen
    return <DashboardNoAds />;
  }

  const deletedAdTitle =
    ads.find((a) => a.id === pendingDeleteId)?.meta?.name || "";
  const pendingDuplicatedAd = ads.find((a) => a.id === pendingDuplicateId);

  return (
    <>
      <div className="container pb-8 mx-auto z-10">
        <DashboardHeader
          search={searchParams}
          onSearchChanged={(change) => {
            setSearchParams((sp) => ({ ...sp, ...change }));
            next(0);
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
              onNextPage={() => next()}
              reachedEnd={reachedEnd}
              onDelete={onDeleteStart}
              onDuplicate={onDuplicate}
            />
            {isLoading && <DashboardLoading />}
          </>
        )}
      </div>
      <ConfirmDialog
        isOpen={!!pendingDeleteId}
        title="Delete project"
        message={
          <>
            Delete{" "}
            <span className="font-semibold text-white">
              &ldquo;{deletedAdTitle}&rdquo;
            </span>{" "}
            project? This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        isConfirming={!!!pendingDeleteId && isLoading}
        onConfirm={() => {
          handleDelete(pendingDeleteId!);
        }}
        onCancel={() => setPendingDeleteId(undefined)}
      />
      {pendingDuplicateId &&
        pendingDuplicatedAd &&
        pendingDuplicatedAd.meta && (
          <DuplicateAdPopup
            ad={{
              adId: pendingDuplicateId,
              meta: pendingDuplicatedAd?.meta,
            }}
            onClose={() => setPendingDuplicateId(undefined)}
          />
        )}
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
