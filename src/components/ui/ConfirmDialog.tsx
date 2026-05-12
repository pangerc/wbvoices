import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { GlassyModal } from "./GlassyModal";

/** Props for {@link ConfirmDialog}: controlled open state, header copy, message body, button labels/variant, and the confirm/cancel callbacks. */
export type ConfirmDialogProps = {
  /** Whether the dialog is currently visible. Controlled by the parent. */
  isOpen: boolean;
  /** Heading shown at the top of the dialog (e.g., `"Delete this ad?"`). */
  title: string;
  /** Body content explaining what the user is confirming. Accepts a ReactNode so callers can pass formatted markup, not just plain strings. */
  message: ReactNode;
  /** Label shown on the primary (confirm) button. Defaults to `"Confirm"`. */
  confirmLabel?: string;
  /** Label shown on the secondary (cancel) button. Defaults to `"Cancel"`. */
  cancelLabel?: string;
  /** Visual variant of the confirm button: `"danger"` paints it red for destructive actions, `"default"` uses the brand blue. Defaults to `"default"`. */
  variant?: "default" | "danger";
  /** When `true`, both buttons are disabled and the confirm button shows `"Working…"` — used while the confirm callback is in flight. Defaults to `false`. */
  isConfirming?: boolean;
  /** Called when the user clicks the confirm button. May be async; the caller is responsible for flipping `isConfirming` around the awaited work. */
  onConfirm: () => void | Promise<void>;
  /** Called when the user dismisses the dialog (cancel button, backdrop click, Escape, or close button). */
  onCancel: () => void;
};

/**
 * Generic confirmation dialog. Replaces `window.confirm()` for actions that
 * should look polished or carry destructive weight (`variant="danger"`).
 * Built on top of {@link GlassyModal}, so it inherits the frosted-glass look
 * and the backdrop/Escape close behavior.
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmClass =
    variant === "danger"
      ? "bg-red-500 hover:bg-red-500/80 text-white"
      : "bg-wb-blue hover:bg-wb-blue/80 text-white";

  return (
    <GlassyModal isOpen={isOpen} onClose={onCancel} title={title} maxWidth="sm">
      <div className="text-sm text-gray-200">{message}</div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isConfirming}
          className="px-4 py-2 rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 disabled:opacity-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isConfirming}
          className={twMerge(
            "px-4 py-2 rounded-lg font-medium disabled:opacity-50",
            confirmClass,
          )}
        >
          {isConfirming ? "Working…" : confirmLabel}
        </button>
      </div>
    </GlassyModal>
  );
}
