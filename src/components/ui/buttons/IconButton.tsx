import { ButtonHTMLAttributes, ComponentType, SVGProps } from "react";
import { twMerge } from "tailwind-merge";

/** Visual style of an {@link IconButton}. Mirrors {@link ButtonVariant} so an icon-only action sits next to a labeled `Button` without visual drift. */
export type IconButtonVariant = "blue" | "ghost";

/** Heroicons-compatible icon: a component that renders an SVG element from `<svg>`-compatible props. */
type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Props for {@link IconButton}: a square, icon-only action affordance with the
 * same variants as `Button`. Native `<button>` attributes (`onClick`,
 * `disabled`, `type`, …) pass through; `className` does not — the button owns
 * its full layout per the design system. `aria-label` is required because the
 * button has no visible text label.
 */
export type IconButtonProps = {
  /**
   * Visual style of the button.
   * - `"blue"` — primary filled affordance in `wb-blue-bright` (`#0080FF`).
   * - `"ghost"` — no background and no border; hover/active come from translucent white overlays.
   *
   * Defaults to `"blue"`.
   */
  variant?: IconButtonVariant;
  /**
   * Heroicons icon component rendered as the entire button content (e.g.
   * `PlayIcon`). Pass the component itself, not a JSX element; it is rendered
   * as a 1.25rem (`w-5 h-5`) square and marked `aria-hidden`.
   */
  icon: HeroIcon;
  /** Accessible label announced by assistive tech; required since the button has no visible text. */
  "aria-label": string;
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "className" | "aria-label"
>;

/** Tailwind class strings keyed by {@link IconButtonVariant}. Kept in sync with `Button`'s variant table. */
const VARIANT_CLASSES: Record<IconButtonVariant, string> = {
  blue: "bg-wb-blue-bright text-white hover:bg-wb-blue-bright/90 active:bg-wb-blue-bright/80",
  ghost:
    "bg-transparent border-0 text-white hover:bg-white/5 active:bg-white/10",
};

/**
 * Square, icon-only sibling of {@link Button}. Same two variants (`"blue"` and
 * `"ghost"`), same focus and disabled treatment, but the content is a single
 * Heroicons icon and the box is square (`0.81rem` padding on every side) so it
 * matches the height of a labeled `Button` and aligns cleanly next to one.
 * Defaults `type` to `"button"` so it never accidentally submits a form.
 */
export function IconButton({
  variant = "blue",
  icon: Icon,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={twMerge(
        "inline-flex items-center justify-center p-[0.81rem] rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50 disabled:pointer-events-none",
        VARIANT_CLASSES[variant],
      )}
    >
      <Icon aria-hidden className="w-5 h-5 shrink-0" />
    </button>
  );
}
