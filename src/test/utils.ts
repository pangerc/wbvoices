/**
 * Test utilities
 * Helper functions for testing
 */

import RedisMock from "ioredis-mock";
import type { Redis } from "@upstash/redis";

/**
 * Create a mock Redis instance for testing
 * Uses ioredis-mock for in-memory Redis operations
 */
export function createMockRedis(): Redis {
  const mock = new RedisMock();

  // Wrap ioredis-mock to match Upstash Redis interface
  return {
    get: async (key: string) => {
      const value = await mock.get(key);
      return value;
    },
    set: async (
      key: string,
      value: string,
      opts?: { nx?: boolean; ex?: number },
    ) => {
      // Translate Upstash-style options to ioredis-mock's positional SET args.
      const extra: (string | number)[] = [];
      if (opts?.ex) extra.push("EX", opts.ex);
      if (opts?.nx) extra.push("NX");
      const result = extra.length
        ? await (
            mock as unknown as {
              set: (...args: unknown[]) => Promise<unknown>;
            }
          ).set(key, value, ...extra)
        : await mock.set(key, value);
      // ioredis-mock returns "OK" on success and null when NX blocks the set.
      return result === "OK" ? "OK" : result === null ? null : "OK";
    },
    del: async (...keys: string[]) => {
      return await mock.del(...keys);
    },
    eval: async (script: string, keys: string[], args: unknown[]) => {
      // Upstash-style eval(script, keys, args) → ioredis-mock positional form.
      return await (
        mock as unknown as {
          eval: (...args: unknown[]) => Promise<unknown>;
        }
      ).eval(script, keys.length, ...keys, ...args);
    },
    expire: async (key: string, seconds: number) => {
      return await mock.expire(key, seconds);
    },
    lpush: async (key: string, ...values: string[]) => {
      return await mock.lpush(key, ...values);
    },
    rpush: async (key: string, ...values: string[]) => {
      return await mock.rpush(key, ...values);
    },
    lrange: async (key: string, start: number, stop: number) => {
      return await mock.lrange(key, start, stop);
    },
    lrem: async (key: string, count: number, value: string) => {
      return await mock.lrem(key, count, value);
    },
    sadd: async (key: string, ...members: string[]) => {
      return await mock.sadd(key, ...members);
    },
    smembers: async (key: string) => {
      return await mock.smembers(key);
    },
    exists: async (...keys: string[]) => {
      return await mock.exists(...keys);
    },
    incr: async (key: string) => {
      return await mock.incr(key);
    },
    hset: async (key: string, fields: Record<string, string | number>) => {
      // Upstash-style hset(key, {a:1, b:2}) → ioredis-mock hset(key, "a", 1, "b", 2)
      const args: (string | number)[] = [];
      for (const [k, v] of Object.entries(fields)) {
        args.push(k, v);
      }
      return await (
        mock as unknown as {
          hset: (...a: unknown[]) => Promise<number>;
        }
      ).hset(key, ...args);
    },
    hget: async (key: string, field: string) => {
      return await mock.hget(key, field);
    },
    hgetall: async (key: string) => {
      return await mock.hgetall(key);
    },
    flushall: async () => {
      await mock.flushall();
      return "OK";
    },
  } as unknown as Redis;
}

/**
 * Create a mock Next.js request
 */
export function createMockRequest(
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    url?: string;
  } = {},
) {
  const {
    method = "GET",
    body = null,
    headers = {},
    url = "http://localhost:3003",
  } = options;

  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Wait for a promise to resolve with a timeout
 */
export async function waitFor<T>(
  fn: () => Promise<T>,
  options: { timeout?: number; interval?: number } = {},
): Promise<T> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      return await fn();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  throw new Error(`waitFor timed out after ${timeout}ms`);
}
