import { Tag } from "@/components/ui/tags";
import { PropsWithChildren, ReactNode } from "react";

/** Demo page that showcases the {@link Tag} primitive — label + trailing X close affordance, at the locked design-system size. */
export default function UiKitDemoTagPage() {
  return (
    <div className="relative max-w-5xl mx-auto">
      <section className="relative pt-12 pb-10">
        <Kicker>Chip</Kicker>
        <HeroTitle>Tags</HeroTitle>
        <HeroDescription>
          Fixed-size pill that displays a label with a trailing X close
          affordance. `9.1875rem` × `3.0625rem` outer size, `0.625rem` padding,
          `0.625rem` gap; the X glyph itself is `0.3125rem` square per spec.
        </HeroDescription>
      </section>

      <ComponentSection
        title="Tag"
        description="Default tag — `wb-dark-blue` fill with a 1px `wb-dark-gray-blue` border, white string label, and a trailing X. The X exposes a click handler via the `onRemove` prop; the rest of the pill is non-interactive."
      >
        <Row>
          <Tag label="Germany" />
          <Tag label="German" />
          <Tag label="Oktoberfest 2026" />
        </Row>
      </ComponentSection>

      <ComponentSection
        title="With onRemove"
        description="Wire the trailing X up by passing `onRemove`. Override the X button's accessible label via `removeLabel` when the pill alone doesn't convey what's being removed."
      >
        <Row>
          <Tag label="France" />
          <Tag label="French" removeLabel="Remove French filter" />
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
