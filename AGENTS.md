# AGENTS.md

Coding conventions for agents working in this repo. Project context (LLM, voice providers, mixer flow, infra) lives in `CLAUDE.md` — this file is just the rules.

## Component prop types

- Always declare props as a named `type FooProps = { ... }` alias and reference it in the parameter list (`function Foo({ ... }: FooProps)`). Never inline anonymous object types like `function Foo({ x }: { x: string })`.
- JSDoc the prop type (one line summary), every individual prop (meaning, expected values, defaults), and the component function itself (what it renders).
- **`PropsWithChildren` exception**: when the component's props are exactly `PropsWithChildren` (no extra fields), use it directly — `function Foo({ children }: PropsWithChildren)`. Do **not** create a wrapper alias like `type FooProps = PropsWithChildren`.
- When the component needs `PropsWithChildren` plus additional props, the named-alias rule still applies — write `type FooProps = PropsWithChildren<{ /* …other props… */ }>`.
- When a component accepts native HTML attributes, use `& Omit<HTMLAttributes<HTMLElementName>, "children" | "className">` (or whichever fields you re-declare) so the surface is explicit.

```tsx
/** Props for {@link Card}: rounded surface with a "wb-gray" border on a "wb-almost-black" fill. */
export type CardProps = PropsWithChildren<
  {
    /** Extra Tailwind classes merged onto the base styles via `twMerge`. */
    className?: string;
  } & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">
>;
```

## Icons

- Use Heroicons (`@heroicons/react/24/outline` by default). Never use Unicode glyphs as decorative icons — no `→`, `←`, `✓`, `×`, `★`, `⌃`, `…` in JSX iconography.
- Exception: genuine _text content_ glyphs are fine — the `·` separator in `"Internal · v1"`, em-dashes in prose, math symbols, etc. The rule is about _iconography_, not all Unicode.
- If a Heroicon doesn't exist for the symbol you need, use an inline SVG, not a glyph.

## Tailwind class composition

- Compose dynamic classes with `twMerge("base classes", maybeDynamic)`. Never use template-string interpolation (`` `base ${x}` ``) for class composition — `twMerge` resolves conflicting utilities deterministically (e.g., `p-2` + `p-4` → `p-4`); interpolation does not.
- The rule is about _composition_. Plain string literals (`className="rounded-lg bg-white/5"`) with no interpolation are fine.
- Conditional classes go through `twMerge` too: `twMerge("base", isActive && "bg-blue-500")`.
- Prefer canonical Tailwind classes over arbitrary values whenever one exists. Honour `suggestCanonicalClasses` lint warnings — `gap-2.5` over `gap-[0.625rem]`, `px-10` over `px-[2.5rem]`.
- Use arbitrary values only when no canonical class matches the spec — e.g., `text-[1.5625rem]` for a design-system font size off Tailwind's type scale, or `gap-19.75` for a between-step gap.

## Design tokens

- Add new design-system colors to the `@theme` block in `src/app/globals.css` using the `--color-wb-*` prefix to match the existing brand palette.
- This generates `bg-wb-*`, `border-wb-*`, `text-wb-*` utilities automatically. Use those, not raw `var(...)` or hex values.

## Dates

- Use `date-fns` for parsing, comparing, and formatting. It is already a dependency; reference existing usage in `HistoryDrawer.tsx` and `DossierSummary.tsx`.
- Components accept `Date` (or `number` for epoch) at the boundary and format internally with `date-fns`. Don't accept pre-formatted strings, and don't expose a "formatter" prop unless callers genuinely need to control the format.
- Migrate existing components that take pre-formatted strings when you touch them.

## File layout: sister components

- When a component has one or more **sister components** — other components in the same family that share a primitive, naming prefix, or design concept — group them into their own subdirectory with an `index.ts` barrel. Don't leave them as siblings in a flat folder.
- Examples in this repo: `src/components/ui/cards/` (`Card`, `ProjectCard`), `src/components/ui/buttons/` (`Button`, future variants). Single-file components stay flat at `src/components/ui/`.
- The parent barrel (`src/components/ui/index.ts`) re-exports the subdirectory as a whole — `export * from "./cards"` — not individual files.
- Move a single-file component into its own subdirectory the moment a second member joins the family; don't wait for a third.

