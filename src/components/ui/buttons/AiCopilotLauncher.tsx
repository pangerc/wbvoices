"use client";

import { AiSparkleIcon } from "../icons/AiSparkle";

// Launcher pill that opens the AI Copilot panel. Pixel-spec from design:
// 122×46 with 10px gap between sparkle and label, full-pill radius, white
// background, blue (#0080FF) drop shadow. Floats in the bottom-right corner
// by default — pass `floating={false}` to render inline (the UI kit demo
// uses that variant so the pill doesn't escape its preview container).
export interface AiCopilotLauncherProps {
  onClick: () => void;
  /**
   * When true (default), pins the pill to the viewport's bottom-right
   * via `position: fixed`. Set false to render inline at its natural
   * flow position — needed by the UI kit demo and any future inline use.
   */
  floating?: boolean;
}

export function AiCopilotLauncher({
  onClick,
  floating = true,
}: AiCopilotLauncherProps) {
  const placement = floating ? "fixed bottom-6 right-6 z-40 " : "";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open AI Copilot"
      className={`${placement}flex w-[122px] h-[46px] p-[10px] justify-center items-center gap-[10px] rounded-full bg-white shadow-[0_4px_4px_0_#0080FF]`}
    >
      <AiSparkleIcon />
      <span className="font-sans text-[14px] font-normal leading-normal text-black">
        Ai Copilot
      </span>
    </button>
  );
}
