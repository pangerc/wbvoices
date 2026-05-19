"use client";

import { SearchInput } from "@/components/ui/inputs";
import { PropsWithChildren, ReactNode, useState } from "react";

/** Demo page that showcases the {@link SearchInput} primitive — empty, populated (clear button visible), and disabled states. All examples are controlled. */
export default function UiKitDemoSearchInputPage() {
  const [projectsQuery, setProjectsQuery] = useState("");
  const [voicesQuery, setVoicesQuery] = useState("");
  const [templatesQuery, setTemplatesQuery] = useState("Energetic");

  return (
    <div className="relative max-w-5xl mx-auto">
      <section className="relative pt-12 pb-10">
        <Kicker>Input</Kicker>
        <HeroTitle>Search input</HeroTitle>
        <HeroDescription>
          Fixed `27.5625rem` × `3.375rem` controlled search field. Leading
          magnifying glass icon, a vertical `wb-gray` divider, a native
          `&lt;input type=&quot;search&quot;&gt;`, and a trailing clear button
          that appears when `value` is non-empty.
        </HeroDescription>
      </section>

      <ComponentSection
        title="Empty"
        description="Placeholder describes what's being searched. No clear button while `value` is empty."
      >
        <Row>
          <SearchInput
            placeholder="Search projects"
            value={projectsQuery}
            onChange={(event) => setProjectsQuery(event.target.value)}
          />
        </Row>
        <Row>
          <SearchInput
            placeholder="Search voices"
            value={voicesQuery}
            onChange={(event) => setVoicesQuery(event.target.value)}
          />
        </Row>
      </ComponentSection>

      <ComponentSection
        title="Populated"
        description="When `value` is non-empty, the trailing white X button appears. Click it to clear — `onChange` fires with the empty value. The current value is mirrored below."
      >
        <Row>
          <SearchInput
            placeholder="Search creative templates"
            value={templatesQuery}
            onChange={(event) => setTemplatesQuery(event.target.value)}
          />
        </Row>
        <p className="text-sm text-gray-400">
          Current value:{" "}
          <span className="font-mono text-white">
            {templatesQuery.length === 0 ? "(empty)" : templatesQuery}
          </span>
        </p>
      </ComponentSection>

      <ComponentSection
        title="Disabled"
        description="Standard native disabled state — pointer events off, dimmed. The clear button is suppressed regardless of value."
      >
        <Row>
          <SearchInput
            placeholder="Search projects"
            value=""
            onChange={() => {}}
            disabled
          />
        </Row>
        <Row>
          <SearchInput
            placeholder="Search projects"
            value="Read-only query"
            onChange={() => {}}
            disabled
          />
        </Row>
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

/** Brand-colored category label rendered above {@link HeroTitle}. */
function Kicker({ children }: PropsWithChildren) {
  return (
    <div className="text-xs uppercase tracking-widest text-wb-blue">
      {children}
    </div>
  );
}

/** Props for {@link ComponentSection}: a section dedicated to a single variant or grouping, with a heading and supporting paragraph. */
type ComponentSectionProps = PropsWithChildren<{
  /** Large heading shown at the top of the section. */
  title: ReactNode;
  /** Supporting paragraph rendered under the title. */
  description: ReactNode;
}>;

/** Top-level page section dedicated to one variant or pairing of the component. Separated by a top border. */
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
