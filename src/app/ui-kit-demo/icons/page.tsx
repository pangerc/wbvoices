"use client";

import { AiSparkleIcon } from "@/components/ui/icons/AiSparkle";
import { HeadphonesIcon } from "@/components/ui/icons/Headphones";
import { PropsWithChildren, ReactNode } from "react";
import { Code } from "../internal/code";

/** Demo page that showcases every component in `src/components/ui/icons` — bespoke vector glyphs that live outside the Heroicons set. */
export default function UiKitDemoIconsPage() {
  return (
    <div className="relative max-w-5xl mx-auto">
      <section className="relative pt-12 pb-10">
        <Kicker>Display</Kicker>
        <HeroTitle>Icons</HeroTitle>
        <HeroDescription>
          Project-specific vector glyphs that don't live in Heroicons. Each is a
          fixed-size atom rendered inline — recolor or resize at the parent if a
          variant is needed. All live under <Code>@/components/ui/icons</Code>.
        </HeroDescription>
      </section>

      <ComponentSection
        title="AiSparkleIcon"
        description="20×20 black multi-point sparkle. Marks AI-driven affordances — currently the AiCopilotLauncher pill, reusable on any 'AI did this' UI (chat reply bubbles, suggestion chips, banners). The internal SVG ships `w-[20px] h-[20px] shrink-0` so it doesn't compress inside flex parents."
      >
        <Row>
          <IconTile background="white">
            <AiSparkleIcon />
          </IconTile>
          <IconTile background="dark">
            <AiSparkleIcon />
          </IconTile>
        </Row>
      </ComponentSection>

      <ComponentSection
        title="HeadphonesIcon"
        description="16×16 white over-ear headphones glyph. Used in the project header to badge the audio-focused workspace."
      >
        <Row>
          <IconTile background="dark">
            <HeadphonesIcon />
          </IconTile>
          <IconTile background="white">
            <HeadphonesIcon />
          </IconTile>
        </Row>
      </ComponentSection>
    </div>
  );
}

/** Tile that frames a single icon on a coloured swatch so its contrast and sizing are visible. */
function IconTile({
  children,
  background,
}: PropsWithChildren<{ background: "white" | "dark" }>) {
  const bg =
    background === "white"
      ? "bg-white"
      : "bg-wb-almost-black border border-white/10";
  return (
    <div
      className={`flex items-center justify-center w-20 h-20 rounded-2xl ${bg}`}
    >
      {children}
    </div>
  );
}

/** Oversized hero heading with a subtle white-to-translucent gradient fill, used to label the page. */
function HeroTitle({ children }: PropsWithChildren) {
  return (
    <h1 className="mt-3 text-5xl md:text-6xl font-bold tracking-tight bg-linear-to-br from-white via-white to-white/60 bg-clip-text text-transparent">
      {children}
    </h1>
  );
}

/** Muted paragraph that sits directly under {@link HeroTitle} to introduce the page. */
function HeroDescription({ children }: PropsWithChildren) {
  return <p className="mt-4 max-w-2xl text-lg text-gray-400">{children}</p>;
}

/** Brand-colored category label rendered above {@link HeroTitle}. */
function Kicker({ children }: PropsWithChildren) {
  return (
    <div className="text-xs uppercase tracking-widest text-wb-blue">
      {children}
    </div>
  );
}

type ComponentSectionProps = PropsWithChildren<{
  title: ReactNode;
  description: ReactNode;
}>;

/** Top-level page section dedicated to a single icon. Separated by a top border. */
function ComponentSection({
  title,
  description,
  children,
}: ComponentSectionProps) {
  return (
    <section className="relative pb-16 pt-10 border-t border-white/10">
      <h2 className="text-3xl font-bold text-white mb-2">{title}</h2>
      <p className="text-sm text-gray-400 mb-8 max-w-2xl">{description}</p>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** Horizontal row of demo instances within a {@link ComponentSection}; wraps when the viewport is narrow. */
function Row({ children }: PropsWithChildren) {
  return <div className="flex flex-wrap items-center gap-4">{children}</div>;
}
