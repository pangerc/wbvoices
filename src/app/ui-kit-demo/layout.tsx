"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PropsWithChildren, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

/** Navigable entry shown in the UI Kit demo sidebar. */
type Page = {
  /** Label shown to the user in the sidebar link. */
  title: string;
  /** App route the link navigates to (passed directly to Next.js `<Link>`). */
  href: string;
};

/** Static list of pages rendered as sidebar links, in display order. */
const pages: Page[] = [
  { title: "Home", href: "/ui-kit-demo" },
  { title: "Modals", href: "/ui-kit-demo/modals" },
];

/** Layout for the UI Kit demo section: fixed left sidebar with the page list, scrollable main content on the right. */
export default function UiKitDemoLayout({ children }: PropsWithChildren) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-black text-white">
      <nav className="w-64 bg-white/5 backdrop-blur-sm border-r border-white/10 flex flex-col">
        <NavHeader
          title="UI Kit Demo"
          description="Component showcase and reference"
        />
        <div className="flex-1 p-4 space-y-1">
          {pages.map((page) => (
            <NavLink
              key={page.href}
              href={page.href}
              title={page.title}
              isActive={pathname === page.href}
            />
          ))}
        </div>
      </nav>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}

/** Props for {@link NavHeader}: the title and supporting tagline shown at the top of the sidebar. */
type NavHeaderProps = {
  /** Main heading shown at the top of the sidebar. */
  title: ReactNode;
  /** Short tagline rendered under the title to describe the section. */
  description: ReactNode;
};

/** Sidebar header block — title plus a muted one-line description, separated from the nav links by a bottom border. */
function NavHeader({ title, description }: NavHeaderProps) {
  return (
    <div className="p-6 border-b border-white/10">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-xs text-gray-400 mt-1">{description}</p>
    </div>
  );
}

/** Props for {@link NavLink}: navigation target, label, and whether the link represents the current route. */
type NavLinkProps = {
  /** Route the link navigates to (passed to Next.js `<Link>`). */
  href: string;
  /** Visible label of the link. */
  title: ReactNode;
  /** When true, the link is rendered in its active visual state. */
  isActive: boolean;
};

/** Single sidebar link with hover and active styling; uses Next.js `<Link>` for client-side navigation. */
function NavLink({ href, title, isActive }: NavLinkProps) {
  return (
    <Link
      href={href}
      className={twMerge(
        "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
        isActive
          ? "bg-wb-blue/20 border border-wb-blue/40 text-white"
          : "hover:bg-white/5 border border-transparent text-gray-300 hover:text-white",
      )}
    >
      <span className="font-medium">{title}</span>
    </Link>
  );
}
