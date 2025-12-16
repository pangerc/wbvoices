/**
 * Shared icons for VersionAccordion and DraftAccordion.
 * Extracted to eliminate duplication.
 */

interface IconProps {
  className?: string;
}

/**
 * Custom send-to-mixer icon (double chevron pointing right)
 */
export function SendToMixerIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className={className}>
      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="10" strokeWidth="1.5"
        d="m11.124 19.495 7.885-7.593-7.885-7.593v4.283H8.982C4.602 8.593 1 12.195 1 16.575v2.628c0 .292.195.487.487.487h.097c.195 0 .39-.195.39-.39.194-2.238 2.044-4.088 4.38-4.088h4.673v4.283h.097Z" />
      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="10" strokeWidth="1.5"
        d="M15.018 19.495 23 11.903l-7.982-7.593" />
    </svg>
  );
}

/**
 * AI Redo Spark icon for "Request a change" (sparkle with circular arrow)
 */
export function RequestChangeIcon({ className }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className={className}>
      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
        d="M6.25195 11.9986c2.86519 -0.576 5.17205 -2.91087 5.74885 -5.85016 0.5769 2.93929 2.8832 5.27416 5.7484 5.85016m0 0.0033c-2.8652 0.576 -5.172 2.9109 -5.7489 5.8502 -0.5769 -2.9393 -2.88316 -5.2742 -5.74835 -5.8502" />
      <path stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"
        d="M22.5659 10.0961c0.5991 3.3416 -0.3926 6.9125 -2.9751 9.495 -4.1925 4.1925 -10.98981 4.1925 -15.18228 0 -4.192469 -4.1924 -4.192469 -10.98977 0 -15.18224 4.19247 -4.192468 10.98978 -4.192468 15.18228 0l0.8782 0.87817" />
      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
        d="M16.6836 5.41016h3.8395V1.57061" />
    </svg>
  );
}
