"use client";

import { GlassyListbox } from "@/components/ui/GlassyListbox";
import { PropsWithChildren, ReactNode, useState } from "react";
import { Code } from "../internal/code";

type Provider = "elevenlabs" | "lahajati" | "qwen" | "bytedance" | "openai";
type Placement = "start" | "withFirstVoice" | "afterAllVoices";
type Language = "en" | "de" | "fr" | "es" | "ar";

/** Demo page that showcases the {@link GlassyListbox} primitive — basic, labeled, flag-decorated, disabled, and loading states. All examples are controlled. */
export default function UiKitDemoGlassyListboxPage() {
  const [provider, setProvider] = useState<Provider>("elevenlabs");
  const [labeledProvider, setLabeledProvider] = useState<Provider>("openai");
  const [placement, setPlacement] = useState<Placement>("start");
  const [language, setLanguage] = useState<Language>("en");

  return (
    <div className="relative max-w-5xl mx-auto">
      <section className="relative pt-12 pb-10">
        <Kicker>Input</Kicker>
        <HeroTitle>Selects</HeroTitle>
        <HeroDescription>
          Headless UI <Code>Listbox</Code> wrapped in the project&apos;s
          frosted-glass styling — translucent button with a trailing chevron, a
          backdrop-blurred popover, and per-option highlight in{" "}
          <Code>wb-blue</Code>. Options can optionally render a leading{" "}
          <Code>flag-icons</Code> flag via the per-option <Code>flag</Code>{" "}
          string.
        </HeroDescription>
      </section>

      <ComponentSection
        title="Basic"
        description="No `label` prop — the listbox renders just the button and dropdown. Selected option's label is mirrored in the trigger; the dropdown highlights the active row in `wb-blue/30`."
      >
        <Row>
          <Field>
            <GlassyListbox<Provider>
              value={provider}
              onChange={setProvider}
              options={PROVIDER_OPTIONS}
            />
          </Field>
        </Row>
        <p className="text-sm text-gray-400">
          Current value:{" "}
          <span className="font-mono text-white">{provider}</span>
        </p>
      </ComponentSection>

      <ComponentSection
        title="With label"
        description="Pass `label` to render a white block label above the trigger. Use this when the listbox stands on its own; in form-style layouts you'll often render your own `<label>` instead."
      >
        <Row>
          <Field>
            <GlassyListbox<Provider>
              label="Voice provider"
              value={labeledProvider}
              onChange={setLabeledProvider}
              options={PROVIDER_OPTIONS}
            />
          </Field>
        </Row>
      </ComponentSection>

      <ComponentSection
        title="With flag icons"
        description="Each option may carry a `flag` ISO-2 country code (e.g. `us`, `de`, `fr`). When present, a `flag-icons` square renders both in the trigger and inside each dropdown row at `opacity-60`."
      >
        <Row>
          <Field>
            <GlassyListbox<Language>
              label="Language"
              value={language}
              onChange={setLanguage}
              options={LANGUAGE_OPTIONS}
            />
          </Field>
        </Row>
        <p className="text-sm text-gray-400">
          Current value:{" "}
          <span className="font-mono text-white">{language}</span>
        </p>
      </ComponentSection>

      <ComponentSection
        title="Long labels"
        description="Labels are truncated in the trigger via `truncate` and `capitalize`d. Long copy is fine — it'll ellipsize in the button and wrap-free inside the dropdown."
      >
        <Row>
          <Field>
            <GlassyListbox<Placement>
              label="Placement"
              value={placement}
              onChange={setPlacement}
              options={PLACEMENT_OPTIONS}
            />
          </Field>
        </Row>
      </ComponentSection>

      <ComponentSection
        title="Disabled"
        description="Pass `disabled` to lock the listbox. The Headless UI button stops responding to clicks; visual styling is unchanged so it matches the surrounding form."
      >
        <Row>
          <Field>
            <GlassyListbox<Provider>
              label="Voice provider"
              value="elevenlabs"
              onChange={() => {}}
              options={PROVIDER_OPTIONS}
              disabled
            />
          </Field>
        </Row>
      </ComponentSection>

      <ComponentSection
        title="Loading"
        description="Pass `loading` while async option data is being fetched. The trigger label is swapped for `Loading…`, the chevron becomes a spinner, and the button is locked — equivalent to `disabled` for interaction."
      >
        <Row>
          <Field>
            <GlassyListbox<Provider>
              label="Voice provider"
              value="elevenlabs"
              onChange={() => {}}
              options={PROVIDER_OPTIONS}
              loading
            />
          </Field>
        </Row>
      </ComponentSection>
    </div>
  );
}

/** Provider options used by the basic and labeled examples — covers the active integrations in this project. */
const PROVIDER_OPTIONS: { value: Provider; label: string }[] = [
  { value: "elevenlabs", label: "ElevenLabs" },
  { value: "lahajati", label: "Lahajati" },
  { value: "qwen", label: "Qwen" },
  { value: "bytedance", label: "ByteDance" },
  { value: "openai", label: "OpenAI" },
];

/** Language options demonstrating the optional per-option `flag` decoration. */
const LANGUAGE_OPTIONS: { value: Language; label: string; flag: string }[] = [
  { value: "en", label: "English", flag: "us" },
  { value: "de", label: "German", flag: "de" },
  { value: "fr", label: "French", flag: "fr" },
  { value: "es", label: "Spanish", flag: "es" },
  { value: "ar", label: "Arabic", flag: "sa" },
];

/** Placement options used to demonstrate long-label truncation in the trigger. */
const PLACEMENT_OPTIONS: { value: Placement; label: string }[] = [
  { value: "start", label: "At beginning (before all voices)" },
  { value: "withFirstVoice", label: "With first voice (overlapping)" },
  { value: "afterAllVoices", label: "After every voice has finished" },
];

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
  return <div className="flex flex-wrap items-start gap-4">{children}</div>;
}

/** Fixed-width column used to host a single listbox so widths stay consistent across sections. */
function Field({ children }: PropsWithChildren) {
  return <div className="w-80">{children}</div>;
}
