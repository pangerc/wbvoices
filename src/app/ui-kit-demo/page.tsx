import { ArrowRightIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { PropsWithChildren, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

/** Landing page for the UI Kit demo — hero, brand color swatches, and a grid of available demos. */
export default function UiKitDemoPage() {
  return (
    <div className="relative max-w-5xl mx-auto">
      <BackgroundOrbs />

      <section className="relative pt-12 pb-16">
        <div className="flex flex-wrap gap-2">
          <VersionBadge color="green">internal</VersionBadge>
          <VersionBadge color="blue">v1</VersionBadge>
          <VersionBadge color="red" pulse>
            work in progress
          </VersionBadge>
        </div>
        <HeroTitle>UI Kit Demo</HeroTitle>
        <HeroDescription>
          A live playground for the components, patterns, and primitives that
          power Aleph Creative Audio. Browse, poke, and copy.
        </HeroDescription>
      </section>

      <section className="relative pb-12">
        <SectionHeading>Brand colors</SectionHeading>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ColorSwatch label="wb-blue" value="#2f7dfa" color="blue" />
          <ColorSwatch label="wb-green" value="#21dd92" color="green" />
          <ColorSwatch label="wb-red" value="#fb5d4c" color="red" />
        </div>
      </section>

      <section className="relative pb-12">
        <SectionHeading>Demos</SectionHeading>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DemoLinkCard
            href="/ui-kit-demo/modals"
            kicker="Overlay"
            title="Modals"
            description="Dialogs, drawers, and confirmation flows."
          />
          <ComingSoonCard
            title="More demos"
            description="Buttons, inputs, timeline tracks, and the rest of the kit will land here."
          />
        </div>
      </section>
    </div>
  );
}

/** Decorative cluster of blurred, brand-colored orbs that sits behind the page content. */
function BackgroundOrbs() {
  return (
    <>
      <Orb className="-top-24 -left-24 opacity-30 bg-wb-blue" />
      <Orb className="top-40 -right-24 opacity-20 bg-wb-red" />
      <Orb className="bottom-0 left-1/3 opacity-20 bg-wb-green" />
    </>
  );
}

/** Props for {@link Orb}. `className` carries position and color utilities for each instance. */
type OrbProps = {
  /** Tailwind utilities providing the orb's position (e.g., `top-40 -right-24`) and color (e.g., `bg-wb-blue`, `opacity-20`). */
  className: string;
};

/** A single blurred circular background element; positioning and color come from `className`. */
function Orb({ className }: OrbProps) {
  return (
    <div
      aria-hidden
      className={twMerge(
        "pointer-events-none absolute w-96 h-96 rounded-full blur-3xl",
        className,
      )}
    />
  );
}

/** Props for {@link VersionBadge}: text content, optional brand-colored dot, and whether that dot pulses. */
type VersionBadgeProps = PropsWithChildren<{
  /** Brand color of the leading status dot. When omitted, no dot is rendered. */
  color?: BrandColor;
  /** When true, the dot pulses to signal an unstable/live state. Requires `color`. */
  pulse?: boolean;
}>;

/** Small pill used to label the page with a version, audience, or status tag. */
function VersionBadge({ children, color, pulse }: VersionBadgeProps) {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-mono text-gray-300">
      {color && (
        <span
          className={twMerge(
            "w-1.5 h-1.5 rounded-full",
            BRAND_BG_CLASS[color],
            pulse && "animate-pulse",
          )}
        />
      )}
      {children}
    </span>
  );
}

/** Oversized hero heading with a subtle white-to-translucent gradient fill. */
function HeroTitle({ children }: PropsWithChildren) {
  return (
    <h1 className="mt-6 text-5xl md:text-6xl font-bold tracking-tight bg-linear-to-br from-white via-white to-white/60 bg-clip-text text-transparent">
      {children}
    </h1>
  );
}

/** Muted paragraph that sits directly under {@link HeroTitle} to introduce the page. */
function HeroDescription({ children }: PropsWithChildren) {
  return <p className="mt-4 max-w-2xl text-lg text-gray-400">{children}</p>;
}

/** Small, uppercased eyebrow-style heading used to label sections within the page. */
function SectionHeading({ children }: PropsWithChildren) {
  return (
    <h2 className="text-sm uppercase tracking-widest text-gray-500 mb-4">
      {children}
    </h2>
  );
}

/** One of the project's three brand colors, used to drive `bg-wb-*` Tailwind utilities. */
type BrandColor = "red" | "green" | "blue";

/** Lookup that resolves a {@link BrandColor} to its Tailwind background utility. */
const BRAND_BG_CLASS: Record<BrandColor, string> = {
  red: "bg-wb-red",
  green: "bg-wb-green",
  blue: "bg-wb-blue",
};

/** Props for {@link ColorSwatch}: a human label, its hex value, and which brand color to render. */
type ColorSwatchProps = {
  /** Human-readable name shown under the color block (e.g., `"wb-blue"`). */
  label: string;
  /** Hex value shown next to the label as a monospace caption (e.g., `"#2f7dfa"`). */
  value: string;
  /** Brand color identifier that picks which `bg-wb-*` class fills the color block. */
  color: BrandColor;
};

/** Card showing one brand color: a solid color block on top, label and hex value below. */
function ColorSwatch({ label, value, color }: ColorSwatchProps) {
  return (
    <div className="group relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
      <div className={twMerge("h-24", BRAND_BG_CLASS[color])} />
      <div className="p-4 flex items-center justify-between">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-xs text-gray-400">{value}</span>
      </div>
    </div>
  );
}

/** Props for {@link DemoLinkCard}: navigation target plus the textual content displayed in the card. */
type DemoLinkCardProps = {
  /** Route the card navigates to when clicked (passed to Next.js `<Link>`). */
  href: string;
  /** Small uppercased label rendered above the title (e.g., a category like `"Overlay"`). */
  kicker: ReactNode;
  /** Primary heading of the card. */
  title: ReactNode;
  /** Short supporting copy rendered beneath the title. */
  description: ReactNode;
};

/** Clickable card that links to a sub-demo, with a kicker label, title, description, and trailing arrow. */
function DemoLinkCard({ href, kicker, title, description }: DemoLinkCardProps) {
  return (
    <Link
      href={href}
      className="group relative rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 backdrop-blur-sm p-6 transition-all"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-wb-blue mb-2">
            {kicker}
          </div>
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="mt-2 text-sm text-gray-400">{description}</p>
        </div>
        <ArrowRightIcon className="w-5 h-5 text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all" />
      </div>
    </Link>
  );
}

/** Props for {@link ComingSoonCard}: the title and supporting copy shown in the placeholder tile. */
type ComingSoonCardProps = {
  /** Heading of the placeholder card (e.g., `"More demos"`). */
  title: ReactNode;
  /** Short copy describing what will eventually live here. */
  description: ReactNode;
};

/** Dashed-border placeholder card used to advertise demos that aren't built yet. */
function ComingSoonCard({ title, description }: ComingSoonCardProps) {
  return (
    <div className="relative rounded-2xl border border-dashed border-white/10 bg-white/2 p-6">
      <div className="text-xs uppercase tracking-widest text-gray-600 mb-2">
        Coming soon
      </div>
      <h3 className="text-xl font-semibold text-gray-400">{title}</h3>
      <p className="mt-2 text-sm text-gray-500">{description}</p>
    </div>
  );
}
