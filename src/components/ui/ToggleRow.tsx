import { Switch } from "@/components/ui/Switch";

/**
 * A labelled on/off row backed by {@link Switch}, with an inline "saving…"
 * hint. Shared by the admin settings surfaces (Backup & Migration, Match Stats).
 */
export function ToggleRow({
  label,
  description,
  checked,
  saving,
  onChange,
  warn,
}: {
  label: string;
  description: string;
  checked: boolean;
  saving: boolean;
  onChange: (v: boolean) => void;
  warn?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6 p-4 rounded-xl border border-white/10 bg-white/5">
      <div className="min-w-0">
        <div className="text-white text-sm font-medium">{label}</div>
        <p
          className={`text-xs mt-1 ${warn ? "text-amber-400/80" : "text-gray-500"}`}
        >
          {description}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {saving && <span className="text-xs text-gray-500">saving…</span>}
        <Switch
          checked={checked}
          onChange={onChange}
          disabled={saving}
          aria-label={label}
        />
      </div>
    </div>
  );
}
