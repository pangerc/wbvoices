"use client";

import { Card, ProjectCard } from "@/components/ui/cards";
import { PropsWithChildren, ReactNode } from "react";
import { Code } from "../internal/code";

/** Demo page that showcases the {@link Card} primitive and the {@link ProjectCard} composed on top of it. */
export default function UiKitDemoCardPage() {
  return (
    <div className="relative max-w-5xl mx-auto">
      <section className="relative pt-12 pb-10">
        <Kicker>Surface</Kicker>
        <HeroTitle>Cards</HeroTitle>
        <HeroDescription>
          The rounded almost-black surface primitive and the project tile that
          builds on top of it.
        </HeroDescription>
      </section>

      <ComponentSection
        title="Card"
        description="The base surface — rounded, dark fill, light gray border. No padding by default; bring your own via className."
      >
        <Card className="p-6">
          <p className="text-sm text-gray-300">
            Cards are unopinionated containers. Drop any content inside and
            apply padding, layout, or hover styles via <Code>className</Code>.
          </p>
        </Card>
      </ComponentSection>

      <ComponentSection
        title="ProjectCard"
        description="Dashboard tile for a single project. Title and customer up top; market, language, and a last-updated caption at the bottom, with an arrow affordance in the corner."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProjectCard
            href="#"
            title="Spotify Ramadan 2026"
            customer="Spotify"
            market="Saudi Arabia"
            language="Modern Standard Arabic"
            lastUpdated={new Date(Date.now() - 1000 * 60 * 60 * 2)}
            onDelete={() => {}}
            onDuplicate={() => {}}
          />
          <ProjectCard
            href="#"
            title="Daily Drive UAE"
            customer="Spotify"
            market="United Arab Emirates"
            language="Khaleeji Arabic"
            lastUpdated={new Date(Date.now() - 1000 * 60 * 60 * 26)}
            onDelete={() => {}}
            onDuplicate={() => {}}
          />
          <ProjectCard
            href="#"
            title="Winter Sales Push"
            customer="Aramco"
            market="Saudi Arabia"
            language="Modern Standard Arabic"
            lastUpdated={new Date(Date.now() - 1000 * 60 * 60 * 24 * 45)}
            onDelete={() => {}}
            onDuplicate={() => {}}
          />
        </div>
      </ComponentSection>
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

/** Brand-colored category label rendered above {@link HeroTitle} (e.g., "Surface"). */
function Kicker({ children }: PropsWithChildren) {
  return (
    <div className="text-xs uppercase tracking-widest text-wb-blue">
      {children}
    </div>
  );
}

/** Props for {@link ComponentSection}: a top-level section with a heading, a supporting paragraph, and arbitrary children. */
type ComponentSectionProps = PropsWithChildren<{
  /** Large heading shown at the top of the section. */
  title: ReactNode;
  /** Supporting paragraph rendered under the title. */
  description: ReactNode;
}>;

/** Top-level page section dedicated to a single component. Separated by a top border. */
function ComponentSection({
  title,
  description,
  children,
}: ComponentSectionProps) {
  return (
    <section className="relative pb-16 pt-10 border-t border-white/10">
      <h2 className="text-3xl font-bold text-white mb-2">{title}</h2>
      <p className="text-sm text-gray-400 mb-8 max-w-2xl">{description}</p>
      {children}
    </section>
  );
}
