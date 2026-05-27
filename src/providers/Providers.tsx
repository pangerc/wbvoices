"use client";

import { SessionProvider } from "next-auth/react";
import { PropsWithChildren } from "react";
import { LoadingProvider } from "./Loading.provider";

export function Providers({ children }: PropsWithChildren) {
  return (
    <SessionProvider>
      <LoadingProvider>{children}</LoadingProvider>
    </SessionProvider>
  );
}
