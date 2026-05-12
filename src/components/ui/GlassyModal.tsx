import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Fragment, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

/** Supported size caps for the modal panel; maps 1:1 to a Tailwind `max-w-*` utility via {@link MAX_WIDTH_CLASSES}. */
export type MaxWidth = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";

/** Lookup that resolves a {@link MaxWidth} value to the Tailwind utility used to cap the panel width. */
export const MAX_WIDTH_CLASSES: Record<MaxWidth, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
};

/** Base props shared by every header variant — open state, close handler, body, and width cap. */
type GlassyModalBaseProps = {
  /** Whether the modal is currently visible. Controlled by the parent. */
  isOpen: boolean;
  /** Called when the user dismisses the modal (backdrop click, Escape, or close button). */
  onClose: () => void;
  /** Body content rendered inside the panel below the header. */
  children: ReactNode;
  /** Tailwind `max-w-*` cap for the panel. Defaults to `"lg"`. */
  maxWidth?: MaxWidth;
};

/** Header variant using the built-in title/description layout. */
type GlassyModalTextHeaderProps = {
  /** Optional heading shown at the top of the panel. Omit to skip the title row entirely. */
  title: string;
  /** Optional supporting copy shown beneath the title. Requires `title` to be set to look correct. */
  description?: string;
  /** Mutually exclusive with `title`/`description`. */
  header?: never;
};

/** Header variant supplying fully custom header content as a ReactNode. */
type GlassyModalCustomHeaderProps = {
  /** Custom header content rendered in place of the title/description block. */
  header: ReactNode;
  /** Mutually exclusive with `header`. */
  title?: never;
  /** Mutually exclusive with `header`. */
  description?: never;
};

/** Props for {@link GlassyModal}: base props plus one of the two header variants. */
type GlassyModalProps = GlassyModalBaseProps &
  (GlassyModalTextHeaderProps | GlassyModalCustomHeaderProps);

/** Frosted-glass dialog built on Headless UI: animated backdrop + centered panel with optional title/description (or custom ReactNode) header and a close button. */
export function GlassyModal({
  isOpen,
  onClose,
  title,
  description,
  header,
  children,
  maxWidth = "lg",
}: GlassyModalProps) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      {/* TODO: Do we need z-50 here? */}
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel
                className={twMerge(
                  "w-full transform overflow-hidden rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-6 text-left align-middle shadow-xl transition-all",
                  MAX_WIDTH_CLASSES[maxWidth],
                )}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    {header ?? (
                      <>
                        {title && (
                          <DialogTitle
                            as="h3"
                            className="text-xl font-bold text-white mb-1"
                          >
                            {title}
                          </DialogTitle>
                        )}
                        {description && (
                          <Dialog.Description className="text-sm text-gray-300">
                            {description}
                          </Dialog.Description>
                        )}
                      </>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>

                <div className="mt-4">{children}</div>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
