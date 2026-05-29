import {
  ButtonHTMLAttributes,
  ComponentType,
  PropsWithChildren,
  SVGProps,
} from "react";
import { twMerge } from "tailwind-merge";

/** Visual style of a {@link Button}. */
export type ButtonVariant = "blue" | "destructive" | "ghost";

/** Heroicons-compatible icon: a component that renders an SVG element from `<svg>`-compatible props. */
type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Props for {@link Button}: a generic action affordance with a visual variant
 * and an optional leading icon. Native `<button>` attributes (`onClick`,
 * `disabled`, `type`, `aria-*`, …) pass through; `className` does not — the
 * button owns its full layout per the design system.
 */
export type ButtonProps = PropsWithChildren<
  {
    /**
     * Visual style of the button.
     * - `"blue"` — primary filled call-to-action in `wb-blue-bright` (`#0080FF`).
     * - `"ghost"` — text-only affordance with no background and no border.
     *
     * Defaults to `"blue"`.
     */
    variant?: ButtonVariant;
    /**
     * Optional Heroicons icon component rendered before the label (e.g.
     * `PlayIcon`). Pass the component itself, not a JSX element; it is rendered
     * as a 1.25rem (`w-5 h-5`) square and marked `aria-hidden`.
     */
    icon?: HeroIcon;
  } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">
>;

/** Tailwind class strings keyed by {@link ButtonVariant}. */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  destructive:
    "bg-red-500 text-white hover:bg-red-500/80 active:bg-wb-red-bright/80",
  blue: "bg-wb-blue-bright text-white hover:bg-wb-blue-bright/90 active:bg-wb-blue-bright/80",
  ghost:
    "bg-transparent border-0 text-white hover:bg-white/5 active:bg-white/10",
};

/**
 * Generic button primitive. Two variants today: `"blue"` (filled
 * `wb-blue-bright` call-to-action) and `"ghost"` (no background, no border).
 * Optionally prefixes the label with a Heroicons icon via the `icon` prop.
 * Padding is fixed at `1.72rem` horizontal / `0.81rem` vertical and gap at
 * `0.625rem` per the design system. Defaults `type` to `"button"` so it never
 * accidentally submits a form.
 */
export function Button({
  variant = "blue",
  icon: Icon,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={twMerge(
        "inline-flex items-center justify-center gap-2.5 px-[1.72rem] py-[0.81rem] rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50 disabled:pointer-events-none",
        VARIANT_CLASSES[variant],
      )}
    >
      {Icon && <Icon aria-hidden className="w-5 h-5 shrink-0" />}
      <span>{children}</span>
    </button>
  );
}
