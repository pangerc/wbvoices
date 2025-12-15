import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getRedis } from "@/lib/redis";
import { getRedisV3 } from "@/lib/redis-v3";

function parseMonth(m: string | null): { start: number; end: number; label: string } {
  const now = new Date();
  let year: number;
  let month: number;

  if (m && /^\d{6}$/.test(m)) {
    year = parseInt(m.slice(0, 4), 10);
    month = parseInt(m.slice(4, 6), 10) - 1; // 0-indexed
  } else {
    year = now.getUTCFullYear();
    month = now.getUTCMonth();
  }

  const start = Date.UTC(year, month, 1);
  const end = Date.UTC(year, month + 1, 1);
  const label = `${year}-${String(month + 1).padStart(2, "0")}`;

  return { start, end, label };
}

export async function GET(request: NextRequest) {
  const m = request.nextUrl.searchParams.get("m");
  const { start, end, label } = parseMonth(m);

  const redisV2 = getRedis();
  const redisV3 = getRedisV3();

  // V3: Get ads from global index
  const adIds = (await redisV3.get<string[]>("ads:all")) || [];
  let v3Count = 0;
  for (const adId of adIds) {
    const meta = await redisV3.get<{ createdAt: number }>(`ad:${adId}:meta`);
    if (meta?.createdAt && meta.createdAt >= start && meta.createdAt < end) {
      v3Count++;
    }
  }

  // V2: Scan project_meta:* keys
  let cursor = 0;
  const metaKeys: string[] = [];
  do {
    const [next, keys] = await redisV2.scan(cursor, { match: "project_meta:*", count: 100 });
    cursor = Number(next);
    metaKeys.push(...keys);
  } while (cursor !== 0);

  let v2Count = 0;
  for (const key of metaKeys) {
    const meta = await redisV2.get<{ timestamp: number }>(key);
    if (meta?.timestamp && meta.timestamp >= start && meta.timestamp < end) {
      v2Count++;
    }
  }

  return NextResponse.json({
    month: label,
    v3: { total: adIds.length, inMonth: v3Count },
    v2: { total: metaKeys.length, inMonth: v2Count },
    combined: { inMonth: v3Count + v2Count },
  });
}
