"use client";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  GlassyModal,
  MAX_WIDTH_CLASSES,
  MaxWidth,
} from "@/components/ui/GlassyModal";
import { CheckCircleIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { PropsWithChildren, ReactNode, useState } from "react";
import { twMerge } from "tailwind-merge";

/** All supported {@link MaxWidth} values, derived from the keys of {@link MAX_WIDTH_CLASSES}, used to render the "Max widths" tile grid. */
const MAX_WIDTHS = Object.keys(MAX_WIDTH_CLASSES) as MaxWidth[];

/** A single fake release entry used to fill the scrollable demo modal. */
type ReleaseNote = {
  /** Version label shown as the entry heading (e.g., `"v0.9.0"`). */
  version: string;
  /** ISO date string shown next to the version. */
  date: string;
  /** Bullet items rendered under the entry. */
  items: string[];
};

const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "v0.9.0",
    date: "2026-05-08",
    items: [
      "Mixer timeline now persists clip positions across reloads.",
      "Added Lahajati as a voice provider for Modern Standard Arabic.",
      "Improved pronunciation rule fallback when a phoneme is unknown.",
      "Tweaked the auto-generated music brief to bias shorter intros.",
    ],
  },
  {
    version: "v0.8.2",
    date: "2026-04-22",
    items: [
      "Fixed a race where the final mix could be uploaded before SFX finished generating.",
      "Vercel Blob uploads now retry with exponential backoff on 5xx.",
      "Redis ad versions are pruned to the last 20 entries per ad.",
    ],
  },
  {
    version: "v0.8.1",
    date: "2026-04-10",
    items: [
      "Added duplicate-ad backend support, including version snapshot copy.",
      "Voice picker honours whitelist scopes from Neon.",
      "Surface clearer errors when ElevenLabs rate-limits SFX generation.",
    ],
  },
  {
    version: "v0.8.0",
    date: "2026-03-28",
    items: [
      "Initial Spotify-format support: 15s, 30s, and 60s ad lengths.",
      "Murbert music generation gated behind a feature flag for QA.",
      "Mixer preview and final mix split into separate Blob URLs.",
      "Brief input now accepts up to 2,000 characters with a live counter.",
    ],
  },
  {
    version: "v0.7.4",
    date: "2026-03-12",
    items: [
      "Qwen voice integration cleaned up for non-English locales.",
      "Default LLM bumped to the latest OpenAI model.",
      "Auto-generation flow no longer regenerates SFX when only voices change.",
    ],
  },
  {
    version: "v0.7.3",
    date: "2026-02-29",
    items: [
      "ByteDance voice provider added for Mandarin Chinese.",
      "Reduced Redis state size by ~40% by dropping legacy preview metadata.",
      "Loudly music generation honours requested BPM more strictly.",
    ],
  },
];

/** Identifier of the currently open demo modal; each value corresponds to a single `<GlassyModal>` or `<ConfirmDialog>` instance on the page. */
type DemoKey =
  | "basic"
  | "titleOnly"
  | "noHeader"
  | "rich"
  | "scrollable"
  | "confirmDefault"
  | "confirmDanger"
  | "confirmAsync"
  | MaxWidth;

