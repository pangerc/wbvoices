import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';

// Use Node.js runtime for proper Redis access
// export const runtime = 'edge'; // REMOVED - Edge Runtime causes env var issues

/**
 * 🔥 NUCLEAR OPTION: BURN ALL DRAGON ARTIFACTS 🔥
 * This will scan and delete ALL keys matching our old patterns
 */
export async function DELETE() {
  try {
    const redis = getRedis();
    
    console.log('🔥 BEGINNING NUCLEAR CLEANSING OF DRAGON ARTIFACTS...');
    
    // Patterns to destroy
    const patterns = [
      'voice:*',           // Old individual voice keys
      'voices:*',          // Old voice index keys  
      'user_projects:*',   // Old user project lists
      'project:*',         // Old project data
      'project_meta:*',    // Old project metadata
      'voice_tower',       // Our towers (start fresh)
      'voice_data_tower',
      'counts_tower',
    ];
    
    let totalDeleted = 0;
    
    for (const pattern of patterns) {
      try {
        // Get all keys matching pattern
        const keys = await redis.keys(pattern);
        
        if (keys.length > 0) {
          console.log(`🔥 Found ${keys.length} keys matching "${pattern}"`);
          
          // Delete in batches to avoid overwhelming Redis
          const batchSize = 100;
          for (let i = 0; i < keys.length; i += batchSize) {
            const batch = keys.slice(i, i + batchSize);
            await redis.del(...batch);
            totalDeleted += batch.length;
            console.log(`   🔥 Deleted batch of ${batch.length} keys`);
          }
        } else {
          console.log(`   ✅ No keys found for "${pattern}"`);
        }
      } catch (err) {
        console.error(`❌ Failed to delete pattern "${pattern}":`, err);
      }
    }
    
    console.log(`🔥 NUCLEAR CLEANSING COMPLETE! Deleted ${totalDeleted} dragon artifacts!`);
    
    return NextResponse.json({
      success: true,
      message: `🔥 Nuclear cleansing complete! Burned ${totalDeleted} dragon artifacts to ash!`,
      deletedKeys: totalDeleted,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('💥 NUCLEAR CLEANSING FAILED:', error);
    
    return NextResponse.json({
      error: 'Nuclear cleansing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * GET: Preview what would be deleted (safe operation)
 */
export async function GET() {
  try {
    const redis = getRedis();
    
    const patterns = [
      'voice:*',
      'voices:*', 
      'user_projects:*',
      'project:*',
      'project_meta:*',
      'voice_tower',
      'voice_data_tower',
      'counts_tower',
    ];
    
    const preview: Record<string, number> = {};
    let total = 0;
    
    for (const pattern of patterns) {
      try {
        const keys = await redis.keys(pattern);
        preview[pattern] = keys.length;
        total += keys.length;
      } catch {
        preview[pattern] = -1; // Error indicator
      }
    }
    
    return NextResponse.json({
      message: `Found ${total} dragon artifacts ready for cleansing`,
      preview,
      totalKeys: total
    });
    
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to preview keys',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}