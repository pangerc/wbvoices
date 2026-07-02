/**
 * Backup model registry + streaming exporters (AAC-185, P1-4).
 *
 * Each model is a streaming producer of `BackupRecord`s honoring the resolved
 * `ScopePlan`. Exporters `await` per record (Redis/PG reads) so they never
 * outrun the archive stream — backpressure propagates to the source (§6).
 *
 * Indexes (`ads:all`, `ads:by_user:{email}`) are deliberately NOT exported;
 * they're rebuilt from imported `ad-meta` on the destination (§4) to avoid
 * dangling ids.
 */

import { db } from "@/lib/db";
import {
  instructionTemplates,
  serverSettings,
  suggestedTones,
  users,
  voiceBlacklist,
  voiceDescriptions,
  voiceMetadata,
} from "@/lib/db/schema";
import { CONVERSATION_KEYS } from "@/lib/redis/conversation";
import { AD_KEYS } from "@/lib/redis/versions";
import { getRedisV3 } from "@/lib/redis-v3";
import type { StreamType } from "@/types/versions";
import type {
  BackupModel,
  BackupRecord,
  ExportConfig,
  ExportContext,
} from "./types";

const STREAMS: StreamType[] = ["voices", "music", "sfx", "mixer"];

/** True when the model's kind survives the optional `models` subset filter. */
function selected(config: ExportConfig, kind: BackupModel["kind"]): boolean {
  return !config.models || config.models.includes(kind);
}

// --- Postgres reference/identity models --------------------------------------

const serverSettingsModel: BackupModel = {
  kind: "server-settings",
  scope: "global",
  importOrder: 10,
  appliesTo: (c) => selected(c, "server-settings"),
  async *export(_config, ctx) {
    if (!ctx.scopePlan.includeServerSettings) return;
    const rows = await db.select().from(serverSettings);
    for (const row of rows) {
      yield { kind: "server-settings", id: String(row.id), data: row };
    }
  },
};

const userModel: BackupModel = {
  kind: "user",
  scope: "per-user",
  importOrder: 20,
  appliesTo: (c) => selected(c, "user"),
  async *export(_config, ctx) {
    const emails = ctx.scopePlan.emails;
    const filter = emails.length ? new Set(emails) : null;
    const rows = await db.select().from(users);
    for (const row of rows) {
      const email = row.email?.toLowerCase();
      if (filter && (!email || !filter.has(email))) continue;
      yield { kind: "user", id: row.email, data: row };
    }
  },
};

/** Factory for the global reference-data tables (all share the same shape). */
function referenceModel<T extends Record<string, unknown>>(
  kind: BackupModel["kind"],
  importOrder: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  idOf: (row: T) => string,
): BackupModel {
  return {
    kind,
    scope: "global",
    importOrder,
    appliesTo: (c) => selected(c, kind),
    async *export(_config, ctx) {
      if (!ctx.scopePlan.includeGlobalReference) return;
      const rows = (await db.select().from(table)) as T[];
      for (const row of rows) {
        yield { kind, id: idOf(row), data: row };
      }
    },
  };
}

const voiceMetadataModel = referenceModel<{ id: string }>(
  "voice-metadata",
  30,
  voiceMetadata,
  (r) => r.id,
);
const voiceBlacklistModel = referenceModel<{
  voiceKey: string;
  language: string;
  accent: string;
}>(
  "voice-blacklist",
  31,
  voiceBlacklist,
  (r) => `${r.voiceKey}:${r.language}:${r.accent}`,
);
const voiceDescriptionModel = referenceModel<{ voiceKey: string }>(
  "voice-description",
  32,
  voiceDescriptions,
  (r) => r.voiceKey,
);
const suggestedToneModel = referenceModel<{ id: string }>(
  "suggested-tone",
  33,
  suggestedTones,
  (r) => r.id,
);
const instructionTemplateModel = referenceModel<{ id: string }>(
  "instruction-template",
  34,
  instructionTemplates,
  (r) => r.id,
);

