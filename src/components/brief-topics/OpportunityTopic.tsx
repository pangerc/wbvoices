/**
 * OpportunityTopic — AAC-20 project metadata, surfaced inside the brief panel.
 *
 * Holds the commercial-pipeline fields that aren't part of the creative brief:
 * project status, the Salesforce *opportunity* URL (a plain link, separate
 * from the brand's SF account integration), and the estimated deal amount.
 * All optional; with status left at "exploration" and no opportunity linked,
 * the project is in "Exploration Mode".
 *
 * Status sits outside the collapsible body (always visible) since it drives
 * the dashboard filter; the URL + amount live inside the collapsible.
 */

import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_VALUES,
  ProjectStatus,
} from "@/types";
import { GlassyInput } from "../ui";
import { CollapsibleSection } from "./CollapsibleSection";

export interface OpportunityTopicProps {
  status: ProjectStatus;
  onStatusChanged: (next: ProjectStatus) => void;

  opportunityUrl: string;
  onOpportunityUrlChanged: (next: string) => void;

  /** Held as text so the field can format freely; parsed to a number on save. */
  opportunityAmountText: string;
  onOpportunityAmountTextChanged: (next: string) => void;

  disabled?: boolean;
}

// Valid when empty (optional) or a parseable absolute http(s) URL.
function isValidOptionalUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function OpportunityTopic({
  status,
  onStatusChanged,
  opportunityUrl,
  onOpportunityUrlChanged,
  opportunityAmountText,
  onOpportunityAmountTextChanged,
  disabled,
}: OpportunityTopicProps) {
  const urlValid = isValidOptionalUrl(opportunityUrl);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-200 mb-1">
          Opportunity
        </h3>
        <p className="text-xs text-gray-500">
          Business metadata for pipeline tracking. All optional — leave as
          Exploration if the project isn&apos;t tied to a live opportunity.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="block text-sm text-gray-300">Project Status</label>
        <div className="flex flex-wrap gap-2">
          {PROJECT_STATUS_VALUES.map((s) => {
            const active = s === status;
            return (
              <button
                key={s}
                type="button"
                disabled={disabled}
                onClick={() => onStatusChanged(s)}
                className={`px-4 py-2 rounded-full text-sm border transition-colors disabled:opacity-50 ${
                  active
                    ? "bg-wb-blue border-wb-blue text-white"
                    : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                }`}
              >
                {PROJECT_STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
      </div>

      <CollapsibleSection
        title="Salesforce opportunity"
        description="link + amount (optional)"
        defaultOpen
        badge={
          opportunityAmountText.trim()
            ? `$${opportunityAmountText.trim()}`
            : undefined
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div>
            <GlassyInput
              label="Salesforce opportunity URL"
              value={opportunityUrl}
              placeholder="Paste Salesforce URL"
              disabled={disabled}
              onChange={(e) => onOpportunityUrlChanged(e.currentTarget.value)}
            />
            {!urlValid && (
              <p className="text-xs text-red-400 mt-1">
                Enter a valid URL (https://…) or leave it empty.
              </p>
            )}
            {urlValid && opportunityUrl.trim() === "" && (
              <p className="text-xs text-gray-500 mt-1">
                The project isn&apos;t linked to a Salesforce opportunity.
              </p>
            )}
          </div>

          <GlassyInput
            label="Opportunity amount (USD)"
            value={opportunityAmountText}
            inputMode="numeric"
            placeholder="30000"
            disabled={disabled}
            onChange={(e) =>
              onOpportunityAmountTextChanged(
                e.currentTarget.value.replace(/[^0-9.]/g, ""),
              )
            }
          />
        </div>
      </CollapsibleSection>
    </div>
  );
}
