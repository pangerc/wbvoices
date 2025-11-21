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
    set: async (key: string, value: string) => {
      await mock.set(key, value);
      return "OK";
    },
    del: async (...keys: string[]) => {
      return await mock.del(...keys);
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
    flushall: async () => {
      await mock.flushall();
      return "OK";
    },
  } as unknown as Redis;
}

/**
 * Create a mock Next.js request
 */
export function createMockRequest(options: {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  url?: string;
} = {}) {
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
  options: { timeout?: number; interval?: number } = {}
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
