import { HTMLAttributes, PropsWithChildren } from "react";
import { twMerge } from "tailwind-merge";

/** Props for {@link Card}: a rounded surface with the design-system "Other Gray" border on an "Almost Black" fill. Accepts all native `<div>` attributes so callers can attach refs, event handlers, ARIA, etc. */
export type CardProps = PropsWithChildren<
  {
    /** Extra Tailwind classes merged onto the base styles via `twMerge`. Use this to add padding, layout, or override defaults — last-write-wins ordering. */
    className?: string;
  } & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">
>;

/**
 * Plain container card with the design-system spec:
 * `1.25rem` corner radius, 1px `--Other-Gray` (#98A1B0) border, `--Almost-black`
 * (#16171A) fill. No padding by default — pass it via `className`.
 */
export function Card({ children, className, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={twMerge(
        "rounded-[1.25rem] border border-wb-gray bg-wb-almost-black",
        className,
      )}
    >
      {children}
    </div>
  );
}
