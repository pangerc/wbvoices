import React from "react";
import { GlassyModal } from "./GlassyModal";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  isConfirming?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Generic confirmation dialog. Replaces window.confirm() for actions that
 * should look polished or carry destructive weight (variant="danger").
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
          className={`px-4 py-2 rounded-lg font-medium disabled:opacity-50 ${confirmClass}`}
        >
          {isConfirming ? "Working…" : confirmLabel}
        </button>
      </div>
    </GlassyModal>
  );
}
