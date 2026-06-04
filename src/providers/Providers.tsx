"use client";

import { SessionProvider } from "next-auth/react";
import { PropsWithChildren } from "react";
import { LoadingProvider } from "./Loading.provider";
import { PortalProvider } from "./PortalProvider";
import { QueryCacheProvider } from "./QueryCache.provider";

export function Providers({ children }: PropsWithChildren) {
  return (
    <SessionProvider>
      <QueryCacheProvider>
        <LoadingProvider>
          <PortalProvider>{children}</PortalProvider>
        </LoadingProvider>
      </QueryCacheProvider>
    </SessionProvider>
  );
}