/** Demo page that showcases the modal primitives — {@link GlassyModal} and {@link ConfirmDialog} — each in their own main section. */
export default function UiKitDemoModalPage() {
  const [openDemo, setOpenDemo] = useState<DemoKey | null>(null);
  const close = () => setOpenDemo(null);

  const [isAsyncConfirming, setIsAsyncConfirming] = useState(false);
  const handleAsyncConfirm = async () => {
    setIsAsyncConfirming(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsAsyncConfirming(false);
    close();
  };

  return (
    <div className="relative max-w-5xl mx-auto">
      <section className="relative pt-12 pb-10">
        <Kicker>Overlay</Kicker>
        <HeroTitle>Modals</HeroTitle>
        <HeroDescription>
          Frosted-glass overlays used for focused tasks, confirmations, and
          short forms. Two pieces are wired up: the{" "}
          <code className="text-wb-blue">GlassyModal</code> primitive and the
          higher-level <code className="text-wb-blue">ConfirmDialog</code> built
          on top of it.
        </HeroDescription>
      </section>

      <ComponentSection
        title="GlassyModal"
        description="The base dialog primitive. Frosted-glass panel with an animated backdrop, optional title/description (or fully custom ReactNode) header, and a built-in close button."
      >
        <div className="pb-12">
          <SectionHeading>Variants</SectionHeading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DemoTile
              title="Title + description"
              description="The default header layout with a heading and supporting copy."
              onClick={() => setOpenDemo("basic")}
            />
            <DemoTile
              title="Title only"
              description="Header collapses gracefully when description is omitted."
              onClick={() => setOpenDemo("titleOnly")}
            />
            <DemoTile
              title="Custom header"
              description="Pass a ReactNode via the header prop for fully custom header layouts."
              onClick={() => setOpenDemo("noHeader")}
            />
            <DemoTile
              title="Rich content"
              description="Inputs, lists, and actions composed inside the panel."
              onClick={() => setOpenDemo("rich")}
            />
            <DemoTile
              title="Scrollable content"
              description="Long bodies overflow the viewport — the overlay scrolls while the backdrop stays fixed."
              onClick={() => setOpenDemo("scrollable")}
            />
          </div>
        </div>

        <div>
          <SectionHeading>Max widths</SectionHeading>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {MAX_WIDTHS.map((width) => (
              <WidthTile
                key={width}
                width={width}
                onClick={() => setOpenDemo(width)}
              />
            ))}
          </div>
        </div>
      </ComponentSection>

      <ComponentSection
        title="ConfirmDialog"
        description="A small, focused dialog for yes/no confirmations. Replaces window.confirm() with something that fits the rest of the UI."
      >
        <p className="mb-8 text-sm text-gray-400">
          Higher-order abstraction on top of{" "}
          <code className="text-wb-blue">GlassyModal</code> — pre-bakes the
          title, message, cancel/confirm buttons, and an in-flight state.
        </p>

        <SectionHeading>Variants</SectionHeading>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DemoTile
            title="Default"
            description="Neutral confirmation for non-destructive actions like saving changes."
            onClick={() => setOpenDemo("confirmDefault")}
          />
          <DemoTile
            title="Danger"
            description="Red confirm button for irreversible actions like deleting an ad."
            onClick={() => setOpenDemo("confirmDanger")}
          />
          <DemoTile
            title="Async (in-flight)"
            description="Confirm runs an awaited callback — buttons disable and the label flips to Working…"
            onClick={() => setOpenDemo("confirmAsync")}
          />
        </div>
      </ComponentSection>

      <GlassyModal
        isOpen={openDemo === "basic"}
        onClose={close}
        title="Generate a new ad"
        description="We'll spin up a fresh draft using your brief."
      >
        <p className="text-sm text-gray-300">
          The default modal exposes a title, a description, and a close button
          in the top-right. Children render below the header with a small top
          margin.
        </p>
        <PrimaryActionRow onClose={close} confirmLabel="Got it" />
      </GlassyModal>

      <GlassyModal
        isOpen={openDemo === "titleOnly"}
        onClose={close}
        title="Title only"
      >
        <p className="text-sm text-gray-300">
          When <code className="text-wb-blue">description</code> is omitted, the
          header tightens around the title.
        </p>
      </GlassyModal>

      <GlassyModal
        isOpen={openDemo === "noHeader"}
        onClose={close}
        header={
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-wb-blue/20 p-2 border border-wb-blue/40">
              <SparklesIcon className="w-5 h-5 text-wb-blue" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Custom header
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                Pass a ReactNode via the{" "}
                <code className="text-wb-blue">header</code> prop for fully
                custom header layouts — the close button still appears in the
                corner.
              </p>
            </div>
          </div>
        }
      >
        <p className="text-sm text-gray-300">
          Body content lives below the custom header, just like the
          title/description variant.
        </p>
      </GlassyModal>

      <GlassyModal
        isOpen={openDemo === "rich"}
        onClose={close}
        title="Voice configuration"
        description="Tune the voice used for this ad's voiceover."
      >
        <div className="space-y-4">
          <Field label="Voice name">
            <input
              type="text"
              defaultValue="Layla — Modern Standard Arabic"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-wb-blue focus:outline-none"
            />
          </Field>
          <Field label="Style">
            <select className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-wb-blue focus:outline-none">
              <option className="bg-black">Conversational</option>
              <option className="bg-black">Energetic</option>
              <option className="bg-black">Authoritative</option>
            </select>
          </Field>
          <Field label="Notes">
            <textarea
              rows={3}
              defaultValue="Slow down on the brand name. Warm tone throughout."
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-wb-blue focus:outline-none"
            />
          </Field>
        </div>
        <PrimaryActionRow onClose={close} confirmLabel="Save voice" />
      </GlassyModal>

      <GlassyModal
        isOpen={openDemo === "scrollable"}
        onClose={close}
        title="Release notes"
        description="A taste of what scrolling looks like inside the overlay."
      >
        <div className="space-y-6">
          {RELEASE_NOTES.map((entry) => (
            <article key={entry.version}>
              <header className="flex items-baseline justify-between border-b border-white/10 pb-2 mb-3">
                <h4 className="text-base font-semibold text-white">
                  {entry.version}
                </h4>
                <span className="text-xs font-mono text-gray-500">
                  {entry.date}
                </span>
              </header>
              <ul className="space-y-2">
                {entry.items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-300">
                    <span className="text-wb-blue">—</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <PrimaryActionRow onClose={close} confirmLabel="Mark as read" />
      </GlassyModal>

      <ConfirmDialog
        isOpen={openDemo === "confirmDefault"}
        title="Save changes?"
        message="Your edits to the script and voice configuration will be persisted to this ad's latest version."
        confirmLabel="Save"
        onConfirm={close}
        onCancel={close}
      />

      <ConfirmDialog
        isOpen={openDemo === "confirmDanger"}
        title="Delete this ad?"
        message={
          <>
            This action is permanent. The mix, script, and generated assets will
            be removed and{" "}
            <strong className="text-white">cannot be recovered</strong>.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={close}
        onCancel={close}
      />

      <ConfirmDialog
        isOpen={openDemo === "confirmAsync"}
        title="Regenerate the mix?"
        message="We'll re-run music + SFX generation and rebuild the final mix. This usually takes 10–20 seconds."
        confirmLabel="Regenerate"
        isConfirming={isAsyncConfirming}
        onConfirm={handleAsyncConfirm}
        onCancel={close}
      />

      {MAX_WIDTHS.map((width) => (
        <GlassyModal
          key={width}
          isOpen={openDemo === width}
          onClose={close}
          title={`maxWidth="${width}"`}
          description="Resize the window to see how the panel reflows within this cap."
          maxWidth={width}
        >
          <p className="text-sm text-gray-300">
            The panel grows up to{" "}
            <code className="text-wb-blue">max-w-{width}</code> and stays
            centered inside the viewport.
          </p>
        </GlassyModal>
      ))}
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

/** Small, uppercased eyebrow-style heading used to label sections within the page. */
function SectionHeading({ children }: PropsWithChildren) {
  return (
    <h2 className="text-sm uppercase tracking-widest text-gray-500 mb-4">
      {children}
    </h2>
  );
}

/** Props for {@link ComponentSection}: a top-level component section with a large heading, a supporting paragraph, and arbitrary children rendered beneath. */
type ComponentSectionProps = PropsWithChildren<{
  /** Large heading shown at the top of the section (e.g., a component name). */
  title: ReactNode;
  /** Supporting paragraph rendered under the title to summarize the component. */
  description: ReactNode;
}>;

/** Top-level page section dedicated to a single component. Separated from the previous section by a top border so the two components are visually distinct. */
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

/** Brand-colored category label rendered above {@link HeroTitle} (e.g., "Overlay"). */
function Kicker({ children }: PropsWithChildren) {
  return (
    <div className="text-xs uppercase tracking-widest text-wb-blue">
      {children}
    </div>
  );
}

/** Props for {@link DemoTile}: the textual content and the click handler that opens the corresponding modal. */
type DemoTileProps = {
  /** Heading shown at the top of the tile. */
  title: ReactNode;
  /** Short supporting copy rendered beneath the title. */
  description: ReactNode;
  /** Invoked when the user clicks the tile — typically opens the matching modal variant. */
  onClick: () => void;
};

/** Clickable card in the "Variants" grid; each tile previews one configuration of {@link GlassyModal}. */
function DemoTile({ title, description, onClick }: DemoTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 backdrop-blur-sm p-5 transition-all"
    >
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-gray-400">{description}</p>
    </button>
  );
}

/** Props for {@link WidthTile}: the {@link MaxWidth} value to label the tile with and the click handler. */
type WidthTileProps = {
  /** The {@link MaxWidth} this tile represents; rendered as its own label. */
  width: MaxWidth;
  /** Invoked when the user clicks the tile — opens the corresponding `maxWidth` modal. */
  onClick: () => void;
};

/** Compact button in the "Max widths" grid; opens a modal sized to {@link WidthTileProps.width}. */
function WidthTile({ width, onClick }: WidthTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-3 text-sm font-mono text-gray-300 hover:text-white transition-all"
    >
      {width}
    </button>
  );
}

/** Props for {@link Field}: a small uppercased label rendered above the wrapped form control. */
type FieldProps = PropsWithChildren<{
  /** Label text shown above the input. */
  label: ReactNode;
}>;

/** Labelled wrapper for a single form control inside a modal. */
function Field({ label, children }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-widest text-gray-500 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Shared props for the action buttons in this page ({@link PrimaryButton}, {@link SecondaryButton}). */
type ButtonProps = PropsWithChildren<{
  /** Invoked when the button is clicked. */
  onClick: () => void;
  /** Extra Tailwind utilities merged onto the button via `twMerge`. */
  className?: string;
}>;

/** Affirmative call-to-action button used to confirm the primary action of a modal. */
function PrimaryButton({ onClick, children, className }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={twMerge(
        "inline-flex items-center gap-2 rounded-lg bg-wb-blue px-4 py-2 text-sm font-semibold text-white hover:bg-wb-blue/80 transition-colors",
        className,
      )}
    >
      <CheckCircleIcon className="w-4 h-4" />
      {children}
    </button>
  );
}

/** Neutral button typically used for "Cancel" or other non-committing actions inside a modal. */
function SecondaryButton({ onClick, children, className }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={twMerge(
        "rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-white/10 transition-colors",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Props for {@link PrimaryActionRow}: the close handler and the label of the primary action. */
type PrimaryActionRowProps = {
  /** Invoked by both the Cancel and the primary button to dismiss the modal. */
  onClose: () => void;
  /** Label of the right-side primary action button. */
  confirmLabel: ReactNode;
};

/** Right-aligned `Cancel` + primary-action button pair used at the bottom of demo modals. */
function PrimaryActionRow({ onClose, confirmLabel }: PrimaryActionRowProps) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
      <PrimaryButton onClick={onClose}>{confirmLabel}</PrimaryButton>
    </div>
  );
}
