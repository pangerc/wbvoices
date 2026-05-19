"use client";

import { useBackgroundAnimator } from "@/components/animated-background/animated-background";
import { useAuth } from "@/components/AuthProvider";
import { Header } from "@/components/Header/Header";
import { Ad } from "@/components/HistoryDrawer";
import { ProjectCard } from "@/components/ui";
import { Button } from "@/components/ui/buttons";
import { useQuery } from "@/hooks/query";
import { Language } from "@/types";
import { getLanguageName } from "@/utils/language";
import { generateProjectId } from "@/utils/projectId";
import { PlusIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { useState } from "react";

const DEFAULT_AD_PAGE = 8;

export default function HomePage() {
  useBackgroundAnimator(false);

  const [end, setEnd] = useState(false);
  const [skip, setSkip] = useState(0);
  const [search, setSearch] = useState("");
  const [client, setClient] = useState();
  const [market, setmarket] = useState();
  const [language, setLanguage] = useState<Language>();

  const { data: ads } = useQuery(
    "append",
    async ([skip, search, client, market, language], signal) => {
      const url = new URL(`${window.location.href}/api/ads`);

      url.searchParams.set("skip", skip.toString());
      url.searchParams.set("take", DEFAULT_AD_PAGE.toString());

      if (search.length > 0) {
        url.searchParams.set("name", search);
      }

      if (client) {
        url.searchParams.set("client", client);
      }

      if (market) {
        url.searchParams.set("market", market);
      }

      if (language) {
        url.searchParams.set("language", language);
      }

      const response = await fetch(url, { signal });

      if (response.ok) {
        const data = await response.json();

        const ads = data.ads as Ad[];

        if (ads.length < DEFAULT_AD_PAGE) {
          setEnd(true);
        }

        return ads;
      } else {
        const errorData = await response.json();
        return new Error("Failed to load projects", { cause: errorData });
      }
    },
    [skip, search, client, market, language] as const,
  );

  const { isAdmin } = useAuth();
  const router = useRouter();

  const title = isAdmin ? "All Projects" : "My Projects";

  const onNewAd = () => {
    const adId = generateProjectId();
    console.log(`🚀 Generated client-side adId: ${adId} (not persisted yet)`);

    router.replace(`/ad/${adId}`);
  };

  const onNextPage = () => {
    setSkip(skip + DEFAULT_AD_PAGE);
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <Header>
        <div>
          <Button icon={PlusIcon} onClick={() => onNewAd()}>
            New Project
          </Button>
        </div>
      </Header>
      <div className="container pb-4 mx-auto relative z-10">
        <div className="flex-1 h-full overflow-y-auto p-8 text-white">
          <h1 className="text-3xl font-semibold">{title}</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {!ads ? (
            <>Empty</>
          ) : ads instanceof Error ? (
            <>Error</>
          ) : (
            ads.map((ad) => (
              <ProjectCard
                key={ad.adId}
                href={`/ad/${ad.adId}`}
                title={ad.meta.name}
                customer={ad.meta.brief.brand?.name}
                market={ad.meta.brief.selectedRegion}
                language={getLanguageName(ad.meta.brief.selectedLanguage)}
                lastUpdated={new Date(ad.meta.lastModified)}
              />
            ))
          )}
        </div>

        {/* TODO: Make this a button variant */}
        {!end && (
          <div className="w-full flex justify-center py-[3.31rem]">
            <div
              onClick={onNextPage}
              className="text-wb-white-gray font-inter text-xs font-medium underline cursor-pointer"
            >
              Load more
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
