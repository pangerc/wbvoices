import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Fragment, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

/** Supported size caps for the modal panel; maps 1:1 to a Tailwind `max-w-*` utility via {@link MAX_WIDTH_CLASSES}. */
export type MaxWidth = "sm" | "md" | "lg" | "xl" | "2xl";

/** Lookup that resolves a {@link MaxWidth} value to the Tailwind utility used to cap the panel width. */
export const MAX_WIDTH_CLASSES: Record<MaxWidth, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
};

/** Props for {@link GlassyModal}: open state, close handler, optional header content, body, and width cap. */
type GlassyModalProps = {
  /** Whether the modal is currently visible. Controlled by the parent. */
  isOpen: boolean;
  /** Called when the user dismisses the modal (backdrop click, Escape, or close button). */
  onClose: () => void;
  /** Optional heading shown at the top of the panel. Omit to skip the title row entirely. */
  title?: string;
  /** Optional supporting copy shown beneath the title. Requires `title` to be set to look correct. */
  description?: string;
  /** Body content rendered inside the panel below the header. */
  children: ReactNode;
  /** Tailwind `max-w-*` cap for the panel. Defaults to `"lg"`. */
  maxWidth?: MaxWidth;
};

/** Frosted-glass dialog built on Headless UI: animated backdrop + centered panel with optional title/description header and a close button. */
export function GlassyModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = "lg",
}: GlassyModalProps) {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel
                className={twMerge(
                  "w-full transform overflow-hidden rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-6 text-left align-middle shadow-xl transition-all",
                  MAX_WIDTH_CLASSES[maxWidth],
                )}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    {title && (
                      <Dialog.Title
                        as="h3"
                        className="text-xl font-bold text-white mb-1"
                      >
                        {title}
                      </Dialog.Title>
                    )}
                    {description && (
                      <Dialog.Description className="text-sm text-gray-300">
                        {description}
                      </Dialog.Description>
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
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
