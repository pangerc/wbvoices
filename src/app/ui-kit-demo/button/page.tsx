"use client";

import {
  AccordionPlayButton,
  Button,
  GenerateButton,
  PlayButton,
  ResetButton,
  VolumeToggleButton,
} from "@/components/ui/buttons";
import {
  ArrowRightIcon,
  PlayIcon,
  PlusIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { PropsWithChildren, ReactNode, useState } from "react";
import { Code } from "../internal/code";

/** Demo page that showcases every button in `src/components/ui/buttons` — variants, states, and prop permutations. */
export default function UiKitDemoButtonPage() {
  return (
    <div className="relative max-w-5xl mx-auto">
      <section className="relative pt-12 pb-10">
        <Kicker>Action</Kicker>
        <HeroTitle>Buttons</HeroTitle>
        <HeroDescription>
          Every member of the buttons family — from the generic{" "}
          <Code>Button</Code> primitive down to the one-purpose buttons wired
          into specific flows. All live under{" "}
          <Code>@/components/ui/buttons</Code>.
        </HeroDescription>
      </section>

      <ComponentSection
        title="Button — blue"
        description="Primary filled call-to-action in the `wb-blue-bright` (#0080FF) design token. Padding is fixed at `1.72rem`/`0.81rem`, gap at `0.625rem`. Label-only or with a leading Heroicons icon."
      >
        <Row>
          <Button variant="blue">Generate</Button>
          <Button variant="blue" icon={SparklesIcon}>
            Generate
          </Button>
          <Button variant="blue" icon={PlayIcon}>
            Play preview
          </Button>
          <Button variant="blue" icon={PlusIcon}>
            New project
          </Button>
        </Row>
        <Row>
          <Button variant="blue" disabled>
            Disabled
          </Button>
          <Button variant="blue" icon={ArrowRightIcon} disabled>
            Disabled with icon
          </Button>
        </Row>
      </ComponentSection>

      <ComponentSection
        title="Button — destructive"
        description="Primary filled call-to-action in the `wb-blue-bright` (#0080FF) design token. Padding is fixed at `1.72rem`/`0.81rem`, gap at `0.625rem`. Label-only or with a leading Heroicons icon."
      >
        <Row>
          <Button variant="destructive">Generate</Button>
          <Button variant="destructive" icon={SparklesIcon}>
            Generate
          </Button>
          <Button variant="destructive" icon={PlayIcon}>
            Play preview
          </Button>
          <Button variant="destructive" icon={PlusIcon}>
            New project
          </Button>
        </Row>
        <Row>
          <Button variant="destructive" disabled>
            Disabled
          </Button>
          <Button variant="destructive" icon={ArrowRightIcon} disabled>
            Disabled with icon
          </Button>
        </Row>
      </ComponentSection>

      <ComponentSection
        title="Button — ghost"
        description="Text-only affordance — no background, no border. Hover and active states come from translucent white overlays. Pair next to a `blue` Button as a secondary action."
      >
        <Row>
          <Button variant="ghost">Cancel</Button>
          <Button variant="ghost" icon={ArrowRightIcon}>
            Continue
          </Button>
          <Button variant="ghost" icon={PlayIcon}>
            Preview
          </Button>
        </Row>
        <Row>
          <Button variant="ghost" disabled>
            Disabled
          </Button>
          <Button variant="ghost" icon={ArrowRightIcon} disabled>
            Disabled with icon
          </Button>
        </Row>
        <Row>
          <Button variant="ghost">Cancel</Button>
          <Button variant="blue" icon={SparklesIcon}>
            Generate ad
          </Button>
        </Row>
      </ComponentSection>

      <ComponentSection
        title="GenerateButton"
        description="Bespoke glassy CTA wired into the brief flow. Takes its own label and generating-label strings."
      >
        <GenerateButtonDemo />
      </ComponentSection>

      <ComponentSection
        title="PlayButton"
        description="Pill-shaped play/stop control with a red-tinted playing state. Used in mixer panels and previews."
      >
        <PlayButtonDemo />
      </ComponentSection>

      <ComponentSection
        title="AccordionPlayButton"
        description="Smart play/stop button driven by the `useDraftAccordionState(type, versionId)` hook. Renders idle, generating, and playing states from the audio playback store. The demo passes a synthetic `versionId` so the hook resolves to the idle state."
      >
        <Row>
          <AccordionPlayButton
            type="voice"
            versionId="ui-kit-demo-voice"
            onClick={() => undefined}
          />
          <AccordionPlayButton
            type="music"
            versionId="ui-kit-demo-music"
            onClick={() => undefined}
          />
          <AccordionPlayButton
            type="sfx"
            versionId="ui-kit-demo-sfx"
            onClick={() => undefined}
          />
          <AccordionPlayButton
            type="voice"
            versionId="ui-kit-demo-disabled"
            onClick={() => undefined}
            disabled
          />
        </Row>
      </ComponentSection>

      <ComponentSection
        title="VolumeToggleButton"
        description="Tiny pill toggle used by the mixer's track strip to mute/unmute. Swaps between speaker and crossed-speaker SVGs based on the `isOpen` prop."
      >
        <VolumeToggleButtonDemo />
      </ComponentSection>

      <ComponentSection
        title="ResetButton"
        description="Red-outlined Reset action with a refresh-arrows glyph. The component is currently shipped with a `hidden` class baked into its className — it renders invisibly until that class is removed in the source. Listed here for completeness."
      >
        <Row>
          <ResetButton onClick={() => undefined} />
          <span className="text-xs text-gray-500">
            ↑ ResetButton renders here but is hidden via the component's own
            class.
          </span>
        </Row>
      </ComponentSection>
    </div>
  );
}

/** Interactive demo wrapper for {@link GenerateButton}: a toggle drives the `isGenerating` state so the label swap is visible. */
function GenerateButtonDemo() {
  const [isGenerating, setIsGenerating] = useState(false);
  return (
    <Row>
      <GenerateButton
        onClick={() => setIsGenerating((v) => !v)}
        disabled={false}
        isGenerating={isGenerating}
        text="Generate"
        generatingText="Generating…"
      />
      <GenerateButton
        onClick={() => undefined}
        disabled
        isGenerating={false}
        text="Generate"
        generatingText="Generating…"
      />
      <span className="text-xs text-gray-500">
        Click the first button to toggle generating state.
      </span>
    </Row>
  );
}

/** Interactive demo wrapper for {@link PlayButton}: state held locally so the play/stop swap is visible. */
function PlayButtonDemo() {
  const [isPlaying, setIsPlaying] = useState(false);
  return (
    <Row>
      <PlayButton
        isPlaying={isPlaying}
        onClick={() => setIsPlaying((v) => !v)}
      />
      <PlayButton isPlaying={false} onClick={() => undefined} disabled />
      <PlayButton isPlaying onClick={() => undefined} disabled />
    </Row>
  );
}

/** Interactive demo wrapper for {@link VolumeToggleButton}: state held locally so the icon swap is visible. */
function VolumeToggleButtonDemo() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Row>
      <VolumeToggleButton
        isOpen={isOpen}
        onClick={() => setIsOpen((v) => !v)}
      />
    </Row>
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

/** Props for {@link ComponentSection}: a section dedicated to one button or variant, with a heading and supporting paragraph. */
type ComponentSectionProps = PropsWithChildren<{
  /** Large heading shown at the top of the section. */
  title: ReactNode;
  /** Supporting paragraph rendered under the title. */
  description: ReactNode;
}>;

/** Top-level page section dedicated to a single button or variant. Separated by a top border. */
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
