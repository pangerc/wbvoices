import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './db/schema';

// Lazy initialization to avoid connection errors at module load time
let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Create postgres client with serverless config
    const client = postgres(connectionString, {
      prepare: false,
      max: 1, // Single connection for serverless
    });

    // Create drizzle instance
    _db = drizzle(client, { schema });
  }

  return _db;
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop) {
    const instance = getDb();
    return instance[prop as keyof typeof instance];
  }
});
