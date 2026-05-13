"use client";

import { CreativeTemplateGallery } from "@/components/ui/CreativeTemplateGallery";
import type { CreativeTemplate } from "@/hooks/useCreativeTemplates";
import { PropsWithChildren, ReactNode, useState } from "react";

// Sample template fixtures used by the demo sections. Detached from the
// production seeds so the demo stays stable if seed copy is reworded.
const SAMPLE_TEMPLATES: CreativeTemplate[] = [
  {
    id: "demo-15s",
    title: "Optimized for 15s",
    description: "Tight single-speaker spot built for a 15-second slot.",
    category: "duration",
    systemInstructions: "...",
    defaultPacing: "fast",
    defaultDurationSeconds: 15,
    sortOrder: 10,
  },
  {
    id: "demo-30s",
    title: "Optimized for 30s",
    description: "Two-speaker spot with a full narrative arc.",
    category: "duration",
    systemInstructions: "...",
    defaultPacing: "normal",
    defaultDurationSeconds: 30,
    sortOrder: 20,
  },
  {
    id: "demo-genz",
    title: "Gen Z Oriented",
    description: "Informal, fast-paced delivery for a younger audience.",
    category: "audience",
    systemInstructions: "...",
    defaultPacing: "fast",
    sortOrder: 30,
  },
  {
    id: "demo-story",
    title: "Storytelling / Narrative",
    description: "Cinematic mini-story with tension and resolution.",
    category: "experience",
    systemInstructions: "...",
    sortOrder: 40,
  },
  {
    id: "demo-immersive",
    title: "Immersive Experience",
    description: "Sound-design-led spot with sparse voice.",
    category: "experience",
    systemInstructions: "...",
    sortOrder: 50,
  },
  {
    id: "demo-product",
    title: "Product Feature Focus",
    description: "Clear, benefit-first spot that demonstrates the product.",
    category: "general",
    systemInstructions: "...",
    sortOrder: 60,
  },
  {
    id: "demo-luxury",
    title: "Premium / Luxury",
    description: "Slow, deliberate, atmospheric — for high-end brands.",
    category: "audience",
    systemInstructions: "...",
    sortOrder: 70,
  },
  {
    id: "demo-urgent",
    title: "Limited-time offer",
    description: "Urgency-led, fast-paced, hook on the deadline.",
    category: "general",
    systemInstructions: "...",
    defaultPacing: "fast",
    sortOrder: 80,
  },
];

/** Demo page that showcases the {@link CreativeTemplateGallery} in its three primary states: empty, compact (≤ 5 items), and many (> 5 with search). */
export default function CreativeTemplatesDemoPage() {
  return (
    <div className="relative max-w-5xl mx-auto">
      <section className="relative pt-12 pb-10">
        <Kicker>Brief panel</Kicker>
        <HeroTitle>Creative template gallery</HeroTitle>
        <HeroDescription>
          Card grid for picking an admin-managed creative template inside the
          brief panel. The gallery hides itself when the list is empty, caps
          the visible tiles at 5, and surfaces a search input when there are
          more templates to discover.
        </HeroDescription>
      </section>

      <ComponentSection
        title="Empty list"
        description="When no templates are available the gallery renders nothing — the brief flow still works without it."
      >
        <EmptyState />
      </ComponentSection>

      <ComponentSection
        title="Compact (≤ 5 templates)"
        description="No search bar, no Show-more tile. Cards lay out on two rows on the 3-column desktop grid."
      >
        <CompactState />
      </ComponentSection>

      <ComponentSection
        title="Many (> 5 templates)"
        description="The first 5 templates render alongside a dashed Show-more tile in the 6th slot. The search bar above filters across the full list (matches title, description, and category)."
      >
        <ManyState />
      </ComponentSection>
    </div>
  );
}

/** Empty-list demo — passes `[]` so the gallery returns `null`. We wrap it
 *  in a placeholder so the section doesn't look broken. */
function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm text-gray-400">
      <CreativeTemplateGallery value={null} onChange={() => {}} templates={[]} />
      Gallery returned <code className="text-wb-blue">null</code> — nothing
      rendered above this line.
    </div>
  );
}

/** Compact demo — exactly 5 templates so the search bar and Show-more tile both stay hidden. */
function CompactState() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <CreativeTemplateGallery
      value={value}
      onChange={setValue}
      templates={SAMPLE_TEMPLATES.slice(0, 5)}
    />
  );
}

/** Many-items demo — full sample list so the gallery activates the search input and the Show-more tile. */
function ManyState() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <CreativeTemplateGallery
      value={value}
      onChange={setValue}
      templates={SAMPLE_TEMPLATES}
    />
  );
}

/** Oversized hero heading with a subtle white-to-translucent gradient fill. */
function HeroTitle({ children }: PropsWithChildren) {
  return (
    <h1 className="mt-3 text-5xl md:text-6xl font-bold tracking-tight bg-linear-to-br from-white via-white to-white/60 bg-clip-text text-transparent">
      {children}
    </h1>
  );
}

/** Muted paragraph that sits directly under {@link HeroTitle}. */
function HeroDescription({ children }: PropsWithChildren) {
  return <p className="mt-4 max-w-2xl text-lg text-gray-400">{children}</p>;
}

/** Brand-colored eyebrow rendered above {@link HeroTitle}. */
function Kicker({ children }: PropsWithChildren) {
  return (
    <div className="text-xs uppercase tracking-widest text-wb-blue">
      {children}
    </div>
  );
}

/** Top-level section dedicated to a single component state. Mirrors the
 *  modals demo so the two pages feel like one document. */
function ComponentSection({
  title,
  description,
  children,
}: PropsWithChildren<{ title: ReactNode; description: ReactNode }>) {
  return (
    <section className="relative pb-16 pt-10 border-t border-white/10">
      <h2 className="text-3xl font-bold text-white mb-2">{title}</h2>
      <p className="text-sm text-gray-400 mb-8 max-w-2xl">{description}</p>
      {children}
    </section>
  );
}
