import { XMarkIcon } from "@heroicons/react/24/outline";

/**
 * Props for {@link Tag}: a fixed-size pill that shows a string label with a
 * trailing X close affordance. The tag owns its full layout per the design
 * system, so it does not accept `className`. Click on the X is surfaced via
 * `onRemove`; the rest of the pill is non-interactive.
 */
export type TagProps = {
  /** Plain-text label shown inside the pill. */
  label: string;
  /** Click handler for the trailing X button. */
  onRemove?: () => void;
  /**
   * Accessible label announced for the X button by assistive tech. The visible
   * icon is decorative. Defaults to `"Remove"`.
   */
  removeLabel?: string;
};

/**
 * Content-sized pill that pairs a string label with a trailing X close
 * affordance. Layout per the design system: `0.625rem` padding, `0.625rem`
 * gap, centered along the main axis, `0.625rem` corner radius, 1px
 * `wb-dark-gray-blue` border on a `wb-dark-blue` fill. The X icon renders at
 * the design-spec `0.3125rem` square; the button around it carries the focus
 * ring and pointer affordances.
 */
export function Tag({ label, onRemove, removeLabel = "Remove" }: TagProps) {
  return (
    <span className="inline-flex p-2.5 justify-center items-center gap-2.5 rounded-[0.625rem] border border-wb-dark-gray-blue bg-wb-dark-blue text-white">
      <span className="min-w-0 truncate text-sm">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="inline-flex items-center justify-center shrink-0 rounded-full text-white cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <XMarkIcon aria-hidden className="w-3 h-3 shrink-0" />
      </button>
    </span>
  );
}