## Padding & ownership

- **Primitives** (e.g., `Card`) own only their visual identity (radius, border, fill). They expose `className` so callers can compose padding, gap, layout.
- **Opinionated wrappers** (e.g., `ProjectCard`) own the _whole_ layout — padding, gap, internal structure, hover affordances. They do **not** expose a `className` override. Callers don't get to restyle them.
- If a caller wants different styling, they should compose with the primitive directly, not patch the wrapper.

## Conditional wrappers

- When a component should optionally render inside an outer wrapper (typical case: optional `href` that, when supplied, wraps the body in a Next.js `<Link>`), extract the body into an internal sub-component and gate the wrapper on the controlling prop. Don't duplicate the body or use a fragment-with-conditional-attributes hack.

```tsx
export function ProjectCard({ href, ...rest }: ProjectCardProps) {
  const body = <ProjectCardBody {...rest} />;
  if (href === undefined) return body;
  return (
    <Link href={href} className="group block focus:outline-none">
      {body}
    </Link>
  );
}
```

## Clickable surfaces

- When a card or tile is clickable, make the **entire surface** the hit zone (wrap in `<Link>` or use a `<button>` element). The arrow / chevron is the visual affordance, not the only target.
- Hover and focus-visible affordances on interactive surfaces use the `group` pattern: put `group` on the outer interactive element, and `group-hover:` / `group-focus-visible:` on inner elements. This way the inner body can render bare (non-interactive) without dragging hover styles along — the `group-*` utilities silently no-op without a `group` ancestor.

## Cleanup

- Don't add backwards-compat hacks. No renaming unused vars to `_var`, no re-exporting removed types, no `// removed` comments.
- Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs).
- Delete what is unused. Don't keep dead exports "just in case".

## Comments

- Default to no comments. Identifiers should explain _what_; only write a comment when the _why_ is non-obvious (hidden constraint, subtle invariant, workaround for a specific bug).
- Don't reference the current task, fix, or issue number in code comments — that belongs in the PR description.
- JSDoc on prop types / components / props is the exception — that's part of the API contract, not implementation commentary.

## UI kit demo

- Every component family in `src/components/ui` has a corresponding demo route under `src/app/ui-kit-demo/<family>/page.tsx`. When you create or update a component, create or update its demo in the same change — they ship together, no exceptions.
- One demo route per family — singular route name even when the component folder is plural (e.g., `cards/` → `/ui-kit-demo/card`, `buttons/` → `/ui-kit-demo/button`). Render every variant, every icon/no-icon combination, and every notable prop permutation on that page.
- Wire new routes into both `src/app/ui-kit-demo/layout.tsx` (sidebar `pages` list) and `src/app/ui-kit-demo/page.tsx`. Remove the corresponding `ComingSoonCard` if one exists.
- The landing page groups `DemoLinkCard`s into sub-sections under `SubSectionHeading`s — currently **Actions**, **Inputs**, **Display**, **Patterns**. Place each new demo in the sub-section that matches its role:
  - **Actions** — anything the user clicks to trigger behavior (buttons, icon buttons, split actions).
  - **Inputs** — anything that captures or selects a value (text fields, search, selects, comboboxes, sliders).
  - **Display** — passive surfaces and chips that present content (cards, tags, badges, avatars).
  - **Patterns** — higher-level composites built from primitives (modals, drawers, brief panels, multi-step flows).
- If a new demo genuinely doesn't fit any existing sub-section, add a new sub-section rather than dropping the demo into the closest-ish bucket. Keep `ComingSoonCard` at the end of the **Patterns** sub-section (or whichever section it last lived in) — don't leave it floating outside the groups.
- Each demo's `kicker` should agree with its sub-section (Action / Input / Surface / Chip / Overlay / Brief panel, etc.). If you move a demo between sub-sections, update its kicker to match.

## Package management

- Use `pnpm`, not `npm`.
- Never run the dev server; the user runs it themselves.
