import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { format } from "date-fns";
import Link from "next/link";
import { Card } from "./Card";

/** Props for {@link ProjectCard}: a dashboard tile that summarizes a single project and optionally links to its page. */
export type ProjectCardProps = {
  /** Project name shown at the top of the card. */
  title: string;
  /** Customer / brand the project belongs to (e.g., `"Spotify"`). Rendered in italic below the title. */
  customer: string;
  /** Market / region label (e.g., `"Saudi Arabia"`). */
  market: string;
  /** Primary language of the ad (e.g., `"Modern Standard Arabic"`). */
  language: string;
  /** Timestamp of the project's last modification. Rendered as `MMM d yyyy` (e.g., `"Jan 1 2025"`) via `date-fns`. */
  lastUpdated: Date;
  /** Optional route the card navigates to when clicked. When provided, the card is wrapped in a Next.js `<Link>` and the whole surface becomes clickable (plus hover/focus affordances are enabled). When omitted, the card renders as a plain, non-interactive tile. */
  href?: string;
};

/**
 * Dashboard tile for a single project. Renders the project's title, customer,
 * and a footer with market, language, and a "last updated" caption, plus a
 * trailing 45°-rotated arrow. When `href` is provided, the entire card is
 * wrapped in a Next.js `<Link>` and gains hover/focus affordances; otherwise
 * it renders as a static, non-interactive tile.
 */
export function ProjectCard({
  title,
  customer,
  market,
  language,
  lastUpdated,
  href,
}: ProjectCardProps) {
  const body = (
    <ProjectCardBody
      title={title}
      customer={customer}
      market={market}
      language={language}
      lastUpdated={lastUpdated}
    />
  );

  if (href === undefined) {
    return body;
  }

  return (
    <Link href={href} className="group block focus:outline-none">
      {body}
    </Link>
  );
}

/** Props for {@link ProjectCardBody}: every {@link ProjectCardProps} field except the interactive ones — the body is presentational only. */
type ProjectCardBodyProps = Omit<ProjectCardProps, "href">;

/**
 * Internal: the visual body of {@link ProjectCard}, factored out so it can be
 * rendered either bare or wrapped in a Next.js `<Link>` depending on whether
 * `href` is supplied. The `group-hover:` and `group-focus-visible:` utilities
 * inside only fire when an ancestor carries the `group` class — supplied by
 * the optional `<Link>` wrapper.
 */
function ProjectCardBody({
  title,
  customer,
  market,
  language,
  lastUpdated,
}: ProjectCardBodyProps) {
  return (
    <Card className="flex flex-col gap-19.75 px-10 py-8 h-full transition-colors group-hover:border-white group-focus-visible:border-white">
      <header>
        <h3 className="text-white text-[1.5625rem] font-bold leading-[normal]">
          {title}
        </h3>
        <p className="text-white text-[1.25rem] font-medium italic leading-[normal] mt-1">
          {customer}
        </p>
      </header>

      <footer className="mt-auto flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-col">
            <span className="text-white text-[0.75rem] font-normal leading-6">
              Market: {market}
            </span>
            <span className="text-white text-[0.75rem] font-normal leading-6">
              Language: {language}
            </span>
          </div>
          <span className="text-white text-[0.625rem] font-light leading-6">
            Last updated: {format(lastUpdated, "MMM d yyyy")}
          </span>
        </div>
        <ArrowRightIcon
          aria-hidden
          className="w-6 h-6 shrink-0 text-white -rotate-45 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1 group-focus-visible:translate-x-1 group-focus-visible:-translate-y-1"
        />
      </footer>
    </Card>
  );
}
