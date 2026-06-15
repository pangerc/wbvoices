import { useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import { Tooltip } from "../ui";

/** Props for {@link ProjectName}. */
export type ProjectNameProps = {
  /** The project name to display. */
  name: string;
  /** Invoked when the name is clicked, to enter edit mode. */
  onClick?: () => void;
  /** Adds internal `px-4 py-2` spacing (e.g. to align with an inline edit input). */
  padding?: boolean;
} & (
  | {
      /** Clamp the name to a single line with a trailing ellipsis (default). */
      multiline?: false;
      numberOfLines?: never;
    }
  | {
      /** Clamp the name across multiple lines instead of a single one. */
      multiline: true;
      /** Maximum number of lines to render before clamping. */
      numberOfLines: number;
    }
);

/**
 * Renders the project name clamped to its container, revealing the full name in
 * a tooltip only when it actually overflows. Clamps to a single ellipsised line
 * by default, or to `numberOfLines` lines when `multiline` is set.
 */
export const ProjectName = ({
  name,
  padding = false,
  multiline,
  numberOfLines,
  onClick,
}: ProjectNameProps) => {
  const ref = useRef<HTMLElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const checkTruncation = () => {
      // Skip while the element is detached/unmeasured (e.g. display: none).
      if (el.scrollWidth === 0) return;

      setIsTruncated(
        multiline
          ? el.scrollHeight > el.clientHeight
          : el.scrollWidth > el.clientWidth,
      );
    };

    checkTruncation();

    const observer = new ResizeObserver(checkTruncation);
    observer.observe(el);
    return () => observer.disconnect();
  }, [name, multiline, numberOfLines]);

  // A capitalized binding is required for JSX to treat it as a component;
  // the string tags resolve to the corresponding intrinsic elements.
  const Wrapper = multiline ? "div" : "span";

  const content = (
    <Wrapper
      ref={(node) => {
        ref.current = node;
      }}
      className={twMerge(
        "border border-transparent text-left overflow-hidden",
        padding && "px-4 py-2",
        multiline ? "whitespace-pre-line" : "text-nowrap text-ellipsis",
      )}
      style={
        multiline
          ? {
              display: "-webkit-box",
              WebkitBoxOrient: "vertical",
              WebkitLineClamp: numberOfLines,
            }
          : undefined
      }
      onClick={onClick}
    >
      {name}
    </Wrapper>
  );

  return isTruncated ? <Tooltip content={name}>{content}</Tooltip> : content;
};
