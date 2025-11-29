// Quick test to verify database connection
import { db } from './src/lib/db';
import { voiceBlacklist } from './src/lib/db/schema';

async function testConnection() {
  try {
    console.log('Testing database connection...');

    // Try a simple query
    const result = await db.select().from(voiceBlacklist).limit(1);

    console.log('✅ Database connection successful!');
    console.log(`Found ${result.length} blacklist entries in database`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:');
    console.error(error);
    process.exit(1);
  }
}

testConnection();
