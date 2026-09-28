"use client";

/**
 * Admin — Backup & Migration (AAC-185, P0-5).
 *
 * P0 shell: the maintenance switch + the three feature toggles, all persisted
 * via /api/admin/server-settings. Export / Import / Migrate wizards are
 * placeholders (disabled) wired in later phases (P2+).
 */

import { Switch } from "@/components/ui/Switch";
import type { ServerSettings } from "@/lib/db/schema";
import { useCallback, useEffect, useState } from "react";

export default function AdminBackupPage() {
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/server-settings");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.code === "SETTINGS_TABLE_MISSING") {
          setTableMissing(true);
          setError(null);
          return;
        }
        throw new Error(data?.error || `Failed to load (${res.status})`);
      }
      setTableMissing(false);
      setSettings(data.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createTable = useCallback(async () => {
    setSaving("createTable");
    setError(null);
    try {
      const res = await fetch("/api/admin/server-settings/init", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.details || data?.error || `Failed (${res.status})`);
      setTableMissing(false);
      setSettings(data.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create table");
    } finally {
      setSaving(null);
    }
  }, []);

  const forceClear = useCallback(async () => {
    setSaving("forceClear");
    setError(null);
    try {
      const res = await fetch("/api/admin/maintenance/clear", {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Force clear failed (${res.status})`);
      // Re-read settings so the toggle reflects the cleared state.
      const s = await fetch("/api/admin/server-settings");
      if (s.ok) setSettings((await s.json()).settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Force clear failed");
    } finally {
      setSaving(null);
    }
  }, []);

  const patch = useCallback(
    async (field: keyof ServerSettings, value: boolean) => {
      setSaving(field);
      setError(null);
      try {
        const res = await fetch("/api/admin/server-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        const data = await res.json();
        setSettings(data.settings);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      } finally {
        setSaving(null);
      }
    },
    [],
  );

  if (loading) {
    return <div className="p-8 text-gray-400">Loading settings…</div>;
  }
  if (tableMissing && !settings) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-2xl font-bold text-white mb-1">Backup & Migration</h1>
        <div className="mt-6 p-5 rounded-xl border border-amber-500/30 bg-amber-500/10">
          <div className="text-white font-medium mb-1">
            Settings table not found
          </div>
          <p className="text-sm text-amber-200/80 mb-4">
            The <code>server_settings</code>{" "}table hasn&apos;t been created on
            this environment yet (migration&nbsp;0004 not applied). Create it now
            to enable maintenance mode and backup/migration. This runs{" "}
            <code>CREATE TABLE IF NOT EXISTS</code> — safe to click.
          </p>
          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
          <button
            type="button"
            onClick={createTable}
            disabled={saving === "createTable"}
            className="px-4 py-2 rounded-lg bg-wb-blue/20 border border-wb-blue/40 text-sm text-white hover:bg-wb-blue/30 disabled:opacity-50 transition-colors"
          >
            {saving === "createTable" ? "Creating…" : "Create settings table"}
          </button>
        </div>
      </div>
    );
  }
  if (!settings) {
    return (
      <div className="p-8 text-red-400">{error || "Settings unavailable."}</div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-1">Backup & Migration</h1>
      <p className="text-sm text-gray-400 mb-8">
        Export, import, and migrate project data between deployments. Toggle
        the feature and enter maintenance mode before running a migration.
      </p>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Maintenance */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-wb-blue mb-3">
          Maintenance mode
        </h2>
        <ToggleRow
          label="Maintenance mode"
          description="Blocks generation, ad edits, and sign-ups for ALL users (including admins) so a backup/migration captures a consistent snapshot. Backup actions themselves still run."
          checked={settings.maintenanceMode}
          saving={saving === "maintenanceMode"}
          onChange={(v) => patch("maintenanceMode", v)}
          warn
        />
        {settings.maintenanceMode && (
          <div className="mt-3 flex items-center justify-between gap-6 p-4 rounded-xl border border-red-500/20 bg-red-500/5">
            <div className="min-w-0">
              <div className="text-white text-sm font-medium">
                Break-glass: force clear
              </div>
              <p className="text-xs mt-1 text-gray-500">
                Turns maintenance off via the Redis mirror — works even if the
                database is unreachable. Use if the normal toggle can&apos;t save.
              </p>
            </div>
            <button
              type="button"
              onClick={forceClear}
              disabled={saving === "forceClear"}
              className="flex-shrink-0 px-4 py-2 rounded-lg border border-red-500/40 bg-red-500/10 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
            >
              {saving === "forceClear" ? "Clearing…" : "Force clear"}
            </button>
          </div>
        )}
      </section>

      {/* Feature flags */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-wb-blue mb-3">
          Feature toggles
        </h2>
        <div className="flex flex-col gap-4">
          <ToggleRow
            label="Backup export"
            description="Allow exporting project data (file download + server-to-server pull)."
            checked={settings.backupExportEnabled}
            saving={saving === "backupExportEnabled"}
            onChange={(v) => patch("backupExportEnabled", v)}
          />
          <ToggleRow
            label="Backup import"
            description="Allow importing / migrating data from another deployment (pull by URL)."
            checked={settings.backupImportEnabled}
            saving={saving === "backupImportEnabled"}
            onChange={(v) => patch("backupImportEnabled", v)}
          />
          <ToggleRow
            label="Restore from file"
            description="Allow importing from an uploaded archive file."
            checked={settings.restoreFromFileEnabled}
            saving={saving === "restoreFromFileEnabled"}
            onChange={(v) => patch("restoreFromFileEnabled", v)}
          />
        </div>
      </section>

      {/* Actions */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
          Actions
        </h2>
        <ExportPanel enabled={settings.backupExportEnabled} />
        <div className="mt-3">
          <ImportPanel enabled={settings.restoreFromFileEnabled} />
        </div>
        <div className="mt-3">
          <MigratePanel
            exportEnabled={settings.backupExportEnabled}
            importEnabled={settings.backupImportEnabled}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
          Recent activity
        </h2>
        <AuditLog />
      </section>
    </div>
  );
}

function ToggleRow({
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
        <Switch checked={checked} onChange={onChange} disabled={saving} aria-label={label} />
      </div>
    </div>
  );
}

function ExportPanel({ enabled }: { enabled: boolean }) {
  const [scope, setScope] = useState<"complete" | "per-user" | "per-ad">(
    "complete",
  );
  const [emails, setEmails] = useState("");
  const [adIds, setAdIds] = useState("");
  const [includeGlobalReference, setIncludeGlobalReference] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const start = () => {
    setErr(null);
    const q = new URLSearchParams({ scope });
    if (scope === "per-user") {
      const list = emails.split(",").map((e) => e.trim()).filter(Boolean);
      if (!list.length) return setErr("Enter at least one email.");
      q.set("emails", list.join(","));
      if (includeGlobalReference) q.set("includeGlobalReference", "1");
    } else if (scope === "per-ad") {
      const list = adIds.split(",").map((a) => a.trim()).filter(Boolean);
      if (!list.length) return setErr("Enter at least one ad id.");
      q.set("adIds", list.join(","));
    }
    // Native browser download — the archive streams straight to disk.
    window.location.href = `/api/admin/backup/export?${q.toString()}`;
  };

  return (
    <div className="p-4 rounded-xl border border-white/10 bg-white/5">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="text-white text-sm font-medium">Export archive</div>
        <span className="text-[10px] uppercase tracking-widest text-gray-600">
          .tar.gz
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {(["complete", "per-user", "per-ad"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
              scope === s
                ? "bg-wb-blue/20 border-wb-blue/40 text-white"
                : "border-white/10 text-gray-400 hover:text-white"
            }`}
          >
            {s === "complete" ? "Complete" : s === "per-user" ? "Per user" : "Per ad"}
          </button>
        ))}
      </div>

      {scope === "per-user" && (
        <div className="mb-3 space-y-2">
          <input
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="e.g.: alice@corp.com, bob@corp.com"
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white placeholder-gray-600"
          />
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={includeGlobalReference}
              onChange={(e) => setIncludeGlobalReference(e.target.checked)}
            />
            Include global reference data (voices, tones, templates)
          </label>
        </div>
      )}
      {scope === "per-ad" && (
        <input
          value={adIds}
          onChange={(e) => setAdIds(e.target.value)}
          placeholder="e.g.: fast-bridge-136, calm-river-42"
          className="w-full mb-3 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white placeholder-gray-600"
        />
      )}

      {err && <p className="text-xs text-red-400 mb-3">{err}</p>}
      {!enabled && (
        <p className="text-xs text-amber-400/80 mb-3">
          Enable “Backup export” above to download an archive.
        </p>
      )}

      <button
        type="button"
        onClick={start}
        disabled={!enabled}
        className="px-4 py-2 rounded-lg bg-wb-blue/20 border border-wb-blue/40 text-sm text-white hover:bg-wb-blue/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Download export
      </button>
    </div>
  );
}

type ImportPlan = {
  writes: Record<string, number>;
  deletes: Record<string, number>;
  blobCount: number;
  confirmPhrase: string;
  manifest: { scope: { type: string } };
};

function ImportPanel({ enabled }: { enabled: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [strategy, setStrategy] = useState<"merge" | "replace">("merge");
  const [confirm, setConfirm] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState<null | "dry" | "apply">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const send = async (mode: "dry-run" | "apply") => {
    if (!file) return setErr("Choose a .tar.gz archive first.");
    setErr(null);
    setMsg(null);
    setBusy(mode === "dry-run" ? "dry" : "apply");
    try {
      const q = new URLSearchParams({ mode, conflictStrategy: strategy });
      if (mode === "apply" && strategy === "replace") q.set("confirm", confirm);
      const res = await fetch(`/api/admin/backup/import/file?${q.toString()}`, {
        method: "POST",
        body: file,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      if (mode === "dry-run") {
        setPlan(data.plan);
      } else {
        setMsg(
          `Imported (${data.result.strategy}). Written: ${Object.entries(
            data.result.written as Record<string, number>,
          )
            .map(([k, v]) => `${k}:${v}`)
            .join(", ")}. Blobs: ${data.result.blobsUploaded}.${
            data.result.safetyBackup
              ? ` Pre-import backup: ${data.result.safetyBackup}`
              : ""
          }`,
        );
        setPlan(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  };

  const kv = (obj: Record<string, number>) =>
    Object.entries(obj).length
      ? Object.entries(obj)
          .map(([k, v]) => `${k}: ${v === -1 ? "all" : v}`)
          .join(", ")
      : "—";

  return (
    <div className="p-4 rounded-xl border border-white/10 bg-white/5">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="text-white text-sm font-medium">Import from file</div>
        <span className="text-[10px] uppercase tracking-widest text-gray-600">
          .tar.gz
        </span>
      </div>

      {!enabled && (
        <p className="text-xs text-amber-400/80 mb-3">
          Enable “Restore from file” above to import an archive.
        </p>
      )}

      <input
        type="file"
        accept=".gz,.tgz,application/gzip"
        disabled={!enabled}
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setPlan(null);
          setMsg(null);
        }}
        className="block w-full text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-white/10 file:bg-white/5 file:text-gray-300 disabled:opacity-40"
      />

      <div className="flex flex-wrap gap-2 mt-3">
        {(["merge", "replace"] as const).map((s) => (
          <button
            key={s}
            type="button"
            disabled={!enabled}
            onClick={() => setStrategy(s)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
              strategy === s
                ? s === "replace"
                  ? "bg-red-500/20 border-red-500/40 text-white"
                  : "bg-wb-blue/20 border-wb-blue/40 text-white"
                : "border-white/10 text-gray-400 hover:text-white"
            }`}
          >
            {s === "merge" ? "Merge (upsert)" : "Replace (wipe scope)"}
          </button>
        ))}
      </div>

      {plan && (
        <div className="mt-3 p-3 rounded-lg bg-black/30 border border-white/10 text-xs space-y-1">
          <div className="text-gray-300">
            Scope: <span className="text-white">{plan.manifest.scope.type}</span> ·
            blobs: {plan.blobCount}
          </div>
          <div className="text-gray-400">Will write → {kv(plan.writes)}</div>
          {strategy === "replace" && (
            <div className="text-red-300">
              Will delete (target scope) → {kv(plan.deletes)}
            </div>
          )}
        </div>
      )}

      {strategy === "replace" && plan && (
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={`Type "${plan.confirmPhrase}" to confirm`}
          className="w-full mt-3 px-3 py-2 rounded-lg bg-black/30 border border-red-500/30 text-sm text-white placeholder-gray-600"
        />
      )}

      {err && <p className="text-xs text-red-400 mt-3">{err}</p>}
      {msg && <p className="text-xs text-green-400 mt-3 break-all">{msg}</p>}

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          disabled={!enabled || !file || busy !== null}
          onClick={() => send("dry-run")}
          className="px-4 py-2 rounded-lg bg-white/10 border border-white/15 text-sm text-white hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy === "dry" ? "Analyzing…" : "Analyze (dry-run)"}
        </button>
        <button
          type="button"
          disabled={!enabled || !plan || busy !== null}
          onClick={() => send("apply")}
          className={`px-4 py-2 rounded-lg text-sm text-white border disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
            strategy === "replace"
              ? "bg-red-500/20 border-red-500/40 hover:bg-red-500/30"
              : "bg-wb-blue/20 border-wb-blue/40 hover:bg-wb-blue/30"
          }`}
        >
          {busy === "apply" ? "Importing…" : "Apply import"}
        </button>
      </div>
    </div>
  );
}

type AuditEntry = {
  ts: string;
  action: string;
  actor: string | null;
  status: string;
  scope?: string;
  sourceUrl?: string;
  detail?: string;
};

function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/backup/audit?limit=50");
      if (res.ok) setEntries((await res.json()).entries);
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-4 rounded-xl border border-white/10 bg-white/5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500">
          Last {entries?.length ?? 0} backup actions
        </span>
        <button
          type="button"
          onClick={load}
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          Refresh
        </button>
      </div>
      {!entries?.length ? (
        <p className="text-xs text-gray-600">No activity yet.</p>
      ) : (
        <div className="flex flex-col gap-1 max-h-64 overflow-auto">
          {entries.map((e, i) => (
            <div
              key={i}
              className="flex items-center gap-3 text-xs py-1.5 border-b border-white/5 last:border-0"
            >
              <span
                className={`w-16 flex-shrink-0 ${
                  e.status === "success"
                    ? "text-green-400"
                    : e.status === "blocked"
                      ? "text-amber-400"
                      : "text-red-400"
                }`}
              >
                {e.status}
              </span>
              <span className="w-24 flex-shrink-0 text-gray-300">{e.action}</span>
              <span className="w-40 flex-shrink-0 text-gray-500 truncate">
                {e.actor ?? "?"}
              </span>
              <span className="text-gray-600 truncate">
                {e.scope ?? ""} {e.sourceUrl ?? ""}{" "}
                {new Date(e.ts).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MigratePanel({
  exportEnabled,
  importEnabled,
}: {
  exportEnabled: boolean;
  importEnabled: boolean;
}) {
  // Source side: mint an access code for another deployment to pull.
  const [grantScope, setGrantScope] = useState<"complete" | "per-user" | "per-ad">(
    "complete",
  );
  const [grantEmails, setGrantEmails] = useState("");
  const [grantAdIds, setGrantAdIds] = useState("");
  const [grant, setGrant] = useState<{ code: string; expiresAt: string } | null>(
    null,
  );

  // Destination side: pull from a source URL.
  const [sourceUrl, setSourceUrl] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [strategy, setStrategy] = useState<"merge" | "replace">("merge");
  const [confirm, setConfirm] = useState("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const mint = async () => {
    setErr(null);
    setBusy("mint");
    try {
      const body: Record<string, unknown> = { scope: grantScope };
      if (grantScope === "per-user")
        body.emails = grantEmails.split(",").map((e) => e.trim()).filter(Boolean);
      if (grantScope === "per-ad")
        body.adIds = grantAdIds.split(",").map((a) => a.trim()).filter(Boolean);
      const res = await fetch("/api/admin/backup/export/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setGrant({ code: data.code, expiresAt: data.expiresAt });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Mint failed");
    } finally {
      setBusy(null);
    }
  };

  const pull = async (mode: "dry-run" | "apply") => {
    setErr(null);
    setMsg(null);
    setBusy(mode);
    try {
      const body: Record<string, unknown> = {
        sourceUrl,
        accessCode,
        mode,
        conflictStrategy: strategy,
      };
      if (mode === "apply" && strategy === "replace") body.confirm = confirm;
      const res = await fetch("/api/admin/backup/import/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      if (mode === "dry-run") setPlan(data.plan);
      else {
        setMsg(`Migrated (${data.result.strategy}). Blobs: ${data.result.blobsUploaded}.`);
        setPlan(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Pull failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 rounded-xl border border-white/10 bg-white/5">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="text-white text-sm font-medium">Migrate from another server</div>
        <span className="text-[10px] uppercase tracking-widest text-gray-600">
          server-to-server
        </span>
      </div>

      {/* Source: mint code */}
      <div className="mb-4 pb-4 border-b border-white/10">
        <div className="text-xs text-gray-400 mb-2">
          On the <span className="text-gray-200">source</span> server — mint an
          access code for a destination to pull with:
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          {(["complete", "per-user", "per-ad"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={!exportEnabled}
              onClick={() => setGrantScope(s)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                grantScope === s
                  ? "bg-wb-blue/20 border-wb-blue/40 text-white"
                  : "border-white/10 text-gray-400 hover:text-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {grantScope === "per-user" && (
          <input
            value={grantEmails}
            onChange={(e) => setGrantEmails(e.target.value)}
            placeholder="e.g.: alice@corp.com, bob@corp.com"
            className="w-full mb-2 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white placeholder-gray-600"
          />
        )}
        {grantScope === "per-ad" && (
          <input
            value={grantAdIds}
            onChange={(e) => setGrantAdIds(e.target.value)}
            placeholder="e.g.: fast-bridge-136"
            className="w-full mb-2 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white placeholder-gray-600"
          />
        )}
        <button
          type="button"
          disabled={!exportEnabled || busy !== null}
          onClick={mint}
          className="px-4 py-2 rounded-lg bg-white/10 border border-white/15 text-sm text-white hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy === "mint" ? "Minting…" : "Mint access code"}
        </button>
        {grant && (
          <div className="mt-2 p-2 rounded-lg bg-black/40 border border-white/10 text-xs">
            <div className="text-gray-400">Access code (single-use, share securely):</div>
            <code className="text-green-300 break-all">{grant.code}</code>
            <div className="text-gray-500 mt-1">Expires {grant.expiresAt}</div>
          </div>
        )}
      </div>

      {/* Destination: pull */}
      <div className="text-xs text-gray-400 mb-2">
        On the <span className="text-gray-200">destination</span> server — pull
        from the source:
      </div>
      {!importEnabled && (
        <p className="text-xs text-amber-400/80 mb-2">
          Enable “Backup import” above to pull from another server.
        </p>
      )}
      <input
        value={sourceUrl}
        onChange={(e) => setSourceUrl(e.target.value)}
        disabled={!importEnabled}
        placeholder="https://source-deployment.example.com"
        className="w-full mb-2 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white placeholder-gray-600 disabled:opacity-40"
      />
      <input
        value={accessCode}
        onChange={(e) => setAccessCode(e.target.value)}
        disabled={!importEnabled}
        placeholder="access code from the source server"
        className="w-full mb-2 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white placeholder-gray-600 disabled:opacity-40"
      />
      <div className="flex flex-wrap gap-2 mb-2">
        {(["merge", "replace"] as const).map((s) => (
          <button
            key={s}
            type="button"
            disabled={!importEnabled}
            onClick={() => setStrategy(s)}
            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
              strategy === s
                ? s === "replace"
                  ? "bg-red-500/20 border-red-500/40 text-white"
                  : "bg-wb-blue/20 border-wb-blue/40 text-white"
                : "border-white/10 text-gray-400 hover:text-white"
            }`}
          >
            {s === "merge" ? "Merge (upsert)" : "Replace (wipe scope)"}
          </button>
        ))}
      </div>
      {plan && (
        <div className="mb-2 p-3 rounded-lg bg-black/30 border border-white/10 text-xs space-y-1">
          <div className="text-gray-300">
            Scope: <span className="text-white">{plan.manifest.scope.type}</span> ·
            blobs: {plan.blobCount}
          </div>
          <div className="text-gray-400">
            Will write →{" "}
            {Object.entries(plan.writes)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ") || "—"}
          </div>
          {strategy === "replace" && (
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={`Type "${plan.confirmPhrase}" to confirm`}
              className="w-full mt-2 px-3 py-2 rounded-lg bg-black/30 border border-red-500/30 text-sm text-white placeholder-gray-600"
            />
          )}
        </div>
      )}
      {err && <p className="text-xs text-red-400 mb-2">{err}</p>}
      {msg && <p className="text-xs text-green-400 mb-2">{msg}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!importEnabled || !sourceUrl || !accessCode || busy !== null}
          onClick={() => pull("dry-run")}
          className="px-4 py-2 rounded-lg bg-white/10 border border-white/15 text-sm text-white hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy === "dry-run" ? "Analyzing…" : "Analyze (dry-run)"}
        </button>
        <button
          type="button"
          disabled={!importEnabled || !plan || busy !== null}
          onClick={() => pull("apply")}
          className={`px-4 py-2 rounded-lg text-sm text-white border disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
            strategy === "replace"
              ? "bg-red-500/20 border-red-500/40 hover:bg-red-500/30"
              : "bg-wb-blue/20 border-wb-blue/40 hover:bg-wb-blue/30"
          }`}
        >
          {busy === "apply" ? "Migrating…" : "Apply migration"}
        </button>
      </div>
    </div>
  );
}

