import { PropsWithChildren } from "react";

/** Inline-code chip used inside prose to highlight prop names, class tokens, library names, and similar literals. */
export function Code({ children }: PropsWithChildren) {
  return (
    <span className="inline items-center rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-xs text-wb-blue">
      {children}
    </span>
  );
}
