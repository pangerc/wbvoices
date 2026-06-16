import { FuzzyQueryResult } from "@/database/base";
import { AdMetadata } from "@/types/versions";
import { getLanguageName } from "@/utils/language";
import { ProjectCard } from "../ui/cards/ProjectCard";

type DashboardProjectsProps = {
  ads: FuzzyQueryResult<AdMetadata>[];
  onNextPage: () => void;
  reachedEnd: boolean;
  isLoading: boolean;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
};

export function DashboardProjects({
  ads,
  onNextPage,
  reachedEnd,
  isLoading,
  onDelete,
  onDuplicate,
}: DashboardProjectsProps) {
  return (
    <>
      <div className="flex-1 overflow-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {!ads ? (
          <>Empty</>
        ) : ads instanceof Error ? (
          <>Error</>
        ) : (
          ads.map((ad) => (
            <ProjectCard
              key={ad.id}
              href={`/ad/${ad.id}`}
              title={ad.meta?.name}
              titleHighlights={ad.fuzzy?.indexes}
              customer={ad.meta?.brief.brand?.name}
              market={ad.meta?.brief.selectedRegion}
              language={
                ad.meta?.brief.selectedLanguage
                  ? getLanguageName(ad.meta?.brief.selectedLanguage)
                  : undefined
              }
              lastUpdated={
                ad.meta?.lastModified
                  ? new Date(ad.meta?.lastModified)
                  : undefined
              }
              onDelete={() => onDelete(ad.id)}
              onDuplicate={() => onDuplicate(ad.id)}
            />
          ))
        )}
      </div>
      {/* TODO: Make this a button variant */}
      {!isLoading && !reachedEnd && (
        <div className="w-full flex justify-center py-[3.31rem]">
          <div
            onClick={onNextPage}
            className="text-wb-white-gray font-inter text-xs font-medium underline cursor-pointer"
          >
            Load more
          </div>
        </div>
      )}
    </>
  );
}
