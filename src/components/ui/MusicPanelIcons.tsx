/**
 * Custom SVG icons for MusicPanel tab bar.
 * Extracted to reduce component bloat.
 */

interface IconProps {
  isActive?: boolean;
  className?: string;
  size?: number;
}

const ACTIVE_COLOR = "#2F7DFA";
const DEFAULT_COLOR = "#FFFFFF";

/**
 * Starburst/spark icon for "Generate" mode
 */
export function GenerateIcon({ isActive, className, size = 16 }: IconProps) {
  const color = isActive ? ACTIVE_COLOR : DEFAULT_COLOR;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M8 1L8.5 4.5L12 2L9.5 5.5L14 4L10.5 7.5L15 8L11.5 8.5L14 12L10.5 9.5L12 14L8.5 10.5L8 15L7.5 11.5L4 14L6.5 10.5L2 12L5.5 8.5L1 8L4.5 7.5L2 4L5.5 6.5L4 2L7.5 5.5L8 1Z"
        fill={color}
      />
    </svg>
  );
}

/**
 * Upload arrow icon for "Upload" mode
 */
export function UploadIcon({ isActive, className, size = 16 }: IconProps) {
  const color = isActive ? ACTIVE_COLOR : DEFAULT_COLOR;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M8 10V2M8 2L5.5 4.5M8 2L10.5 4.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 12V13C2 13.5304 2.21071 14.0391 2.58579 14.4142C2.96086 14.7893 3.46957 15 4 15H12C12.5304 15 13.0391 14.7893 13.4142 14.4142C13.7893 14.0391 14 13.5304 14 13V12"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Library/books icon for "Library" mode (vertical book spines)
 */
export function LibraryIcon({ isActive, className, size = 16 }: IconProps) {
  const color = isActive ? ACTIVE_COLOR : DEFAULT_COLOR;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M0.8 0.8v14.4"
        strokeWidth="1.5"
      />
      <path
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.38 0.8v14.4"
        strokeWidth="1.5"
      />
      <path
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m9.96 0.8 5.24 14.4"
        strokeWidth="1.5"
      />
    </svg>
  );
}
