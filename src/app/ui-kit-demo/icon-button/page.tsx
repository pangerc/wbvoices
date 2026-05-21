"use client";

import { Button, IconButton } from "@/components/ui/buttons";
import {
  ArrowRightIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { PropsWithChildren, ReactNode } from "react";
import { Code } from "../internal/code";

/** Demo page that showcases every variant and state of the icon-only `IconButton`. */
export default function UiKitDemoIconButtonPage() {
  return (
    <div className="relative max-w-5xl mx-auto">
      <section className="relative pt-12 pb-10">
        <Kicker>Action</Kicker>
        <HeroTitle>Icon Button</HeroTitle>
        <HeroDescription>
          The square, icon-only sibling of <Code>Button</Code>. Same{" "}
          <Code>blue</Code> / <Code>ghost</Code> variants, same height — so a
          row of mixed labeled and icon-only actions stays aligned.{" "}
          <Code>aria-label</Code> is required.
        </HeroDescription>
      </section>

      <ComponentSection
        title="IconButton — blue"
        description="Primary filled affordance in the `wb-blue-bright` (#0080FF) design token. Padding is fixed at `0.81rem` on every side so the box is square and matches the height of a labeled `Button`."
      >
        <Row>
          <IconButton variant="blue" icon={PlayIcon} aria-label="Play" />
          <IconButton variant="blue" icon={PauseIcon} aria-label="Pause" />
          <IconButton variant="blue" icon={PlusIcon} aria-label="Add" />
          <IconButton
            variant="blue"
            icon={SparklesIcon}
            aria-label="Generate"
          />
          <IconButton variant="blue" icon={PencilIcon} aria-label="Edit" />
        </Row>
        <Row>
          <IconButton
            variant="blue"
            icon={ArrowRightIcon}
            aria-label="Continue"
            disabled
          />
          <IconButton
            variant="blue"
            icon={TrashIcon}
            aria-label="Delete"
            disabled
          />
        </Row>
      </ComponentSection>

      <ComponentSection
        title="IconButton — ghost"
        description="Text-only affordance — no background, no border. Hover and active come from translucent white overlays. Pair next to a `blue` IconButton or `Button` as a secondary action."
      >
        <Row>
          <IconButton variant="ghost" icon={XMarkIcon} aria-label="Close" />
          <IconButton variant="ghost" icon={PencilIcon} aria-label="Edit" />
          <IconButton variant="ghost" icon={TrashIcon} aria-label="Delete" />
          <IconButton variant="ghost" icon={PlayIcon} aria-label="Preview" />
        </Row>
        <Row>
          <IconButton
            variant="ghost"
            icon={XMarkIcon}
            aria-label="Close"
            disabled
          />
          <IconButton
            variant="ghost"
            icon={ArrowRightIcon}
            aria-label="Continue"
            disabled
          />
        </Row>
      </ComponentSection>

      <ComponentSection
        title="Alongside Button"
        description="The IconButton is sized so it lines up with a labeled `Button` in a shared row — same height, same rounding, same focus treatment. Use it for compact actions where a label would only repeat what the icon already says."
      >
        <Row>
          <Button variant="blue" icon={SparklesIcon}>
            Generate
          </Button>
          <IconButton variant="ghost" icon={XMarkIcon} aria-label="Dismiss" />
        </Row>
        <Row>
          <IconButton variant="blue" icon={PlayIcon} aria-label="Play" />
          <Button variant="ghost">Cancel</Button>
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

/** Props for {@link ComponentSection}: a section dedicated to one variant or pairing, with a heading and supporting paragraph. */
type ComponentSectionProps = PropsWithChildren<{
  /** Large heading shown at the top of the section. */
  title: ReactNode;
  /** Supporting paragraph rendered under the title. */
  description: ReactNode;
}>;

/** Top-level page section dedicated to a single variant or pairing. Separated by a top border. */
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