// --- Redis ad models ---------------------------------------------------------

const adMetaModel: BackupModel = {
  kind: "ad-meta",
  scope: "per-ad",
  importOrder: 40,
  appliesTo: (c) => selected(c, "ad-meta"),
  async *export(_config, ctx) {
    const redis = getRedisV3();
    for (const adId of ctx.scopePlan.adIds) {
      const meta = await redis.get(AD_KEYS.meta(adId));
      if (meta != null) yield { kind: "ad-meta", id: adId, data: meta };
    }
  },
};

const versionModel: BackupModel = {
  kind: "version",
  scope: "per-ad",
  importOrder: 50,
  appliesTo: (c) => selected(c, "version"),
  async *export(_config, ctx) {
    const redis = getRedisV3();
    for (const adId of ctx.scopePlan.adIds) {
      for (const stream of STREAMS) {
        const ids = await redis.lrange(AD_KEYS.versions(adId, stream), 0, -1);
        const active = await redis.get<string>(AD_KEYS.active(adId, stream));
        const counter = await redis.get(AD_KEYS.counter(adId, stream));
        // Stream index (ordered ids + active pointer + counter) — reconstructs
        // the LIST/STRING keys on import even for streams with 0 blobs.
        if ((ids && ids.length) || active != null || counter != null) {
          yield {
            kind: "version",
            id: `${adId}:${stream}:__index`,
            data: { ids: ids ?? [], active: active ?? null, counter: counter ?? null },
            meta: { adId, stream, type: "index" },
          };
        }
        for (const versionId of ids ?? []) {
          const blob = await redis.get(AD_KEYS.version(adId, stream, versionId));
          if (blob != null) {
            yield {
              kind: "version",
              id: `${adId}:${stream}:${versionId}`,
              data: blob,
              meta: { adId, stream, versionId, type: "data" },
            };
          }
        }
      }
      // Legacy single-key mixer snapshot (only some ads).
      const legacyMixer = await redis.get(AD_KEYS.mixer(adId));
      if (legacyMixer != null) {
        yield {
          kind: "version",
          id: `${adId}:mixer:__legacy`,
          data: legacyMixer,
          meta: { adId, type: "legacy-mixer" },
        };
      }
    }
  },
};

const conversationModel: BackupModel = {
  kind: "conversation",
  scope: "per-ad",
  importOrder: 60,
  appliesTo: (c) => selected(c, "conversation"),
  async *export(_config, ctx) {
    const redis = getRedisV3();
    for (const adId of ctx.scopePlan.adIds) {
      const conv = await redis.get(CONVERSATION_KEYS.conversation(adId));
      if (conv != null) yield { kind: "conversation", id: adId, data: conv };
    }
  },
};

const previewModel: BackupModel = {
  kind: "preview",
  scope: "per-ad",
  importOrder: 61,
  appliesTo: (c) => selected(c, "preview"),
  async *export(_config, ctx) {
    const redis = getRedisV3();
    for (const adId of ctx.scopePlan.adIds) {
      const preview = await redis.get(AD_KEYS.preview(adId));
      if (preview != null) yield { kind: "preview", id: adId, data: preview };
    }
  },
};

/** All record models, sorted by import order. The `blob` model is not here —
 * blobs are discovered from emitted records and streamed by the orchestrator. */
export const REGISTRY: BackupModel[] = [
  serverSettingsModel,
  userModel,
  voiceMetadataModel,
  voiceBlacklistModel,
  voiceDescriptionModel,
  suggestedToneModel,
  instructionTemplateModel,
  adMetaModel,
  versionModel,
  conversationModel,
  previewModel,
].sort((a, b) => a.importOrder - b.importOrder);

/** Models that participate in this run (scope + subset filter). */
export function activeModels(
  config: ExportConfig,
  _ctx: ExportContext,
): BackupModel[] {
  return REGISTRY.filter((m) => m.appliesTo(config));
}
