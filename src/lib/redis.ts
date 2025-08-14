import { Redis } from '@upstash/redis'

// Lazy initialization to ensure env vars are loaded
let redisInstance: Redis | null = null;

export function getRedis(): Redis {
  if (!redisInstance) {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    
    if (!url || !token) {
      console.error('❌ Redis environment variables missing:', {
        hasUrl: !!url,
        hasToken: !!token,
        env: process.env.NODE_ENV,
      });
      throw new Error('Redis configuration missing. Check KV_REST_API_URL and KV_REST_API_TOKEN');
    }
    
    console.log('🔧 Initializing Redis with:', {
      urlPrefix: url.substring(0, 30) + '...',
      hasToken: !!token,
    });
    
    redisInstance = new Redis({ url, token });
  }
  
  return redisInstance;
}

// Export a getter for backwards compatibility
export const redis = new Proxy({} as Redis, {
  get(_target, prop, receiver) {
    const instance = getRedis();
    return Reflect.get(instance, prop, receiver);
  }
});

// Project history key patterns
export const PROJECT_KEYS = {
  // Store project data: project:uuid -> Project
  project: (id: string) => `project:${id}`,
  
  // Store user's project list: user_projects:session_id -> string[] of project IDs
  userProjects: (sessionId: string) => `user_projects:${sessionId}`,
  
  // Store project metadata for quick listing: project_meta:uuid -> { id, headline, timestamp }
  projectMeta: (id: string) => `project_meta:${id}`,
} as const

// Note: getUserSessionId has been moved to client-side only (projectHistoryStore.ts)
// to avoid importing Redis on the client