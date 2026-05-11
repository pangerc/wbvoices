/**
 * ReferenceUrlsSubeditor — collapsed subeditor for reference URLs in the
 * Creative topic. Plumbed into prefetchBriefEnrichments at generate time
 * (alaric fetches each URL with type-aware extraction).
 */

import { GlassyTextarea } from "../../ui";

export interface ReferenceUrlsSubeditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ReferenceUrlsSubeditor({
  value,
  onChange,
  disabled,
}: ReferenceUrlsSubeditorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Reference URLs
        <span className="ml-2 text-xs text-gray-500">
          (one per line — homepages, product pages, prior ads we should inherit
          voice from)
        </span>
      </label>
      <GlassyTextarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          "https://example.com\nhttps://example.com/products/whatever"
        }
        rows={4}
        disabled={disabled}
      />
    </div>
  );
}
